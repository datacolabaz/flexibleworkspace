import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { HomeSearchForm } from '@/components/features/search/HomeSearchForm';
import { LinkButton } from '@/components/ui/LinkButton';
import { getFeaturedRooms } from '@/lib/api-client/featured';
import { roomTypeKeyFromTranslationKey } from '@/lib/constants/taxonomy';
import { formatMoney } from '@/lib/format/money';

const UPCOMING_FORMATS = [
  { key: 'workshop', image: '/home/workshop-space.webp', href: '/search?roomType=room_type.workshop_space' },
  { key: 'event', image: '/home/event-hall.webp', href: '/events' },
  { key: 'podcast', image: '/home/podcast-studio.webp', href: '/search?roomType=room_type.podcast_studio' },
] as const;

const PATH_STEPS = ['discover', 'book', 'grow'] as const;
const PARTNERS = [
  { key: 'metbuat', name: 'Mətbuat.az', href: 'https://metbuat.az/' },
  { key: 'mentorix', name: 'Mentorix.io', href: 'https://mentorix.io/' },
  { key: 'saytaz', name: 'Sayt.az', href: 'https://sayt.az/' },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

function currentMonthCalendar(locale: string) {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const mondayFirstOffset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: mondayFirstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  return {
    today: today.getUTCDate(),
    year,
    month,
    cells,
    label: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(today),
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tTaxonomy = await getTranslations('taxonomy');
  const calendar = currentMonthCalendar(locale);
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
  // Sprint 4 (Featured Listing) — admin-curated rooms (`is_featured`),
  // replacing what used to be 3 hardcoded mock venues. Best-effort fetch
  // (getFeaturedRooms() never throws); the section below simply doesn't
  // render until an admin features at least one room.
  const featuredRooms = await getFeaturedRooms(6);

  return (
    <main id="main-content" className="pb-8">
      <div className="mx-auto grid max-w-[1480px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-10">
          <section className="relative min-h-[360px] overflow-hidden rounded-lg border border-border bg-surface shadow-sm sm:min-h-[390px]">
            <Image src="/home/baku-skyline.webp" alt="" fill priority sizes="(max-width: 1024px) 100vw, 1100px" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg to-transparent opacity-95" aria-hidden="true" />
            <div className="relative flex min-h-[360px] flex-col justify-between p-5 sm:min-h-[390px] sm:p-8 lg:p-10">
              <div className="max-w-2xl">
                <p className="text-label font-semibold uppercase tracking-[0.16em] text-primary">{t('eyebrow')}</p>
                <h1 className="mt-3 max-w-3xl font-display text-[40px] font-semibold leading-[1.04] text-text-primary sm:text-[58px]">
                  {t('title')}
                </h1>
                <p className="mt-4 max-w-xl text-body text-text-secondary sm:text-lg">{t('subtitle')}</p>
              </div>
              <div className="mt-10">
                <HomeSearchForm />
              </div>
            </div>
          </section>

          {featuredRooms.length > 0 && (
            <section aria-labelledby="featured-venues-title">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-caption font-semibold uppercase tracking-[0.16em] text-primary">{t('dashboard.venues.eyebrow')}</p>
                  <h2 id="featured-venues-title" className="mt-1 font-display text-h2 text-text-primary">{t('dashboard.venues.title')}</h2>
                  <p className="mt-2 max-w-2xl text-caption text-text-muted">{t('dashboard.venues.disclaimer')}</p>
                </div>
                <Link href="/search" className="shrink-0 text-label font-semibold text-primary hover:text-text-primary">
                  {t('dashboard.viewAll')} →
                </Link>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-3">
                {featuredRooms.map((room) => {
                  const roomTypeKey = roomTypeKeyFromTranslationKey(room.roomType);
                  const roomTypeLabel = roomTypeKey ? tTaxonomy(`roomType.${roomTypeKey}`) : room.roomType;
                  return (
                    <article key={room.id} className="group overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <Link href={`/rooms/${room.id}`} className="block">
                        <div className="relative aspect-[4/3] overflow-hidden bg-surface-elevated">
                          {room.coverPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URL (not a fixed local set next/image's domain allowlist assumes), same as RoomListingCard.
                            <img src={room.coverPhotoUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-caption text-text-muted">
                              {t('dashboard.venues.noPhoto')}
                            </div>
                          )}
                          <span className="absolute left-3 top-3 rounded-full bg-surface/95 px-3 py-1 text-caption font-semibold text-text-primary shadow-sm">
                            {roomTypeLabel}
                          </span>
                        </div>
                        <div className="p-4">
                          <h3 className="font-display text-h4 text-text-primary">{room.name}</h3>
                          <p className="mt-1 text-small text-text-secondary">{[room.district, room.city].filter(Boolean).join(', ')}</p>
                          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-caption text-text-secondary">
                            <span><strong className="block text-small text-text-primary">{room.capacityMax}</strong>{t('dashboard.venues.capacity')}</span>
                            <span><strong className="block text-small text-text-primary">{formatMoney(room.pricePerHour.amount, room.pricePerHour.currency, locale)}</strong>{t('dashboard.venues.perHour')}</span>
                            <span><strong className="block text-small text-verified">✓</strong>{t('dashboard.venues.verified')}</span>
                          </div>
                        </div>
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="upcoming-formats-title">
            <div className="flex items-end justify-between gap-4">
              <h2 id="upcoming-formats-title" className="font-display text-h2 text-text-primary">{t('dashboard.upcoming.title')}</h2>
              <Link href="/events" className="shrink-0 text-label font-semibold text-primary hover:text-text-primary">{t('dashboard.viewAll')} →</Link>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {UPCOMING_FORMATS.map((item) => (
                <Link key={item.key} href={item.href} className="group relative min-h-64 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
                  <Image src={item.image} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-300 group-hover:scale-[1.02]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-oil-900 via-transparent to-transparent" aria-hidden="true" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <span className="rounded-full bg-surface px-3 py-1 text-caption font-semibold text-text-primary">{t(`dashboard.upcoming.items.${item.key}.tag`)}</span>
                    <h3 className="mt-3 font-display text-h3">{t(`dashboard.upcoming.items.${item.key}.title`)}</h3>
                    <p className="mt-1 text-small text-white/80">{t(`dashboard.upcoming.items.${item.key}.body`)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start" aria-label={t('dashboard.sidebarLabel')}>
          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-h4 text-text-primary">{t('dashboard.calendar.title')}</h2>
              <Link href="/search" className="text-caption font-semibold text-primary">{t('dashboard.viewAll')}</Link>
            </div>
            <p className="mt-4 text-small font-semibold capitalize text-text-primary">{calendar.label}</p>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center">
              {weekdays.map((day) => <span key={day} className="py-1 text-caption text-text-muted">{t(`dashboard.calendar.weekdays.${day}`)}</span>)}
              {calendar.cells.map((day, index) => day === null ? <span key={`empty-${index}`} /> : (
                <Link
                  key={day}
                  href={`/search?date=${calendar.year}-${String(calendar.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                  className={[
                    'flex aspect-square items-center justify-center rounded-full text-caption hover:bg-surface-elevated',
                    day === calendar.today ? 'bg-accent font-semibold text-accent-on hover:bg-accent-hover' : 'text-text-secondary',
                  ].join(' ')}
                  aria-label={`${day} ${calendar.label}`}
                >
                  {day}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <p className="text-caption font-semibold uppercase tracking-[0.14em] text-primary">{t('dashboard.community.eyebrow')}</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary font-display text-h4 text-primary-on">M</div>
              <div>
                <h2 className="font-display text-h4 text-text-primary">{t('dashboard.community.name')}</h2>
                <p className="mt-1 text-caption text-text-secondary">{t('dashboard.community.role')}</p>
              </div>
            </div>
            <p className="mt-4 text-small text-text-secondary">{t('dashboard.community.body')}</p>
            <Link href="/partners" className="mt-4 inline-block text-label font-semibold text-primary">{t('dashboard.community.cta')} →</Link>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-h4 text-text-primary">{t('dashboard.map.title')}</h2>
              <Link href="/search" className="text-caption font-semibold text-primary">{t('dashboard.map.cta')}</Link>
            </div>
            <Link href="/search?city=Bakı" className="relative mt-4 block h-48 overflow-hidden rounded-md bg-info-bg" aria-label={t('dashboard.map.ariaLabel')}>
              <span className="absolute -left-8 top-10 h-px w-80 rotate-12 bg-info/30" />
              <span className="absolute -left-10 top-28 h-px w-80 -rotate-6 bg-info/30" />
              <span className="absolute left-12 top-6 h-72 w-px rotate-[28deg] bg-info/30" />
              <span className="absolute right-12 top-2 h-72 w-px -rotate-[20deg] bg-info/30" />
              {['left-12 top-16', 'right-16 top-10', 'left-24 bottom-8', 'right-24 bottom-16'].map((position) => (
                <span key={position} className={`absolute ${position} flex h-7 w-7 items-center justify-center rounded-full bg-accent text-caption font-bold text-accent-on shadow-sm`}>•</span>
              ))}
              <span className="absolute inset-0 flex items-center justify-center font-display text-h3 text-text-primary">Bakı</span>
            </Link>
          </section>

          <section className="rounded-lg border border-warning bg-warning-bg p-5">
            <span className="text-caption font-semibold uppercase tracking-wide text-warning">{t('sponsor.label')}</span>
            <h2 className="mt-2 font-display text-h4 text-text-primary">{t('sponsor.title')}</h2>
            <p className="mt-2 text-small text-text-secondary">{t('sponsor.body')}</p>
            <Link href="/advertise" className="mt-4 inline-block text-label font-semibold text-primary">{t('sponsor.cta')} →</Link>
          </section>
        </aside>
      </div>

      <section className="mt-10 border-y border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.4fr]">
          <div>
            <p className="text-label font-semibold uppercase tracking-[0.16em] text-primary">{t('loop.eyebrow')}</p>
            <h2 className="mt-2 font-display text-h2 text-text-primary">{t('loop.title')}</h2>
            <p className="mt-4 text-body text-text-secondary">{t('loop.body')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/for-businesses">{t('loop.ownerCta')}</LinkButton>
              <LinkButton href="/events" variant="secondary">{t('loop.organizerCta')}</LinkButton>
            </div>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {PATH_STEPS.map((step, index) => (
              <li key={step} className="border-t-2 border-primary pt-5">
                <span className="text-caption font-semibold text-text-muted">0{index + 1}</span>
                <h3 className="mt-4 font-display text-h3 text-text-primary">{t(`loop.steps.${step}.title`)}</h3>
                <p className="mt-2 text-small text-text-secondary">{t(`loop.steps.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="rounded-lg bg-primary px-6 py-10 text-primary-on sm:px-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:items-end">
            <div>
              <p className="text-label font-semibold uppercase tracking-[0.16em] opacity-80">{t('partners.eyebrow')}</p>
              <h2 className="mt-2 font-display text-h2">{t('partners.title')}</h2>
              <p className="mt-4 text-small opacity-80">{t('partners.body')}</p>
              <Link href="/partners" className="mt-6 inline-block text-label font-semibold underline underline-offset-4">{t('partners.cta')} →</Link>
            </div>
            <div className="grid gap-px overflow-hidden rounded-md bg-primary-on/25 sm:grid-cols-3">
              {PARTNERS.map((partner) => (
                <a key={partner.key} href={partner.href} target="_blank" rel="noreferrer" className="bg-primary px-5 py-6 hover:opacity-90">
                  <p className="font-display text-h4">{partner.name}</p>
                  <p className="mt-2 text-caption opacity-75">{t(`partners.roles.${partner.key}`)}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
