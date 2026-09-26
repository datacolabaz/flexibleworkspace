'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { track, AnalyticsEvent } from '@/lib/analytics/track';

interface RsvpModalProps {
  eventId: string;
  onClose: () => void;
}

export function RsvpModal({ eventId, onClose }: RsvpModalProps) {
  const t = useTranslations('eventDetail');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

  useEffect(() => {
    track(AnalyticsEvent.EventRsvpStarted, { event_id: eventId });
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || undefined }),
      });
      const data = await res.json() as { confirmationCode?: string; error?: { message: string } };
      if (!res.ok) throw new Error(data?.error?.message ?? t('rsvpError'));
      track(AnalyticsEvent.EventRsvpCompleted, { event_id: eventId });
      setConfirmationCode(data.confirmationCode ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('rsvpErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────

  if (confirmationCode !== null) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="mb-3 text-4xl">✅</div>
            <h3 className="font-display text-h3 text-text-primary">{t('rsvpSuccess')}</h3>
            <p className="mt-2 rounded-md bg-surface-elevated px-4 py-2 font-mono text-label font-semibold text-text-primary">
              {t('confirmationCode', { code: confirmationCode })}
            </p>
            <p className="mt-3 text-small text-text-muted">
              {t('rsvpCodeNote')}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="secondary" onClick={onClose}>
                {t('rsvpClose')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RSVP form ──────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-h3 text-text-primary">{t('rsvpModalTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('rsvpClose')}
            className="rounded-md p-1 text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-error-bg p-3 text-small text-error">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('nameLabel')} *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={255}
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('emailLabel')} *
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={255}
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('phoneLabel')}
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
            />
          </div>

          <Button type="submit" isLoading={loading} fullWidth>
            {loading ? t('submittingRsvp') : t('submitRsvp')}
          </Button>
        </form>
      </div>
    </div>
  );
}
