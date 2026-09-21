'use client';

import { FormEvent, useState } from 'react';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type SearchIntentResponse = {
  filters: Record<string, string | number | string[]>;
  clarifyingQuestion: string | null;
  confidence: number;
  results?: {
    totalCount: number;
    results: Array<{ id: string; name: string; district: string | null; relevanceScore: number }>;
  };
};

export function AiSearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchIntentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function interpret(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, locale: (document.documentElement.lang || 'az').split('-')[0] }),
      });
      const body = await response.json() as SearchIntentResponse | { error?: { message?: string } };
      if (!response.ok) throw new Error(('error' in body ? body.error?.message : undefined) ?? 'AI axtarış hazırda əlçatan deyil.');
      setResult(body as SearchIntentResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI axtarış uğursuz oldu.');
    } finally { setLoading(false); }
  }

  function applyFilters() {
    if (!result) return;
    const params = new URLSearchParams();
    Object.entries(result.filters).forEach(([key, value]) => {
      if (Array.isArray(value)) { if (value.length) params.set(key, value.join(',')); }
      else if (value !== '' && value !== undefined) params.set(key, String(value));
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <section className="mb-6 rounded-lg border border-primary/30 bg-surface-elevated p-4" aria-labelledby="ai-search-title">
      <p className="text-caption font-semibold uppercase tracking-[0.12em] text-accent">AI axtarış</p>
      <h2 id="ai-search-title" className="mt-1 font-display text-h3">Nə axtardığınızı yazın</h2>
      <p className="mt-1 text-small text-text-secondary">Məsələn: “Nərimanovda 20 nəfərlik, proyektorlu, 150 AZN-dən ucuz görüş otağı”.</p>
      <form onSubmit={interpret} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Məkan, büdcə, tarix və tələblər…" aria-label="AI ilə məkan axtar" />
        <Button type="submit" disabled={loading}>{loading ? 'Axtarılır…' : 'Filtrləri çıxar'}</Button>
      </form>
      {error && <p className="mt-3 text-small text-error">{error}</p>}
      {result && <div className="mt-4 rounded-md border border-border bg-surface p-3">
        <p className="text-small text-text-secondary">{result.clarifyingQuestion ?? `Filterlər hazırdır (${Math.round(result.confidence * 100)}% uyğunluq).`}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(result.filters).map(([key, value]) => <span key={key} className="rounded-full bg-surface-elevated px-2.5 py-1 text-caption text-text-primary">{key}: {Array.isArray(value) ? value.join(', ') : String(value)}</span>)}
        </div>
        {result.results && <p className="mt-3 text-small font-semibold text-text-primary">{result.results.totalCount} uyğun məkan tapıldı.</p>}
        {result.results && result.results.results.length > 0 && <ul className="mt-2 space-y-1 text-small text-text-secondary">
          {result.results.results.slice(0, 3).map((room) => <li key={room.id}>{room.name}{room.district ? ` — ${room.district}` : ''}</li>)}
        </ul>}
        <Button type="button" className="mt-3" size="sm" onClick={applyFilters}>Bu filterlərlə axtar</Button>
      </div>}
    </section>
  );
}
