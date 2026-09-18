'use client';

import { useTranslations } from 'next-intl';

export interface CancellationPolicyCardProps {
  cancellationPolicy: Record<string, unknown> | null | undefined;
}

interface CancellationPolicyShape {
  free_until_hours?: number;
  partial_refund_pct?: number;
}

/**
 * Renders as "Otaq qaydaları" (room rules). The `room` table has no
 * `equipment`/`rules` columns anywhere in 28_DATABASE_DDL.sql or
 * SearchService.getRoomDetail()'s SQL — a prior OpenAPI doc claiming both
 * was doc-only drift, removed this pass (29_API_OPENAPI.yaml, see
 * PHASE4_REPORT.md). The one rule the backend actually enforces and
 * exposes is the cancellation policy (RefundsService.computeRefundPercentage,
 * read live during a real cancellation), so that's what this renders
 * instead of inventing a `rules` field with no backing data — the same
 * "surface the gap, don't invent it" call made throughout this project.
 *
 * Mirrors RefundsService's own fallback exactly: free cancellation until
 * `free_until_hours` before start (default 24h when unset), a partial
 * refund after that only if `partial_refund_pct` is set, otherwise none.
 */
export function CancellationPolicyCard({ cancellationPolicy }: CancellationPolicyCardProps) {
  const t = useTranslations('room');
  const policy = (cancellationPolicy ?? {}) as CancellationPolicyShape;
  const freeUntilHours = policy.free_until_hours ?? 24;
  const partialRefundPct = policy.partial_refund_pct;

  return (
    <div className="flex flex-col gap-2 text-small text-text-primary">
      <p className="flex items-start gap-2">
        <span aria-hidden="true">✓</span>
        <span>{t('policyFreeCancellation', { hours: freeUntilHours })}</span>
      </p>
      {partialRefundPct != null ? (
        <p className="flex items-start gap-2">
          <span aria-hidden="true">↩</span>
          <span>{t('policyPartialRefund', { pct: partialRefundPct })}</span>
        </p>
      ) : (
        <p className="flex items-start gap-2">
          <span aria-hidden="true">✕</span>
          <span>{t('policyNoRefund')}</span>
        </p>
      )}
    </div>
  );
}
