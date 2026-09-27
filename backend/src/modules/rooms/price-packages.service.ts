import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoomPricePackageEntity } from './entities/room-price-package.entity';
import { RoomEntity } from './entities/room.entity';
import { UpsertPricePackageDto } from './dto/price-package.dto';
import { PriceType, PriceUnitType } from '../../common/constants/pricing.enum';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

@Injectable()
export class PricePackagesService {
  constructor(
    @InjectRepository(RoomPricePackageEntity)
    private readonly packageRepo: Repository<RoomPricePackageEntity>,
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  private async assertOwned(roomId: string, providerId: string): Promise<void> {
    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['location'],
    });
    if (!room || room.deletedAt || room.location.providerId !== providerId) {
      throw new ResourceNotFoundException('Room');
    }
  }

  async listForProvider(
    roomId: string,
    providerId: string,
  ): Promise<RoomPricePackageEntity[]> {
    await this.assertOwned(roomId, providerId);
    return this.packageRepo.find({
      where: { roomId },
      order: { unitType: 'ASC' },
    });
  }

  async replaceForProvider(
    roomId: string,
    providerId: string,
    packages: UpsertPricePackageDto[],
  ): Promise<RoomPricePackageEntity[]> {
    await this.assertOwned(roomId, providerId);
    const seen = new Set<string>();
    for (const pkg of packages) {
      if (seen.has(pkg.unitType)) {
        throw new DomainException(
          'DUPLICATE_PRICE_UNIT',
          'Each unit type can only appear once.',
          HttpStatus.BAD_REQUEST,
        );
      }
      seen.add(pkg.unitType);
      if (
        (pkg.priceType === PriceType.EXACT ||
          pkg.priceType === PriceType.FROM) &&
        (pkg.amount == null || pkg.amount <= 0)
      ) {
        throw new DomainException(
          'PRICE_AMOUNT_REQUIRED',
          'EXACT and FROM packages need a positive amount.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.packageRepo.delete({ roomId });
    const now = new Date();
    const rows = packages.map((pkg) =>
      this.packageRepo.create({
        roomId,
        unitType: pkg.unitType,
        amount:
          pkg.amount != null && pkg.priceType !== PriceType.NOT_AVAILABLE
            ? String(pkg.amount)
            : null,
        currency: (pkg.currency || 'AZN').toUpperCase(),
        minDuration: pkg.minDuration ?? null,
        maxDuration: pkg.maxDuration ?? null,
        billingUnit: pkg.unitType,
        taxIncluded: pkg.taxIncluded ?? true,
        active: pkg.active ?? true,
        validFrom: pkg.validFrom ? new Date(pkg.validFrom) : null,
        validUntil: pkg.validUntil ? new Date(pkg.validUntil) : null,
        lastUpdatedAt: now,
        priceType: pkg.priceType,
        notes: pkg.notes ?? null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    if (rows.length === 0) return [];
    return this.packageRepo.save(rows);
  }

  async syncHourlyFromBasePrice(
    roomId: string,
    amountMinor: number,
    currency: string,
  ): Promise<void> {
    const now = new Date();
    const existing = await this.packageRepo.findOne({
      where: { roomId, unitType: PriceUnitType.HOURLY },
    });
    if (existing) {
      existing.amount = String(amountMinor);
      existing.currency = currency || 'AZN';
      existing.priceType = PriceType.EXACT;
      existing.active = true;
      existing.lastUpdatedAt = now;
      existing.updatedAt = now;
      await this.packageRepo.save(existing);
      return;
    }
    await this.packageRepo.save(
      this.packageRepo.create({
        roomId,
        unitType: PriceUnitType.HOURLY,
        amount: String(amountMinor),
        currency: currency || 'AZN',
        billingUnit: PriceUnitType.HOURLY,
        taxIncluded: true,
        active: true,
        validFrom: null,
        validUntil: null,
        lastUpdatedAt: now,
        priceType: PriceType.EXACT,
        notes: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
}
