import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const SECTION_KEYS = [
  'dataCollected',
  'howWeUse',
  'thirdParties',
  'cookies',
  'retention',
  'yourRights',
  'contact',
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacyPolicy' });
  return { title: t('pageTitle') };
}

/**
 * `/privacy-policy` — required as a real, reachable URL before Facebook
 * Login (and Google Sign-In) can go from "development only" to serving
 * real users: Meta's app-review dashboard lists "Privacy policy URL" as
 * a blocking field for publishing, independent of App Review itself
 * (public_profile + email are Standard Access, not reviewable).
 *
 * This is boilerplate covering what the codebase actually does — OTP
 * accounts, Google/Facebook OAuth linking (18_SECURITY.md,
 * auth.service.ts), Epoint/Payriff payment processing
 * (13_PAYMENT_ARCHITECTURE.md) — not a substitute for legal review.
 */
export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('privacyPolicy');

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 text-text-primary">{t('pageTitle')}</h1>
        <p className="text-label text-text-secondary">{t('lastUpdated')}</p>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {SECTION_KEYS.map((key) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="font-display text-h4 text-text-primary">{t(`sections.${key}.title`)}</h2>
            <p className="whitespace-pre-line text-body text-text-secondary">{t(`sections.${key}.body`)}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
