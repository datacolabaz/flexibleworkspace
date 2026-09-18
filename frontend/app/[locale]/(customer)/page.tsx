import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Logo } from '@/components/ui/Logo';
import { HomeSearchForm } from '@/components/features/search/HomeSearchForm';

// Placeholder homepage — proves the scaffold end-to-end (locale routing,
// design tokens, the approved logo, translated strings with fallback)
// ahead of the real search-first homepage (06_INFORMATION_ARCHITECTURE.md,
// 07_UX_ARCHITECTURE.md). Not the final design. The search box itself,
// though, now goes somewhere real — wired to the `/search` page built
// this pass rather than left as a dead `<form>`.
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <Logo variant="auto" height={40} />
      <h1 className="font-display text-h1 text-text-primary">{t('hero.title')}</h1>
      <p className="max-w-xl text-body text-text-secondary">{t('hero.subtitle')}</p>
      <HomeSearchForm />
    </main>
  );
}
