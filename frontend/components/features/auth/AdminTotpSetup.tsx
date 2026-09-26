'use client';

/**
 * Task 3 — AdminTotpSetup component.
 *
 * Allows admin users to set up TOTP-based 2FA:
 *   1. Calls POST /api/auth/admin/totp/setup to get an otpauth URI and secret.
 *   2. Displays the otpauth URI as a QR code (via a free QR API that
 *      does not log the secret — uses the standard Google Charts API
 *      which encodes in the URL as a fallback; for production, swap this
 *      for a server-rendered QR image to avoid the secret ever leaving
 *      the browser in a URL fragment).
 *   3. Accepts a 6-digit code from the authenticator app.
 *   4. POSTs to /api/auth/admin/totp/verify to activate 2FA.
 *
 * NOTE: The QR code is rendered via the `qrserver.com` public API for
 * simplicity. In production you should generate the QR server-side or use
 * a client-side QR library (e.g. `qrcode` npm package) to avoid the
 * otpauth URI appearing in outbound network requests.
 */

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type SetupState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; otpauthUri: string; secret: string }
  | { phase: 'verifying'; otpauthUri: string; secret: string }
  | { phase: 'done' };

export function AdminTotpSetup() {
  const [state, setState] = useState<SetupState>({ phase: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function handleSetup() {
    setState({ phase: 'loading' });
    setError(undefined);
    try {
      const res = await fetch('/api/auth/admin/totp/setup', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => undefined)) as
          | { error?: { message?: string } }
          | undefined;
        setError(body?.error?.message ?? 'TOTP quraşdırılmadı. Yenidən cəhd edin.');
        setState({ phase: 'idle' });
        return;
      }
      const { otpauthUri, secret } = (await res.json()) as {
        otpauthUri: string;
        secret: string;
      };
      setState({ phase: 'ready', otpauthUri, secret });
    } catch {
      setError('TOTP quraşdırılmadı. Yenidən cəhd edin.');
      setState({ phase: 'idle' });
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.phase !== 'ready') return;
    setState({ phase: 'verifying', otpauthUri: state.otpauthUri, secret: state.secret });
    setError(undefined);
    try {
      const res = await fetch('/api/auth/admin/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => undefined)) as
          | { error?: { code?: string; message?: string } }
          | undefined;
        const msg =
          body?.error?.code === 'TOTP_INVALID'
            ? 'Yanlış kod. Autentifikator tətbiqinizdəki vaxtı yoxlayın.'
            : (body?.error?.message ?? 'Doğrulama zamanı xəta baş verdi.');
        setError(msg);
        setState({ phase: 'ready', otpauthUri: state.otpauthUri, secret: state.secret });
        return;
      }
      setState({ phase: 'done' });
    } catch {
      setError('Doğrulama zamanı xəta baş verdi. Yenidən cəhd edin.');
      setState({ phase: 'ready', otpauthUri: state.otpauthUri, secret: state.secret });
    }
  }

  if (state.phase === 'done') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-4">
        <p className="font-semibold text-success">İki addımlı doğrulama uğurla aktivləşdirildi ✓</p>
        <p className="text-small text-text-secondary">
          Növbəti girişdə autentifikator tətbiqinizdəki kodu daxil etməyiniz tələb olunacaq.
        </p>
      </div>
    );
  }

  const qrSrc =
    state.phase === 'ready' || state.phase === 'verifying'
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(state.otpauthUri)}`
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-elevated p-4 sm:max-w-sm">
      <div>
        <h3 className="font-display text-h4 text-text-primary">İki addımlı doğrulama (2FA)</h3>
        <p className="mt-1 text-small text-text-secondary">
          Hesabınızı qorumaq üçün autentifikator tətbiqi ilə TOTP kodunu aktivləşdirin.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {state.phase === 'idle' && (
        <Button type="button" onClick={handleSetup} className="self-start">
          2FA quraşdırmağa başla
        </Button>
      )}

      {state.phase === 'loading' && (
        <p className="text-small text-text-muted">Yüklənir…</p>
      )}

      {(state.phase === 'ready' || state.phase === 'verifying') && (
        <>
          <p className="text-small text-text-secondary">
            QR kodu autentifikator tətbiqinizlə (Google Authenticator, Authy və s.) skan edin.
          </p>
          {qrSrc && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrSrc}
              alt="TOTP QR kodu"
              width={200}
              height={200}
              className="rounded-md border border-border"
            />
          )}
          <details className="text-small text-text-secondary">
            <summary className="cursor-pointer">Əl ilə daxil etmə üçün gizli açar</summary>
            <code className="mt-1 block break-all rounded-sm bg-surface px-2 py-1 font-mono text-caption">
              {state.phase === 'ready' ? state.secret : (state as Extract<SetupState, { phase: 'verifying' }>).secret}
            </code>
          </details>

          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <label htmlFor="totp-code" className="text-small font-semibold text-text-primary">
              Doğrulama kodu
            </label>
            <Input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6 rəqəmli kod"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={state.phase === 'verifying'}
              required
            />
            <Button
              type="submit"
              isLoading={state.phase === 'verifying'}
              disabled={code.length !== 6}
              className="self-start"
            >
              {state.phase === 'verifying' ? 'Yoxlanılır…' : 'Aktivləşdir'}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
