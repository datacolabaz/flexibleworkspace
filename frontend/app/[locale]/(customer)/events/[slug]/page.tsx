'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RsvpModal } from '@/components/features/events/RsvpModal';
import type { EventRecord } from '@/lib/api-client/events';

const STATUS_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  rsvp_open: 'success',
  published: 'success',
  sold_out: 'error',
  cancelled: 'error',
  venue_pending: 'warning',
  draft: 'warning',
  completed: 'neutral',
  archived: 'neutral',
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('az', {
      timeZone: 'Asia/Baku',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Public event detail page — client component because we need to show
 * the RSVP modal state. Data is fetched client-side from the BFF route.
 */
export default function EventDetailPage() {
  const params = useParams<{ locale: string; slug: string }>();
  const t = useTranslations('eventDetail');
  const tCreate = useTranslations('eventCreate');

  const [event, setEvent] = useState<(EventRecord & { rsvpCount: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showRsvp, setShowRsvp] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/events/${params.slug}`, { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 404) setNotFound(true);
          return;
        }
        const data = await res.json() as EventRecord & { rsvpCount: number };
        if (!cancelled) setEvent(data);
      } catch {
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.slug]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (loading) {
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="text-text-muted">{'Yüklənir…'}</div>
      </main>
    );
  }

  if (notFound || !event) {
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="font-display text-h1 text-text-primary">{t('notFound')}</h1>
        <p className="mt-2 text-body text-text-secondary">{t('notFoundHint')}</p>
        <div className="mt-6">
          <Link href="/events" className="text-primary underline">{t('backToEvents')}</Link>
        </div>
      </main>
    );
  }

  const statusVariant = STATUS_BADGE_VARIANT[event.status] ?? 'default';
  const canRsvp = event.status === 'rsvp_open' || event.status === 'published';
  const remaining =
    event.capacity !== null ? event.capacity - (event.rsvpCount ?? 0) : null;

  return (
    <>
      {showRsvp && (
        <RsvpModal
          eventId={event.id}
          onClose={() => setShowRsvp(false)}
        />
      )}

      <main id="main-content">
        {/* Cover image */}
        {event.coverImage && (
          <div className="h-72 w-full overflow-hidden bg-surface-elevated sm:h-96">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.coverImage}
              alt={event.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="lg:grid lg:grid-cols-3 lg:gap-10">
            {/* Main content */}
            <div className="lg:col-span-2">
              {/* Title row */}
              <div className="flex flex-wrap items-start gap-3">
                <h1 className="flex-1 font-display text-[32px] font-semibold leading-tight text-text-primary sm:text-[40px]">
                  {event.title}
                </h1>
              </div>

              {/* Badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="neutral">{tCreate(`formatOptions.${event.format}`)}</Badge>
                <Badge variant={statusVariant}>{t(`status.${event.status}`)}</Badge>
                <Badge variant="accent">{t('free')}</Badge>
              </div>

              {/* Date & time */}
              <div className="mt-6 space-y-2">
                <div className="flex items-start gap-2 text-body text-text-secondary">
                  <span className="mt-0.5 shrink-0">📅</span>
                  <span>{formatDateTime(event.startAt)} — {formatDateTime(event.endAt)}</span>
                </div>
                {event.doorsOpenAt && (
                  <div className="flex items-start gap-2 text-small text-text-muted">
                    <span className="mt-0.5 shrink-0">🚪</span>
                    <span>{t('doorsOpen')}: {formatDateTime(event.doorsOpenAt)}</span>
                  </div>
                )}
                {event.rsvpDeadline && (
                  <div className="flex items-start gap-2 text-small text-text-muted">
                    <span className="mt-0.5 shrink-0">⏰</span>
                    <span>{t('rsvpDeadline')}: {formatDateTime(event.rsvpDeadline)}</span>
                  </div>
                )}
              </div>

              {/* Venue */}
              <div className="mt-4">
                <h3 className="text-label font-semibold text-text-primary">{t('locationTitle')}</h3>
                <p className="mt-1 text-body text-text-secondary">
                  {event.eventLocations && event.eventLocations.length > 0
                    ? `Location #${event.eventLocations[0].locationId ?? '—'}`
                    : t('noLocation')}
                </p>
              </div>

              {/* Description */}
              {event.description && (
                <div className="mt-6">
                  <p className="whitespace-pre-wrap text-body text-text-primary">{event.description}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="mt-8 lg:mt-0">
              <div className="sticky top-24 rounded-xl border border-border bg-surface p-5 shadow-sm">
                {/* Remaining seats */}
                {remaining !== null && (
                  <p className="mb-3 text-label font-semibold text-text-primary">
                    {t('remainingSeats', { remaining: Math.max(0, remaining) })}
                  </p>
                )}

                {/* RSVP button */}
                {canRsvp && event.status !== 'sold_out' && (
                  <Button fullWidth onClick={() => setShowRsvp(true)}>
                    {t('rsvpButtonLabel')}
                  </Button>
                )}
                {event.status === 'sold_out' && (
                  <Button fullWidth disabled>
                    {t('rsvpSoldOut')}
                  </Button>
                )}
                {event.status === 'cancelled' && (
                  <Button fullWidth disabled variant="secondary">
                    {t('rsvpCancelled')}
                  </Button>
                )}

                {/* Share */}
                <button
                  type="button"
                  onClick={handleShare}
                  className="mt-3 w-full rounded-md border border-border px-4 py-2.5 text-label font-semibold text-text-secondary transition-colors hover:bg-surface-elevated"
                >
                  {linkCopied ? t('linkCopied') : t('shareButton')}
                </button>

                {/* Organizer */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-small font-semibold text-text-muted">{t('organizer')}</p>
                  <p className="mt-1 text-body text-text-primary">{event.organizerId}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
