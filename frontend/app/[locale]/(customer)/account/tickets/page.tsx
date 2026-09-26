'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type TicketRecord = {
  id: string;
  ticketTypeId: string;
  eventId: string;
  status: string;
  qrCode: string | null;
  amountPaid: number;
  currency: string;
  checkedInAt: string | null;
  createdAt: string;
  ticketType?: { name: string; price: number };
  event?: {
    id: string;
    title: string;
    slug: string;
    startAt: string;
  };
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('az', {
      timeZone: 'Asia/Baku',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'text-success',
  pending: 'text-warning',
  cancelled: 'text-error',
  used: 'text-text-muted',
};

export default function MyTicketsPage() {
  const t = useTranslations('account.tickets');
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/tickets/me', { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json())?.error?.message ?? t('loadError'));
        setTickets(await res.json() as TicketRecord[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('loadError'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [t]);

  function toggleQr(id: string) {
    setQrVisible((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const statusLabel: Record<string, string> = {
    confirmed: t('confirmed'),
    pending: t('pending'),
    cancelled: t('cancelled'),
    used: t('used'),
  };

  if (loading) {
    return (
      <div>
        <h2 className="font-display text-h2 text-text-primary">{t('title')}</h2>
        <p className="mt-4 text-body text-text-muted">{'Yüklənir…'}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-h2 text-text-primary">{t('title')}</h2>

      {error && (
        <p className="mt-4 rounded-md bg-error-bg p-3 text-small text-error">{error}</p>
      )}

      {!error && tickets.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-body text-text-secondary">{t('noTickets')}</p>
        </div>
      )}

      {tickets.length > 0 && (
        <ul className="mt-6 space-y-4">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text-primary text-body">
                    {ticket.event?.title ?? '—'}
                  </p>
                  {ticket.event?.startAt && (
                    <p className="mt-0.5 text-small text-text-muted">
                      {'📅'} {formatDate(ticket.event.startAt)}
                    </p>
                  )}
                  <p className="mt-1 text-small text-text-muted">
                    {'🎫'} {ticket.ticketType?.name ?? '—'}
                    {' · '}
                    {Number(ticket.amountPaid) === 0
                      ? t('free')
                      : `${ticket.amountPaid} ${ticket.currency}`}
                  </p>
                  <p className={['mt-1 text-small font-semibold', STATUS_COLORS[ticket.status] ?? 'text-text-muted'].join(' ')}>
                    {statusLabel[ticket.status] ?? ticket.status}
                    {ticket.status === 'confirmed' && ' ✓'}
                  </p>
                </div>

                {/* QR toggle — only for confirmed tickets */}
                {ticket.status === 'confirmed' && ticket.qrCode && (
                  <button
                    type="button"
                    onClick={() => toggleQr(ticket.id)}
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-surface-elevated transition-colors"
                  >
                    {qrVisible[ticket.id] ? t('hideQr') : t('showQr')}
                  </button>
                )}
              </div>

              {/* QR code display */}
              {qrVisible[ticket.id] && ticket.qrCode && (
                <div className="mt-4 flex flex-col items-center gap-3 rounded-md bg-surface-elevated p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticket.qrCode)}`}
                    alt={`QR code for ticket ${ticket.id}`}
                    width={200}
                    height={200}
                    className="rounded-md"
                  />
                  <p className="text-center text-[10px] font-mono text-text-muted break-all max-w-[200px]">
                    {ticket.qrCode}
                  </p>
                  <p className="text-small text-text-muted text-center">
                    {'Bu QR kodu tədbirə giriş üçün göstərin.'}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
