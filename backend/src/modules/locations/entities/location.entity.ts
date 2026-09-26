import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProviderEntity } from '../../providers/entities/provider.entity';

/**
 * Maps to the `location` table (28_DATABASE_DDL.sql §4). The PostGIS
 * `geo GEOGRAPHY(Point,4326)` column is deliberately NOT declared here —
 * TypeORM has no clean way to read/write a geography value as a JS
 * property, and this table's `geo` column is NOT NULL, so every write
 * that touches it goes through raw SQL in LocationsService (ST_MakePoint/
 * ST_X/ST_Y), never repository.save(). This mirrors the same "TypeORM
 * describes what it can, raw SQL handles what it can't" split already
 * established for the booking_item exclusion constraint (27_ADRS.md ADR-009).
 */
@Entity({ name: 'location' })
export class LocationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @ManyToOne(() => ProviderEntity, (provider) => provider.locations)
  @JoinColumn({ name: 'provider_id' })
  provider: ProviderEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'address_line', type: 'varchar', length: 500 })
  addressLine: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, default: 'AZ' })
  countryCode: string;

  @Column({ name: 'formatted_address', type: 'text', nullable: true })
  formattedAddress: string | null;

  @Column({
    name: 'google_place_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  googlePlaceId: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Baku' })
  timezone: string;

  @Column({ name: 'opening_hours', type: 'jsonb', nullable: true })
  openingHours: Record<string, unknown> | null;

  /** Optional nearest Baku Metro station (P2 slice). */
  @Column({ name: 'nearest_metro_station_id', type: 'uuid', nullable: true })
  nearestMetroStationId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

/** Shape returned by LocationsService's raw-SQL reads, which add lat/lng. */
export interface LocationWithCoords {
  id: string;
  providerId: string;
  name: string;
  addressLine: string;
  city: string;
  district: string | null;
  countryCode: string;
  timezone: string;
  openingHours: Record<string, unknown> | null;
  nearestMetroStationId: string | null;
  lat: number;
  lng: number;
  createdAt: Date;
  updatedAt: Date;
}
