import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CompareTable } from '@/components/features/compare/CompareTable';

export default async function ComparePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('compare');

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 font-display text-h2 text-text-primary">{t('title')}</h1>
      <CompareTable />
    </main>
  );
}
