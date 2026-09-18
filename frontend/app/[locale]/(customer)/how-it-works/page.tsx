import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

const STEP_KEYS = ['search', 'book', 'manage', 'review'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'howItWorks' });
  return { title: t('pageTitle') };
}

/**
 * `/how-it-works` — real content, replacing the `common.comingSoon`
 * placeholder (Phase 4 item 3). Four steps, in the order a customer
 * actually experiences them (search → book & pay → manage → review) —
 * grounded in what's actually built (the search page's real filters,
 * the real hosted-checkout booking flow, `/account/bookings`, and
 * `/account/reviews`'s COMPLETED-booking review flow), not invented
 * claims. Numbered because it genuinely is a sequence, per the copy's
 * own real order of operations — not a stylistic default.
 *
 * Copy follows `SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md` §19 (Voice &
 * Tone): concise, direct, verb-led ("Find a space. Book a room."), no
 * hype register ("revolutionizing," "next-generation ecosystem," etc.
 * explicitly ruled out there).
 */
export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('howItWorks');

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="font-display text-h2 text-text-primary">{t('pageTitle')}</h1>
        <p className="text-body text-text-secondary">{t('pageIntro')}</p>
      </div>

      <ol className="mt-10 flex flex-col gap-8">
        {STEP_KEYS.map((key, index) => (
          <li key={key} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-label font-semibold text-accent-on"
            >
              {index + 1}
            </span>
            <div className="flex flex-col gap-1 pt-1">
              <h2 className="font-display text-h4 text-text-primary">{t(`steps.${key}.title`)}</h2>
              <p className="text-body text-text-secondary">{t(`steps.${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex justify-center">
        <LinkButton href="/search">{t('ctaButton')}</LinkButton>
      </div>
    </main>
  );
}
