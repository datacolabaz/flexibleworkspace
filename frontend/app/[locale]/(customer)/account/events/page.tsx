import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { readSession } from '@/lib/auth/session';
import { getMyEvents } from '@/lib/api-client/events';
import { Badge } from '@/components/ui/Badge';
import type { BadgeVariant } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/LinkButton';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'neutral',
  venue_pending: 'warning',
  published: 'success',
  rsvp_open: 'success',
  sold_out: 'error',
  completed: 'neutral',
  cancelled: 'error',
  archived: 'neutral',
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('az', {
      timeZone: 'Asia/Baku',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AccountEventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account.events');

  const store = await cookies();
  const { accessToken } = readSession(store);

  let events: Awaited<ReturnType<typeof getMyEvents>> = [];
  let loadError = false;

  if (accessToken) {
    try {
      events = await getMyEvents(accessToken);
    } catch {
      loadError = true;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-h2 text-text-primary">{t('pageTitle')}</h2>
        <LinkButton href="/events/create" size="sm">
          {t('emptyCta')}
        </LinkButton>
      </div>

      {loadError && (
        <p className="mt-4 text-body text-error">{t('loadError')}</p>
      )}

      {!loadError && events.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-body text-text-secondary">{t('emptyTitle')}</p>
          <div className="mt-4">
            <LinkButton href="/events/create">{t('emptyCta')}</LinkButton>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text-primary truncate">{event.title}</span>
                  <Badge variant={STATUS_VARIANT[event.status] ?? 'neutral'}>
                    {t(`status.${event.status}`)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-small text-text-muted">{formatDate(event.startAt)}</p>
                <p className="text-small text-text-muted">
                  {event.capacity !== null
                    ? t('rsvpCount', { count: event.rsvpCount ?? 0, capacity: event.capacity })
                    : t('rsvpCountUnlimited', { count: event.rsvpCount ?? 0 })}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/events/${event.slug}`}
                  className="rounded-md border border-border px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-surface-elevated"
                >
                  {t('viewCta')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
