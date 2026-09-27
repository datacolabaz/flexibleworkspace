/**
 * Customer WhatsApp deep-link only. Messages are never stored; this is URL
 * generation for wa.me, not a chat/inbox.
 */
export function digitsOnlyPhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function buildWhatsAppDeepLink(
  phone: string,
  text: string,
): string | null {
  const digits = digitsOnlyPhone(phone);
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function formatConfirmedBookingWhatsAppText(params: {
  locationName: string;
  startAt: Date;
  bookingCode: string;
}): string {
  const when = new Intl.DateTimeFormat('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(params.startAt);
  return `Salam, Spotva-da ${params.locationName} üçün ${when} üzrə rezervasiyam təsdiqlənib. Rezervasiya kodu: ${params.bookingCode}`;
}
