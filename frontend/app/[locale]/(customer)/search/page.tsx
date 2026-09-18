import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchResultsView } from '@/components/features/search/SearchResultsView';

// The real search-results page (FRONTEND_IMPLEMENTATION_PLAN.md §7:
// `/{locale}/search`, client-rendered — §19.3 explicitly allows this,
// unlike room detail/provider pages which need SSR for SEO). List/map
// split view per 08_DESIGN_SYSTEM.md §8.6.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  return { title: t('title') };
}

export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="min-h-[calc(100vh-4rem)]">
      {/* useSearchParams() inside SearchResultsView needs a Suspense
       * boundary per Next's App Router (it otherwise opts the whole
       * route out of static rendering with a build warning). */}
      <Suspense fallback={<SearchPageFallback />}>
        <SearchResultsView />
      </Suspense>
    </main>
  );
}

async function SearchPageFallback() {
  const t = await getTranslations('search');
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <p className="text-body text-text-secondary">{t('loading')}</p>
    </div>
  );
}
