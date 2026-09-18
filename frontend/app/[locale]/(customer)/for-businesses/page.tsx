import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

const FEATURE_KEYS = ['reach', 'control', 'payouts'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'forBusinesses' });
  return { title: t('pageTitle') };
}

/**
 * `/for-businesses` — `06_INFORMATION_ARCHITECTURE.md` §6.1's "Provider
 * acquisition landing page," replacing the `common.comingSoon`
 * placeholder (Phase 4 item 3). Its CTA leads to `/list-your-space`,
 * the IA doc's own next-listed route ("Provider signup entry point") —
 * this pass built that page too rather than leaving the CTA as a dead
 * link, since `POST /providers` is a real, complete, already-shipped
 * endpoint (no invented lead-capture stub needed).
 *
 * The three feature points are deliberately general — "your prices,
 * your availability," "payments are processed securely and paid out
 * to you" — rather than naming a specific commission percentage or
 * payout schedule: `PLATFORM_DEFAULT_COMMISSION_PERCENTAGE` and the
 * payout-related config values are explicitly still pending business
 * sign-off (`PHASE4_REPORT.md`'s "Production configuration checklist"),
 * so stating a number here would be a claim this pass has no authority
 * to make.
 */
export default async function ForBusinessesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('forBusinesses');

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="font-display text-h2 text-text-primary">{t('pageTitle')}</h1>
        <p className="text-body text-text-secondary">{t('pageIntro')}</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {FEATURE_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5">
            <h2 className="text-label font-semibold text-text-primary">{t(`features.${key}.title`)}</h2>
            <p className="text-small text-text-secondary">{t(`features.${key}.body`)}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <LinkButton href="/list-your-space">{t('ctaButton')}</LinkButton>
      </div>
    </main>
  );
}
