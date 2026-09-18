/**
 * Money is ALWAYS an integer in the currency's minor unit (qəpik for AZN)
 * plus a separate ISO 4217 currency code — never a float
 * (10_DATABASE_SCHEMA.md §10.2). These helpers are the only place formatting
 * happens so the rule can't be silently violated by ad hoc `amount / 100`
 * scattered through the codebase.
 */
export interface Money {
  amount: number; // integer, minor units
  currency: string; // ISO 4217, e.g. 'AZN'
}

export function money(amount: number, currency = 'AZN'): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(
      `Money amount must be an integer (minor units); received ${amount}`,
    );
  }
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot add different currencies: ${a.currency} vs ${b.currency}`,
    );
  }
  return money(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot subtract different currencies: ${a.currency} vs ${b.currency}`,
    );
  }
  return money(a.amount - b.amount, a.currency);
}

export function multiplyMoney(a: Money, factor: number): Money {
  return money(Math.round(a.amount * factor), a.currency);
}

export function percentageOf(a: Money, percentage: number): Money {
  return money(Math.round((a.amount * percentage) / 100), a.currency);
}

/** Formats minor units as a human-readable major-unit string, e.g. 8300 -> "83.00" */
export function formatMajorUnits(m: Money): string {
  return (m.amount / 100).toFixed(2);
}
