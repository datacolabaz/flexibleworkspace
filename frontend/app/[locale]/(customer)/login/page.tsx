import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { LoginForm } from '@/components/features/auth/LoginForm';
import { safeRedirectTarget } from '@/lib/auth/safe-redirect';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.login' });
  return { title: t('title') };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { locale } = await params;
  const { redirect } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('auth.login');
  const redirectTo = safeRedirectTarget(redirect);
  const featureKeys = ['bookings', 'favorites', 'organizer'] as const;

  return (
    <main id="main-content" className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
      <section className="order-2 overflow-hidden rounded-lg bg-primary p-7 text-primary-on sm:p-10 lg:order-1 lg:min-h-[520px]">
        <p className="text-label font-semibold uppercase tracking-[0.16em] opacity-75">{t('panel.eyebrow')}</p>
        <h2 className="mt-4 max-w-lg font-display text-[40px] font-semibold leading-tight sm:text-[52px]">{t('panel.title')}</h2>
        <p className="mt-5 max-w-lg text-body opacity-80">{t('panel.body')}</p>
        <ol className="mt-10 grid gap-5">
          {featureKeys.map((key, index) => (
            <li key={key} className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-primary-on/25 pt-5">
              <span className="text-caption font-semibold opacity-60">0{index + 1}</span>
              <div>
                <h3 className="text-label font-semibold">{t(`panel.features.${key}.title`)}</h3>
                <p className="mt-1 text-small opacity-75">{t(`panel.features.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="order-1 lg:order-2 lg:px-8">
        <Card className="p-6 sm:p-9">
          <LoginForm redirectTo={redirectTo} />
        </Card>
      </div>
    </main>
  );
}
