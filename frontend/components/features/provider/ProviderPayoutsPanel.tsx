'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ProviderPayoutBalance, ProviderPayout } from '@/lib/api-client/provider-bookings';

// ── Payout status labels ──────────────────────────────────────────────────────

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Gözlənilir',
  AVAILABLE: 'Hazırdır',
  PROCESSING: 'İcra olunur',
  PAID: 'Ödənildi',
  FAILED: 'Uğursuz oldu',
  REVERSED: 'Geri qaytarıldı',
};

const PAYOUT_STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-warning-bg text-warning',
  AVAILABLE: 'bg-success-bg text-success',
  PROCESSING: 'bg-warning-bg text-warning',
  PAID: 'bg-success-bg text-success',
  FAILED: 'bg-error-bg text-error',
  REVERSED: 'bg-surface-elevated text-text-muted',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAzn(minor: string | number): string {
  return `${(Number(minor) / 100).toFixed(2)} AZN`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ── Balance card ──────────────────────────────────────────────────────────────

function BalanceCard({ balance }: { balance: ProviderPayoutBalance }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-md border border-border p-3">
        <p className="text-caption text-text-muted">Gözlənilən ödəniş</p>
        <p className="mt-1 text-body font-semibold text-text-primary">
          {formatAzn(balance.pending)}
        </p>
      </div>
      <div className="rounded-md border border-border p-3">
        <p className="text-caption text-text-muted">Mövcud balans</p>
        <p className="mt-1 text-body font-semibold text-success">
          {formatAzn(balance.available)}
        </p>
      </div>
      <div className="rounded-md border border-border p-3">
        <p className="text-caption text-text-muted">Ödənilmiş (cəmi)</p>
        <p className="mt-1 text-body font-semibold text-text-primary">
          {formatAzn(balance.paid)}
        </p>
      </div>
      <div className="rounded-md border border-border p-3">
        <p className="text-caption text-text-muted">Tranzitdə</p>
        <p className="mt-1 text-body font-semibold text-text-secondary">
          {formatAzn(balance.inTransit)}
        </p>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BalanceSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-md" />
      ))}
    </div>
  );
}

function PayoutRowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

// ── Payout history row ────────────────────────────────────────────────────────

function PayoutRow({ payout }: { payout: ProviderPayout }) {
  const tone = PAYOUT_STATUS_TONE[payout.status] ?? 'bg-surface-elevated text-text-muted';
  const label = PAYOUT_STATUS_LABEL[payout.status] ?? payout.status;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
      <div>
        <p className="text-small font-medium text-text-primary">
          {formatAzn(payout.amount)} — {formatDate(payout.createdAt)}
        </p>
        {payout.paidAt && (
          <p className="text-caption text-text-muted">Ödənildi: {formatDate(payout.paidAt)}</p>
        )}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-caption ${tone}`}>{label}</span>
    </li>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ProviderPayoutsPanel({
  initialBalance,
  initialPayouts,
}: {
  initialBalance: ProviderPayoutBalance | null;
  initialPayouts: ProviderPayout[] | null;
}) {
  const [balance, setBalance] = useState<ProviderPayoutBalance | null>(initialBalance);
  const [payouts, setPayouts] = useState<ProviderPayout[] | null>(initialPayouts);
  const [loading, setLoading] = useState(initialBalance === null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (initialBalance !== null) return;
    setLoading(true);
    Promise.all([
      fetch('/api/provider/payout-balance', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/provider/payouts', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([bal, pays]) => {
        setBalance(bal as ProviderPayoutBalance);
        setPayouts(Array.isArray(pays) ? (pays as ProviderPayout[]) : []);
      })
      .catch(() => setError('Ödəniş məlumatları yüklənmədi. Zəhmət olmasa yenidən cəhd edin.'))
      .finally(() => setLoading(false));
  }, [initialBalance]);

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">Ödənişlər</h3>
        <p className="mt-1 text-small text-text-secondary">
          Balans vəziyyəti və son ödəniş tarixçəsi.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Balance summary */}
      {loading ? <BalanceSkeleton /> : balance ? <BalanceCard balance={balance} /> : null}

      {/* Recent payout history */}
      <div>
        <h4 className="mb-2 text-label text-text-primary">Son ödənişlər</h4>

        {loading && (
          <ul className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <PayoutRowSkeleton />
              </li>
            ))}
          </ul>
        )}

        {!loading && payouts !== null && payouts.length === 0 && (
          <p className="text-small text-text-muted">Hələ heç bir ödəniş yoxdur.</p>
        )}

        {!loading && payouts !== null && payouts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {payouts.slice(0, 10).map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
