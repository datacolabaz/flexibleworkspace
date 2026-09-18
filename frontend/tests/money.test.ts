import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/format/money';

describe('formatMoney', () => {
  it('divides minor units (qəpik) by 100 for AZN', () => {
    // 3000 qəpik = 30 AZN. Currency symbol placement is locale-dependent,
    // so this asserts on the numeric substring rather than the full
    // formatted string.
    expect(formatMoney(3000, 'AZN', 'en')).toContain('30');
    expect(formatMoney(3000, 'AZN', 'en')).not.toContain('3,000');
  });

  it('rounds to whole currency units (no fractional qəpik in the UI)', () => {
    const result = formatMoney(2550, 'AZN', 'en');
    expect(result).not.toMatch(/\.\d/);
  });

  it('formats the same amount differently per locale', () => {
    const en = formatMoney(150000, 'AZN', 'en');
    const az = formatMoney(150000, 'AZN', 'az');
    // Both represent 1500 AZN, but Intl.NumberFormat's grouping/symbol
    // placement differs by locale — just confirm they're not identical
    // strings while carrying the same digits.
    expect(en).toContain('1,500');
    expect(en).not.toBe(az);
  });
});
