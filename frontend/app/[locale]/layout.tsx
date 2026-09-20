import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/lib/i18n/routing';
import { Header } from '@/components/features/navigation/Header';
import { SiteFooter } from '@/components/features/navigation/SiteFooter';
import '../globals.css';

// This is a Next.js "root layout" for the customer-facing branch — see
// components/ui/Logo.tsx's neighbor app/provider/layout.tsx and
// app/admin/layout.tsx for the other two. Next.js supports multiple
// independent root layouts (each defining its own <html>/<body>) when
// there is no shared app/layout.tsx above them, which is exactly what's
// needed here: /{locale}/* is the only branch that should get a
// locale-specific <html lang>, while /provider and /admin (§6.2/§6.3 of
// 06_INFORMATION_ARCHITECTURE.md) are deliberately NOT locale-prefixed.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'Spotva',
  description: 'Find your spot. Book meeting rooms, event spaces, and workspaces across Baku.',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  // Enables static rendering for this locale (next-intl requirement when
  // reading the locale from params rather than headers).
  setRequestLocale(locale);
  const messages = await getMessages();

  // SSR-correct first paint for the theme (08_DESIGN_SYSTEM.md §8.5:
  // "a cookie for SSR-correct first paint, avoiding a flash of the wrong
  // theme"). Absent an explicit cookie (no prior toggle click), no
  // data-theme attribute is stamped at all — the bare-:root/
  // prefers-color-scheme CSS in globals.css/tokens.css then resolves
  // "system" on its own, exactly as designed.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('spotva_theme')?.value;
  const explicitTheme = themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : undefined;

  return (
    <html lang={locale} data-theme={explicitTheme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Golos+Text:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Header />
          {children}
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
