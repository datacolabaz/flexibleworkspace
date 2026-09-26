'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Link } from '@/lib/i18n/navigation';

type CheckInResult = {
  success: boolean;
  attendeeName: string;
  ticket: {
    id: string;
    status: string;
    checkedInAt: string | null;
    buyerName: string | null;
    buyerEmail: string | null;
    ticketType?: { name: string };
  };
};

type AttendeeStats = {
  checkedIn: number;
  total: number;
};

export default function CheckInPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const t = useTranslations('account.tickets');

  const [qrInput, setQrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AttendeeStats | null>(null);
  const [eventTitle, setEventTitle] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Load event info + attendee stats
  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch(`/api/events/${eventId}/attendees`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json() as { checkedIn: number; total: number };
          setStats({ checkedIn: data.checkedIn, total: data.total });
        }
      } catch {
        // non-critical
      }
    }

    async function loadEvent() {
      try {
        const res = await fetch(`/api/events/${eventId}`, { cache: 'no-store' });
        if (res.ok) {
          const ev = await res.json() as { title?: string };
          setEventTitle(ev.title ?? '');
        }
      } catch {
        // non-critical
      }
    }

    loadEvent();
    loadStats();
  }, [eventId]);

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    const code = qrInput.trim();
    if (!code) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(code)}/check-in`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json() as CheckInResult & { error?: { message: string } };
      if (!res.ok) throw new Error(data?.error?.message ?? t('checkInError'));
      setResult(data);
      setQrInput('');
      // Refresh stats
      const statsRes = await fetch(`/api/events/${eventId}/attendees`, { cache: 'no-store' });
      if (statsRes.ok) {
        const s = await statsRes.json() as { checkedIn: number; total: number };
        setStats({ checkedIn: s.checkedIn, total: s.total });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkInError'));
    } finally {
      setLoading(false);
      // Re-focus input for quick subsequent scans
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <div className="max-w-lg">
      {/* Back link */}
      <Link
        href="/account/events"
        className="text-small text-text-secondary hover:text-text-primary"
      >
        ← {'Tədbirlərim'}
      </Link>

      <h2 className="mt-4 font-display text-h2 text-text-primary">
        {t('checkIn')}
        {eventTitle && (
          <span className="block text-body font-normal text-text-muted mt-1">{eventTitle}</span>
        )}
      </h2>

      {/* Attendee counter */}
      {stats !== null && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-[32px] font-bold text-text-primary">
            {stats.checkedIn}
            <span className="text-[20px] text-text-muted">/{stats.total}</span>
          </p>
          <p className="text-small text-text-muted">{t('checkedInCount')}</p>
        </div>
      )}

      {/* Check-in form */}
      <form onSubmit={handleCheckIn} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-label font-semibold text-text-primary">
            {'QR token'}
          </label>
          <Input
            ref={inputRef}
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder={t('checkInPlaceholder')}
            autoFocus
          />
          <p className="mt-1 text-small text-text-muted">
            {'İştirakçının QR kodunu skan edin və ya tokeni əl ilə daxil edin.'}
          </p>
        </div>

        <Button type="submit" isLoading={loading} fullWidth disabled={!qrInput.trim()}>
          {t('checkInSubmit')}
        </Button>
      </form>

      {/* Success result */}
      {result && (
        <div className="mt-4 rounded-xl border border-success bg-success-bg p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-semibold text-success">{t('checkInSuccess')}</p>
              <p className="text-body text-text-primary">{result.attendeeName}</p>
              {result.ticket.ticketType?.name && (
                <p className="text-small text-text-muted">{'🎫 '}{result.ticket.ticketType.name}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error result */}
      {error && (
        <div className="mt-4 rounded-xl border border-error bg-error-bg p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">❌</span>
            <p className="text-body text-error">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
