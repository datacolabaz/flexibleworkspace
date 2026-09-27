export enum PriceUnitType {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM_QUOTE = 'CUSTOM_QUOTE',
}

export enum PriceType {
  EXACT = 'EXACT',
  FROM = 'FROM',
  REQUEST = 'REQUEST',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
}

export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  PARTIALLY_AVAILABLE = 'PARTIALLY_AVAILABLE',
  REQUEST_CONFIRMATION = 'REQUEST_CONFIRMATION',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

export const PRICE_UNIT_TYPES = Object.values(PriceUnitType);
export const BILLABLE_UNIT_TYPES = [
  PriceUnitType.HOURLY,
  PriceUnitType.DAILY,
  PriceUnitType.WEEKLY,
  PriceUnitType.MONTHLY,
] as const;

/** Prefer this order when picking a card's primary published price. Never convert. */
export const PRIMARY_PRICE_UNIT_ORDER = [
  PriceUnitType.HOURLY,
  PriceUnitType.DAILY,
  PriceUnitType.WEEKLY,
  PriceUnitType.MONTHLY,
] as const;
