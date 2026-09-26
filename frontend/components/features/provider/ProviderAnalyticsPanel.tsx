import { Card } from '@/components/ui/Card';
import type { ProviderAnalytics } from '@/lib/api-client/provider-analytics';

/**
 * Provider Analytics (Feature Gap Analysis, Medium priority) — three
 * read-only stat tiles in `/provider`, alongside `ProviderRoomsPanel` and
 * `ProviderLeadsPanel`. Plain server-rendered
 * component (no 'use client', no hooks) since it only displays numbers
 * the page already fetched — nothing here is interactive.
 *
 * Tile wrapper/typography loosely mirrors `AdminAnalyticsCharts.tsx`'s
 * eyebrow + `font-display text-h3` heading convention, scaled down to
 * `/provider`'s simpler single-card layout.
 */
export function ProviderAnalyticsPanel({ analytics }: { analytics: ProviderAnalytics }) {
  const confirmationLabel =
    analytics.confirmationRate === null ? '—' : `${analytics.confirmationRate.toLocaleString('az-AZ')}%`;

  const tiles = [
    { label: 'Baxışlar', value: analytics.views.toLocaleString('az-AZ') },
    { label: 'Rezervasiya sorğuları', value: analytics.requests.toLocaleString('az-AZ') },
    { label: 'Təsdiq faizi', value: confirmationLabel },
  ];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-accent">Analitika</p>
        <h3 className="mt-1 font-display text-h4 text-text-primary">Son 30 gün</h3>
        <p className="mt-1 text-small text-text-secondary">
          Otaqlarınıza baxış sayı, gələn rezervasiya sorğuları və onların nə qədərinin təsdiqləndiyi.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-md border border-border bg-surface-elevated p-4">
            <p className="font-display text-h3 text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tile.value}
            </p>
            <p className="mt-1 text-small text-text-secondary">{tile.label}</p>
          </div>
        ))}
      </div>

      {analytics.requests === 0 && (
        <p className="text-caption text-text-muted">
          Hələ rezervasiya sorğusu yoxdur — bu rəqəmlər sorğular daxil olduqca yenilənəcək.
        </p>
      )}
    </Card>
  );
}
