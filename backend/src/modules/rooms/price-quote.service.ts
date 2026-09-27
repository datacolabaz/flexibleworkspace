import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  PriceType,
  PriceUnitType,
} from '../../common/constants/pricing.enum';

export interface PriceQuote {
  roomId: string;
  unitType: PriceUnitType;
  priceType: PriceType;
  amount: number | null;
  currency: string;
  quantity: number;
  lastUpdatedAt: string | null;
  staleDays: number | null;
  staleWarning: 'none' | 'stale_30d' | 'stale_90d';
  notes: string | null;
}

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

function staleWarning(lastUpdatedAt: Date | null): {
  staleDays: number | null;
  staleWarning: PriceQuote['staleWarning'];
} {
  if (!lastUpdatedAt) return { staleDays: null, staleWarning: 'none' };
  const staleDays = Math.floor(
    (Date.now() - lastUpdatedAt.getTime()) / MS_DAY,
  );
  if (staleDays >= 90) return { staleDays, staleWarning: 'stale_90d' };
  if (staleDays >= 30) return { staleDays, staleWarning: 'stale_30d' };
  return { staleDays, staleWarning: 'none' };
}

function requiredUnitForDurationMs(durationMs: number): PriceUnitType {
  const hours = durationMs / MS_HOUR;
  const days = durationMs / MS_DAY;
  if (days >= 30) return PriceUnitType.MONTHLY;
  if (days >= 7) return PriceUnitType.WEEKLY;
  if (hours >= 8) return PriceUnitType.DAILY;
  return PriceUnitType.HOURLY;
}

function quantityFor(unit: PriceUnitType, durationMs: number): number {
  const hours = durationMs / MS_HOUR;
  const days = durationMs / MS_DAY;
  if (unit === PriceUnitType.HOURLY) return hours;
  if (unit === PriceUnitType.DAILY) return Math.max(1, Math.round(days) || 1);
  if (unit === PriceUnitType.WEEKLY)
    return Math.max(1, Math.round(days / 7) || 1);
  if (unit === PriceUnitType.MONTHLY)
    return Math.max(1, Math.round(days / 30) || 1);
  return 1;
}

function packageIsLive(row: {
  active: boolean;
  valid_from: Date | null;
  valid_until: Date | null;
}): boolean {
  if (!row.active) return false;
  const now = Date.now();
  if (row.valid_from && new Date(row.valid_from).getTime() > now) return false;
  if (row.valid_until && new Date(row.valid_until).getTime() < now) return false;
  return true;
}

/**
 * Server-side listing quotes. Never synthesizes DAILY/WEEKLY/MONTHLY from
 * an HOURLY amount. Missing package → REQUEST (CUSTOM_QUOTE) or NOT_AVAILABLE.
 */
@Injectable()
export class PriceQuoteService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async quote(roomId: string, startAt: Date, endAt: Date): Promise<PriceQuote> {
    const durationMs = endAt.getTime() - startAt.getTime();
    const unitType = requiredUnitForDurationMs(durationMs);
    const packages = await this.listLivePackages(roomId);
    const match = packages.find((p) => p.unit_type === unitType);
    const custom = packages.find(
      (p) => p.unit_type === PriceUnitType.CUSTOM_QUOTE,
    );

    if (!match) {
      if (custom && custom.price_type === PriceType.REQUEST) {
        const stale = staleWarning(
          custom.last_updated_at ? new Date(custom.last_updated_at) : null,
        );
        return {
          roomId,
          unitType: PriceUnitType.CUSTOM_QUOTE,
          priceType: PriceType.REQUEST,
          amount: custom.amount != null ? Number(custom.amount) : null,
          currency: custom.currency || 'AZN',
          quantity: 1,
          lastUpdatedAt: custom.last_updated_at
            ? new Date(custom.last_updated_at).toISOString()
            : null,
          ...stale,
          notes: custom.notes,
        };
      }
      if (unitType === PriceUnitType.HOURLY) {
        const legacy = await this.legacyHourly(roomId);
        if (legacy && legacy.amount != null) {
          const quantity = quantityFor(PriceUnitType.HOURLY, durationMs);
          return {
            ...legacy,
            quantity,
            amount: Math.round(legacy.amount * quantity),
          };
        }
      }
      return {
        roomId,
        unitType,
        priceType: PriceType.NOT_AVAILABLE,
        amount: null,
        currency: 'AZN',
        quantity: 0,
        lastUpdatedAt: null,
        staleDays: null,
        staleWarning: 'none',
        notes: null,
      };
    }

    const quantity = quantityFor(unitType, durationMs);
    const stale = staleWarning(
      match.last_updated_at ? new Date(match.last_updated_at) : null,
    );
    const unitAmount = match.amount != null ? Number(match.amount) : null;
    const priceType = match.price_type as PriceType;
    const amount =
      unitAmount != null &&
      (priceType === PriceType.EXACT || priceType === PriceType.FROM)
        ? Math.round(unitAmount * quantity)
        : unitAmount;

    return {
      roomId,
      unitType,
      priceType,
      amount,
      currency: match.currency || 'AZN',
      quantity,
      lastUpdatedAt: match.last_updated_at
        ? new Date(match.last_updated_at).toISOString()
        : null,
      ...stale,
      notes: match.notes,
    };
  }

  async listLivePackages(roomId: string): Promise<
    {
      unit_type: PriceUnitType;
      amount: string | null;
      currency: string;
      price_type: string;
      last_updated_at: Date | string | null;
      notes: string | null;
      active: boolean;
      valid_from: Date | null;
      valid_until: Date | null;
    }[]
  > {
    const rows = await this.dataSource.query(
      `SELECT unit_type, amount, currency, price_type, last_updated_at, notes, active, valid_from, valid_until
       FROM room_price_package WHERE room_id = $1`,
      [roomId],
    );
    return rows.filter((row: any) => packageIsLive(row));
  }

  private async legacyHourly(roomId: string): Promise<PriceQuote | null> {
    const [room] = await this.dataSource.query(
      `SELECT base_price_amount, base_price_currency, updated_at
       FROM room WHERE id = $1 AND deleted_at IS NULL`,
      [roomId],
    );
    if (!room || room.base_price_amount == null) return null;
    const amount = Number(room.base_price_amount);
    if (!(amount > 0)) return null;
    const stale = staleWarning(room.updated_at ? new Date(room.updated_at) : null);
    return {
      roomId,
      unitType: PriceUnitType.HOURLY,
      priceType: PriceType.EXACT,
      amount,
      currency: room.base_price_currency || 'AZN',
      quantity: 1,
      lastUpdatedAt: room.updated_at
        ? new Date(room.updated_at).toISOString()
        : null,
      ...stale,
      notes: null,
    };
  }
}
