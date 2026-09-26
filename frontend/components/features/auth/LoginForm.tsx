'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { track, AnalyticsEvent } from '@/lib/analytics/track';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AdminPasswordForm } from './AdminPasswordForm';

export interface LoginFormProps {
  redirectTo?: string;
  adminMode?: boolean;
}

type LoginStep = 'email' | 'otp';

function maskIdentifier(identifier: string): string {
  const [local, domain] = identifier.split('@');
  if (!local || !domain) return identifier;
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(3, Math.min(6, local.length - 1)))}@${domain}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function errorKey(code?: string):
  | 'invalidCode'
  | 'expiredCode'
  | 'rateLimited'
  | 'requestFailed'
  | 'generic' {
  if (code === 'OTP_INVALID_OR_EXPIRED') return 'invalidCode';
  if (code === 'OTP_EXPIRED') return 'expiredCode';
  if (code === 'RATE_LIMITED') return 'rateLimited';
  if (code === 'VALIDATION_ERROR') return 'requestFailed';
  return 'generic';
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string } }
    | undefined;
  return body?.error?.code;
}

/**
 * Passwordless OTP login plus the existing OAuth/admin entry points. Tokens
 * remain exclusively in the BFF's httpOnly cookies; this component only
 * stores the identifier and the transient code input in React state.
 */
export function LoginForm({ redirectTo, adminMode = false }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const otpInputRef = useRef<HTMLInputElement>(null);
  const [banner, setBanner] = useState<string | undefined>();
  const [step, setStep] = useState<LoginStep>('email');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (!adminMode) {
      track(AnalyticsEvent.LoginStarted, { source: 'login_form' });
    }
  }, [adminMode]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  const sendCode = async () => {
    const normalized = identifier.trim();
    if (isSending || cooldown > 0) return;
    if (!isValidEmail(normalized)) {
      setBanner(t('errors.invalidEmail'));
      return;
    }
    setBanner(undefined);
    setIsSending(true);
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalized }),
      });
      if (!response.ok) {
        setBanner(t(`errors.${errorKey(await readErrorCode(response))}`));
        return;
      }
      setIdentifier(normalized);
      setCode('');
      setStep('otp');
      setCooldown(60);
    } catch {
      setBanner(t('errors.requestFailed'));
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6 || isVerifying) return;
    setBanner(undefined);
    setIsVerifying(true);
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, code }),
      });
      if (!response.ok) {
        setBanner(t(`errors.${errorKey(await readErrorCode(response))}`));
        setCode('');
        return;
      }
      router.push(redirectTo ?? '/account/bookings');
      router.refresh();
    } catch {
      setBanner(t('errors.generic'));
    } finally {
      setIsVerifying(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setBanner(undefined);
    setCooldown(0);
  };

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
      ) : (
        <>
          {step === 'email' ? (
            <form noValidate className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
              <label className="flex flex-col gap-2 text-label" htmlFor="login-email">
                {t('otp.emailLabel')}
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={identifier}
                  aria-describedby="login-email-hint"
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={t('otp.emailPlaceholder')}
                />
              </label>
              <p id="login-email-hint" className="-mt-2 text-caption text-text-muted">{t('otp.emailHint')}</p>
              <Button type="submit" fullWidth isLoading={isSending}>
                {isSending ? t('otp.sending') : t('otp.sendCode')}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
              <p className="text-body text-text-secondary" aria-live="polite">
                {t('otp.sentTo', { email: maskIdentifier(identifier) })}
              </p>
              <label className="flex flex-col gap-2 text-label" htmlFor="login-otp">
                {t('otp.codeLabel')}
                <Input
                  ref={otpInputRef}
                  id="login-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-h3 tracking-[0.35em]"
                />
              </label>
              <Button type="submit" fullWidth isLoading={isVerifying} disabled={code.length !== 6}>
                {isVerifying ? t('otp.verifying') : t('otp.verifyCode')}
              </Button>
              <div className="flex flex-col items-center gap-2 text-small">
                <Button type="button" variant="ghost" size="sm" disabled={cooldown > 0 || isSending} onClick={() => void sendCode()}>
                  {cooldown > 0 ? t('otp.resendIn', { seconds: cooldown }) : t('otp.resend')}
                </Button>
                <button type="button" className="min-h-11 font-semibold text-primary underline underline-offset-2" onClick={changeEmail}>
                  {t('otp.changeEmail')}
                </button>
              </div>
            </form>
          )}

          {hasGoogle && (
            <>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-caption text-text-muted">{t('oneStep')}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignInButton redirectTo={redirectTo ?? '/account/bookings'} onError={setBanner} />
            </>
          )}
        </>
      )}

      <p className="text-center text-caption leading-5 text-text-muted">
        {t('privacyPrefix')}{' '}
        <Link href="/privacy-policy" className="font-semibold text-primary underline underline-offset-2">
          {t('privacyLink')}
        </Link>
      </p>
    </div>
  );
}
