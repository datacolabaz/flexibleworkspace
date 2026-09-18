import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { LocationWithCoords } from './entities/location.entity';
import { LocationInputDto } from './dto/location-input.dto';
import { ProvidersService } from '../providers/providers.service';
import {
  ProviderPlanTier,
  PLAN_LOCATION_LIMITS,
} from '../../common/constants/provider.enum';
import {
  DomainException,
  PlanLimitReachedException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

/**
 * All reads/writes touching `location.geo` (a PostGIS GEOGRAPHY(Point,4326)
 * column) go through raw SQL, never TypeORM's repository API — see the
 * comment on LocationEntity for why. 10_DATABASE_SCHEMA.md §10.1.
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly providersService: ProvidersService,
  ) {}

  private mapRow(row: any): LocationWithCoords {
    return {
      id: row.id,
      providerId: row.provider_id,
      name: row.name,
      addressLine: row.address_line,
      city: row.city,
      district: row.district,
      countryCode: row.country_code,
      timezone: row.timezone,
      openingHours: row.opening_hours,
      lat: Number(row.lat),
      lng: Number(row.lng),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(
    providerId: string,
    dto: LocationInputDto,
  ): Promise<LocationWithCoords> {
    // Ownership/eligibility: the provider must exist and not be REJECTED —
    // a PENDING provider may still configure locations/rooms before review
    // completes (09_DOMAIN_MODEL.md §9.2 Room lifecycle gates ACTIVE, not editing).
    const provider = await this.providersService.findById(providerId);
    if (provider.verificationStatus === 'REJECTED') {
      throw new DomainException(
        'PROVIDER_REJECTED',
        'A rejected provider account cannot add locations.',
        HttpStatus.FORBIDDEN,
      );
    }

    const limit = PLAN_LOCATION_LIMITS[provider.planTier as ProviderPlanTier];
    const [{ count }] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM location WHERE provider_id = $1 AND deleted_at IS NULL`,
      [providerId],
    );
    if (count >= limit) {
      throw new PlanLimitReachedException('locations', {
        limit,
        planTier: provider.planTier,
      });
    }

    const rows = await this.dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, district, country_code, geo, timezone, opening_hours, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, $10, now(), now())
       RETURNING id, provider_id, name, address_line, city, district, country_code, timezone, opening_hours,
                 ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lng, created_at, updated_at`,
      [
        providerId,
        dto.name,
        dto.addressLine,
        dto.city,
        dto.district ?? null,
        dto.countryCode ?? 'AZ',
        dto.lng,
        dto.lat,
        dto.timezone ?? 'Asia/Baku',
        dto.openingHours ? JSON.stringify(dto.openingHours) : null,
      ],
    );
    return this.mapRow(rows[0]);
  }

  async findById(id: string): Promise<LocationWithCoords> {
    const rows = await this.dataSource.query(
      `SELECT id, provider_id, name, address_line, city, district, country_code, timezone, opening_hours,
              ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lng, created_at, updated_at
       FROM location WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (rows.length === 0) throw new ResourceNotFoundException('Location');
    return this.mapRow(rows[0]);
  }

  async listByProvider(providerId: string): Promise<LocationWithCoords[]> {
    const rows = await this.dataSource.query(
      `SELECT id, provider_id, name, address_line, city, district, country_code, timezone, opening_hours,
              ST_Y(geo::geometry) AS lat, ST_X(geo::geometry) AS lng, created_at, updated_at
       FROM location WHERE provider_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [providerId],
    );
    return rows.map((r: any) => this.mapRow(r));
  }

  /** Ownership check: only the owning provider may update its own location. */
  async update(
    id: string,
    callerProviderId: string,
    dto: LocationInputDto,
  ): Promise<LocationWithCoords> {
    const existing = await this.findById(id);
    if (existing.providerId !== callerProviderId) {
      // Same pattern as 11_API_CONTRACTS.md §11.4's customer ownership checks:
      // a crafted request for someone else's resource returns 404, not 403,
      // so it can't be used to probe which IDs exist.
      throw new ResourceNotFoundException('Location');
    }

    await this.dataSource.query(
      `UPDATE location SET
         name = $1, address_line = $2, city = $3, district = $4, country_code = $5,
         geo = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
         timezone = $8, opening_hours = $9, updated_at = now()
       WHERE id = $10`,
      [
        dto.name,
        dto.addressLine,
        dto.city,
        dto.district ?? null,
        dto.countryCode ?? 'AZ',
        dto.lng,
        dto.lat,
        dto.timezone ?? 'Asia/Baku',
        dto.openingHours ? JSON.stringify(dto.openingHours) : null,
        id,
      ],
    );
    return this.findById(id);
  }
}
