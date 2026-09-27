import { ALLOWED_ANALYTICS_EVENTS } from './allowed-events';

describe('analytics allowlist', () => {
  it('accepts compare funnel events', () => {
    expect(ALLOWED_ANALYTICS_EVENTS.has('compare_added')).toBe(true);
    expect(ALLOWED_ANALYTICS_EVENTS.has('compare_removed')).toBe(true);
    expect(ALLOWED_ANALYTICS_EVENTS.has('compare_viewed')).toBe(true);
    expect(ALLOWED_ANALYTICS_EVENTS.has('compare_booking_started')).toBe(true);
    expect(ALLOWED_ANALYTICS_EVENTS.has('booking_started')).toBe(true);
  });
});
