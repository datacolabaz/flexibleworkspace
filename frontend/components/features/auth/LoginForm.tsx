'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/ui/Logo';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AdminPasswordForm } from './AdminPasswordForm';

export interface LoginFormProps {
  redirectTo?: string;
  adminMode?: boolean;
}

/**
 * A focused OAuth entry point. The visual frame is Spotva-owned while the
 * actual Google control stays Google's official rendered widget, preserving
 * provider branding and the account-chooser security model.
 */
export function LoginForm({ redirectTo, adminMode = false }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const [banner, setBanner] = useState<string | undefined>();
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center text-center">
        <Logo variant="icon" height={44} />
        <span className="mt-5 rounded-full bg-success-bg px-3 py-1 text-caption font-semibold text-success">{t('secureBadge')}</span>
        <h1 className="mt-4 font-display text-h2 text-text-primary">{t('title')}</h1>
        <p className="mt-2 max-w-sm text-body text-text-secondary">{t('subtitle')}</p>
      </div>

      {banner && <Alert variant="error">{banner}</Alert>}

      {adminMode ? (
        <AdminPasswordForm redirectTo={redirectTo ?? '/admin'} />
      ) : hasGoogle ? (
        <GoogleSignInButton redirectTo={redirectTo} onError={setBanner} />
      ) : (
        <Alert variant="error">{t('noMethodsAvailable')}</Alert>
      )}

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-caption text-text-muted">{t('oneStep')}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <p className="text-center text-caption leading-5 text-text-muted">
        {t('privacyPrefix')}{' '}
        <Link href="/privacy-policy" className="font-semibold text-primary underline underline-offset-2">
          {t('privacyLink')}
        </Link>
      </p>
    </div>
  );
}
