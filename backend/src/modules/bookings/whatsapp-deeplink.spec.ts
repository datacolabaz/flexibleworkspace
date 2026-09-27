import {
  buildWhatsAppDeepLink,
  formatConfirmedBookingWhatsAppText,
} from './whatsapp-deeplink';

describe('whatsapp-deeplink', () => {
  it('builds a wa.me URL with AZ confirmation text', () => {
    const text = formatConfirmedBookingWhatsAppText({
      locationName: 'Nizami Loft',
      startAt: new Date('2026-10-01T09:00:00.000Z'),
      bookingCode: 'ABCDEF12',
    });
    expect(text).toContain('Nizami Loft');
    expect(text).toContain('ABCDEF12');
    expect(text.startsWith('Salam, Spotva-da')).toBe(true);
    const url = buildWhatsAppDeepLink('+994 50 123 45 67', text);
    expect(url).toMatch(/^https:\/\/wa\.me\/994501234567\?text=/);
  });

  it('returns null for a missing/short number', () => {
    expect(buildWhatsAppDeepLink('', 'hi')).toBeNull();
    expect(buildWhatsAppDeepLink('123', 'hi')).toBeNull();
  });
});
