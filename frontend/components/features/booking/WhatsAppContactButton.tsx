'use client';

import { track, AnalyticsEvent } from '@/lib/analytics/track';

export function WhatsAppContactButton({
  href,
  label,
  bookingId,
}: {
  href: string;
  label: string;
  bookingId?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
      onClick={() =>
        track(AnalyticsEvent.WhatsappContactClicked, {
          booking_id: bookingId,
        })
      }
    >
      {label}
    </a>
  );
}
