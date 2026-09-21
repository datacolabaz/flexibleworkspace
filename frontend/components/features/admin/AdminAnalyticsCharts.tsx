'use client';

type PageStat = { path: string; views: number };

export function AdminAnalyticsCharts({ pages }: { pages: PageStat[] }) {
  const maxViews = Math.max(1, ...pages.map((page) => page.views));
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-labelledby="analytics-chart-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-accent">Analitika</p>
          <h2 id="analytics-chart-title" className="mt-1 font-display text-h3">Ən çox baxılan səhifələr</h2>
          <p className="mt-1 text-small text-text-secondary">Son 30 gün üzrə anonim pageview statistikası</p>
        </div>
        <span className="rounded-full bg-success-bg px-2.5 py-1 text-caption text-success">LIVE</span>
      </div>
      {pages.length === 0 ? (
        <p className="mt-6 text-small text-text-secondary">Hələ kifayət qədər analitika məlumatı yoxdur.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {pages.map((page) => (
            <div key={page.path}>
              <div className="mb-1 flex items-center justify-between gap-4 text-small">
                <span className="truncate text-text-secondary" title={page.path}>{page.path}</span>
                <strong className="text-text-primary">{page.views.toLocaleString('az-AZ')}</strong>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, (page.views / maxViews) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
