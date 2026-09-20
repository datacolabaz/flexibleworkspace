import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dataDeletion' });
  return { title: t('pageTitle') };
}

/**
 * `/data-deletion` — the "User data deletion" field Meta's publishing
 * checklist requires: either a data-deletion callback URL or, as here, a
 * plain instructions URL describing how a person can have their data
 * removed. Kept as a manual (email) process rather than a self-service
 * flow or callback endpoint, since no such endpoint exists in the
 * backend yet — this documents the real, current process, not an
 * aspirational one.
 */
export default async function DataDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dataDeletion');

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-h2 text-text-primary">{t('pageTitle')}</h1>
        <p className="text-body text-text-secondary">{t('intro')}</p>
      </div>

      <ol className="mt-8 flex flex-col gap-4">
        {(['step1', 'step2', 'step3'] as const).map((key, index) => (
          <li key={key} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-label font-semibold text-accent-on"
            >
              {index + 1}
            </span>
            <p className="pt-0.5 text-body text-text-secondary">{t(`steps.${key}`)}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 whitespace-pre-line text-body text-text-secondary">{t('retentionNote')}</p>
    </main>
  );
}
