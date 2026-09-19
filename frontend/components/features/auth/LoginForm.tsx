'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';
import { isBannerLevelError, otpErrorMessageKey } from './otp-error-messages';
import { GoogleSignInButton } from './GoogleSignInButton';
import { FacebookSignInButton } from './FacebookSignInButton';

type Step = 'identifier' | 'code' | 'success';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as BffErrorBody;
    return body.error?.code;
  } catch {
    return undefined;
  }
}

export interface LoginFormProps {
  /**
   * Where to send the visitor after a successful verify, e.g.
   * `/account/bookings` when they were redirected here from the new
   * `/account` area, or a room page when `BookmarkButton`'s "sign in to
   * save" link sent them here. Already validated server-side by the page
   * (`safeRedirectTarget`) — this component trusts it as-is rather than
   * re-validating, since a Client Component has no safe way to tell a
   * legitimate same-origin path from something injected into the URL by
   * hand. Falls back to `/` when absent, matching the prior behavior.
   */
  redirectTo?: string;
}

/**
 * The email/phone -> OTP login flow, driving the BFF routes built in the
 * previous milestone (app/api/auth/otp/{request,verify}/route.ts) — a
 * page script never sees a token; success just means the backend has set
 * this origin's httpOnly cookies and a redirect can proceed.
 *
 * Two-step state machine (`identifier` -> `code`, plus a brief `success`
 * before redirecting) kept as local useState rather than a form library:
 * two fields, no cross-field validation, no reason for a dependency the
 * project has otherwise avoided (see the OpenAPI-client milestone's
 * "explicitly no TanStack Query" note — same reasoning applies here to
 * react-hook-form).
 */
export function LoginForm({ redirectTo }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const router = useRouter();

  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [identifierError, setIdentifierError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [banner, setBanner] = useState<{ variant: 'error' | 'success'; message: string } | undefined>();
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown countdown — one ticking interval, cleared on unmount
  // or once it reaches zero.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function requestOtp(identifierValue: string): Promise<boolean> {
    setIsRequesting(true);
    setIdentifierError(undefined);
    setBanner(undefined);
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifierValue }),
      });
      if (response.status === 204) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        return true;
      }
      const code = await readErrorCode(response);
      const message = t(`errors.${otpErrorMessageKey(code)}`);
      if (isBannerLevelError(code)) {
        setBanner({ variant: 'error', message });
      } else {
        setIdentifierError(message);
      }
      return false;
    } catch {
      setIdentifierError(t('errors.generic'));
      return false;
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleIdentifierSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) {
      setIdentifierError(t('errors.validationError'));
      return;
    }
    const sent = await requestOtp(trimmed);
    if (sent) {
      setStep('code');
      setCode('');
      setCodeError(undefined);
    }
  }

  async function handleVerify(codeValue: string) {
    if (codeValue.length < OTP_LENGTH || isVerifying) return;
    setIsVerifying(true);
    setCodeError(undefined);
    setBanner(undefined);
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), code: codeValue }),
      });
      if (response.ok) {
        setStep('success');
        router.push(redirectTo ?? '/');
        return;
      }
      const errorCode = await readErrorCode(response);
      const message = t(`errors.${otpErrorMessageKey(errorCode)}`);
      if (isBannerLevelError(errorCode)) {
        setBanner({ variant: 'error', message });
      } else {
        setCodeError(message);
      }
      setCode('');
    } catch {
      setCodeError(t('errors.generic'));
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || isRequesting) return;
    const sent = await requestOtp(identifier.trim());
    if (sent) {
      setBanner({ variant: 'success', message: t('resendSuccess') });
    }
  }

  function handleOAuthError(message: string) {
    setBanner({ variant: 'error', message });
  }

  function handleChangeIdentifier() {
    setStep('identifier');
    setCode('');
    setCodeError(undefined);
    setBanner(undefined);
  }

  if (step === 'success') {
    return <Alert variant="success">{t('successRedirect')}</Alert>;
  }

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-h3 text-text-primary">{t('codeTitle')}</h1>
          <p className="mt-1 text-body text-text-secondary">{t('codeSubtitle', { identifier })}</p>
        </div>

        {banner && <Alert variant={banner.variant}>{banner.message}</Alert>}

        <div>
          <OtpInput
            id="otp-code"
            length={OTP_LENGTH}
            value={code}
            onChange={setCode}
            onComplete={handleVerify}
            disabled={isVerifying}
            invalid={Boolean(codeError)}
            label={t('codeLabel')}
            digitLabel={(index, length) => t('codeDigitLabel', { position: index + 1, length })}
            focusFirstOnMount
          />
          {codeError && (
            <p role="alert" className="mt-2 text-small text-error">
              {codeError}
            </p>
          )}
        </div>

        <Button isLoading={isVerifying} disabled={code.length < OTP_LENGTH} fullWidth onClick={() => handleVerify(code)}>
          {isVerifying ? t('verifyingButton') : t('verifyButton')}
        </Button>

        <div className="flex items-center justify-between gap-4 text-small">
          <button
            type="button"
            onClick={handleChangeIdentifier}
            className="text-primary underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('changeIdentifier')}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || isRequesting}
            className="text-primary underline underline-offset-2 hover:no-underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {cooldown > 0 ? t('resendCooldown', { seconds: cooldown }) : t('resendButton')}
          </button>
        </div>
      </div>
    );
  }

  // Google/Facebook render nothing when their env var isn't set (see each
  // component), so this section can end up rendering zero buttons — the
  // divider only makes sense when at least one actually appears.
  const hasOAuthButtons = Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-h3 text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-body text-text-secondary">{t('subtitle')}</p>
      </div>

      {banner && <Alert variant={banner.variant}>{banner.message}</Alert>}

      {hasOAuthButtons && (
        <>
          <div className="flex flex-col gap-3">
            <GoogleSignInButton redirectTo={redirectTo} onError={handleOAuthError} />
            <FacebookSignInButton redirectTo={redirectTo} onError={handleOAuthError} />
          </div>
          <div className="flex items-center gap-3" role="separator" aria-label={t('orDivider')}>
            <div className="h-px flex-1 bg-border-default" aria-hidden="true" />
            <span className="text-small text-text-muted">{t('orDivider')}</span>
            <div className="h-px flex-1 bg-border-default" aria-hidden="true" />
          </div>
        </>
      )}

      <form onSubmit={handleIdentifierSubmit} noValidate className="flex flex-col gap-5">
        <FormField id="login-identifier" label={t('identifierLabel')} hint={t('identifierHint')} error={identifierError}>
          <Input
            id="login-identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            inputMode="email"
            value={identifier}
            disabled={isRequesting}
            invalid={Boolean(identifierError)}
            aria-describedby={fieldDescribedBy('login-identifier', { hint: t('identifierHint'), error: identifierError })}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={t('identifierPlaceholder')}
          />
        </FormField>

        <Button type="submit" isLoading={isRequesting} fullWidth>
          {isRequesting ? t('sendingButton') : t('continueButton')}
        </Button>
      </form>
    </div>
  );
}
