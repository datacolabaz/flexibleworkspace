import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { LinkButton } from '@/components/ui/LinkButton';
import { listPublicEvents } from '@/lib/api-client/events';

const FORMATS = ['workshop', 'training', 'seminar', 'podcast', 'community', 'corporate'] as const;
const STEPS = ['venue', 'publish', 'manage'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'eventsPage' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('eventsPage');

  // Try to load published events for the list section
  let publishedEvents: Awaited<ReturnType<typeof listPublicEvents>> | null = null;
  try {
    publishedEvents = await listPublicEvents({ limit: 12 });
  } catch {
    publishedEvents = null;
  }

  return (
    <main id="main-content">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <span className="rounded-full bg-surface-elevated px-3 py-1 text-caption font-semibold text-primary">{t('badge')}</span>
          <h1 className="mt-6 max-w-4xl font-display text-[44px] font-semibold leading-tight text-text-primary sm:text-[64px]">{t('title')}</h1>
          <p className="mt-6 max-w-2xl text-body text-text-secondary sm:text-xl">{t('subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/events/create">{t('createEventCta')}</LinkButton>
            <LinkButton href="/search?roomType=room_type.event_space" variant="secondary">{t('venueCta')}</LinkButton>
          </div>
          {/* Moved up from the bottom of the page (was easy to miss below
           * two full sections of confident feature copy) and reworded to
           * name the gap explicitly — a provider flagged that "Dərc et"/
           * "İdarə et" below read as live features (paid tickets, QR
           * check-in) when none of that exists yet; only venue search and
           * provider signup are real today. */}
          <p className="mt-6 max-w-2xl rounded-md bg-info-bg p-4 text-small text-info">{t('betaNote')}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-h2 text-text-primary">{t('formatsTitle')}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((format, index) => (
            <article key={format} className="min-h-44 bg-surface p-6">
              <span className="text-caption font-semibold text-primary">0{index + 1}</span>
              <h3 className="mt-5 font-display text-h3 text-text-primary">{t(`formats.${format}.title`)}</h3>
              <p className="mt-2 text-small text-text-secondary">{t(`formats.${format}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-h2 text-text-primary">{t('flowTitle')}</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="border-t-2 border-primary pt-5">
                <span className="text-caption font-semibold text-text-muted">0{index + 1}</span>
                <h3 className="mt-4 font-display text-h3 text-text-primary">{t(`flow.${step}.title`)}</h3>
                <p className="mt-2 text-small text-text-secondary">{t(`flow.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Live events list ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-h2 text-text-primary">{t('listTitle')}</h2>
          <LinkButton href="/events/create" size="sm">{t('createEventCta')}</LinkButton>
        </div>

        {publishedEvents === null ? (
          <p className="mt-6 text-body text-error">{t('loadError')}</p>
        ) : publishedEvents.items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-body text-text-secondary">{t('listEmpty')}</p>
            <p className="mt-1 text-small text-text-muted">{t('listEmptyHint')}</p>
            <div className="mt-4">
              <Link href="/events/create" className="font-semibold text-primary underline">
                {t('createEventCta')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {publishedEvents.items.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-md"
              >
                {event.coverImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.coverImage}
                    alt={event.title}
                    className="h-44 w-full object-cover"
                  />
                )}
                {!event.coverImage && (
                  <div className="flex h-44 items-center justify-center bg-surface-elevated text-3xl">
                    📅
                  </div>
                )}
                <div className="p-4">
                  <p className="text-caption font-semibold text-primary">
                    {new Intl.DateTimeFormat('az', {
                      timeZone: 'Asia/Baku',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(event.startAt))}
                  </p>
                  <h3 className="mt-1 font-display text-h3 text-text-primary group-hover:text-primary">
                    {event.title}
                  </h3>
                  <p className="mt-1 text-small text-text-secondary line-clamp-2">
                    {event.shortDescription}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
