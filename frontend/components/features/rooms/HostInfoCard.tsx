'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';

export interface HostInfoCardProps {
  providerName: string | null | undefined;
  verified: boolean | null | undefined;
}

/**
 * "Sahib (Host) haqqında məlumatlar" — deliberately minimal: `RoomDetail`
 * exposes only `providerName` + `verified` (both inherited from
 * `RoomSummary`; there's no `/providers/{id}` public profile endpoint or
 * extra provider fields on this schema — checked `29_API_OPENAPI.yaml`
 * and `search.service.ts`'s actual SQL). A fuller host profile (photo,
 * bio, response rate, other listings) would need a new backend surface;
 * flagged in PHASE4_REPORT.md rather than built against invented data.
 */
export function HostInfoCard({ providerName, verified }: HostInfoCardProps) {
  const t = useTranslations('room');

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-h4 font-display text-text-secondary" aria-hidden="true">
        {providerName?.charAt(0)?.toUpperCase() ?? '?'}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-small text-text-muted">{t('hostedBy')}</p>
        <div className="flex items-center gap-2">
          <p className="truncate text-body font-semibold text-text-primary">{providerName ?? t('unknownHost')}</p>
          {verified && <Badge variant="verified">{t('verified')}</Badge>}
        </div>
      </div>
    </div>
  );
}
