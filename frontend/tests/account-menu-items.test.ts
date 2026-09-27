import { describe, expect, it } from 'vitest';
import { getAccountMenuItems } from '@/components/features/navigation/account-menu-items';

describe('getAccountMenuItems', () => {
  it('keeps customer bookings on /account/bookings for every resolved role', () => {
    for (const state of [true, false, undefined] as const) {
      const bookings = getAccountMenuItems(state).find((item) => item.labelKey === 'menuMyBookings');
      expect(bookings?.href).toBe('/account/bookings');
    }
  });

  it('uses /provider hash anchors rather than /provider/analytics or /provider/payouts routes', () => {
    const hrefs = getAccountMenuItems(true).map((item) => item.href);
    expect(hrefs).toContain('/provider');
    expect(hrefs).toContain('/provider#provider-analytics');
    expect(hrefs).toContain('/provider#provider-payouts');
    expect(hrefs).toContain('/provider#provider-rooms');
    expect(hrefs.some((href) => href === '/provider/analytics' || href === '/provider/payouts')).toBe(false);
  });

  it('keeps organizer events on /account/events', () => {
    expect(getAccountMenuItems(false).find((item) => item.labelKey === 'menuMyEvents')?.href).toBe('/account/events');
  });
});
