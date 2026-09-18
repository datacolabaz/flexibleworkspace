import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Logo } from '@/components/ui/Logo';
import { Link } from '@/lib/i18n/navigation';
import { resolveLocaleFromCookie } from '@/lib/i18n/resolve-locale';
import '../globals.css';

// Independent root layout — see app/[locale]/layout.tsx's comment on
// Next.js's "multiple root layouts" pattern, and
// lib/i18n/resolve-locale.ts for why /booking/* is deliberately NOT
// locale-prefixed even though it's a real customer-facing screen (the
// backend's own successUrlTemplate/errorUrlTemplate dictate this exact,
// unprefixed path). Locale still resolves — from a cookie instead of the
// URL — so the confirmation/failed screens aren't English-only.

export const metadata: Metadata = {
  title: 'Spotva',
};

export default async function BookingLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocaleFromCookie();
  const messages = await getMessages({ locale });

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <header className="border-b border-border px-4 py-3">
            <Link href="/" locale={locale} aria-label="Spotva">
              <Logo variant="auto" height={28} />
            </Link>
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
