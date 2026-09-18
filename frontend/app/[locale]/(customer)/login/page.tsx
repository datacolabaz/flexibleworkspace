import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { LoginForm } from '@/components/features/auth/LoginForm';
import { safeRedirectTarget } from '@/lib/auth/safe-redirect';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
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

  // Read and validated server-side (safeRedirectTarget rejects anything
  // that isn't a same-origin, path-absolute string) so a Client Component
  // never has to re-derive trust in a raw query param before calling
  // router.push with it — see LoginForm's post-verify redirect. Used by
  // the new /account area (redirected here when signed out) and
  // BookmarkButton's "sign in to save" link.
  const redirectTo = safeRedirectTarget(redirect);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center gap-6 px-4 py-12"
    >
      <Logo variant="auto" height={32} className="mx-auto" />
      <Card>
        <LoginForm redirectTo={redirectTo} />
      </Card>
    </main>
  );
}
