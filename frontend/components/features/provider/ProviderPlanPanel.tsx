'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { MyProviderPlanTier } from '@/lib/api-client/provider-dashboard';
import type { PlanUpgradeRequest } from '@/lib/api-client/plan-upgrade-requests';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

const PLAN_LABEL: Record<MyProviderPlanTier, string> = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('az-AZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * "Planım" panel, `/provider` — FREE vs PRO comparison plus a way to ask
 * for an upgrade. Built per the user's two explicit choices (AskUserQuestion):
 * this lives as a section inside the provider panel (not a public marketing
 * page), and the upgrade button opens a request form rather than a live
 * checkout — there is no payment gateway yet, so "Pro-ya keç" here means
 * "tell the admin I want Pro," and an admin grants it by hand from the
 * admin panel's "Yüksəltmə sorğuları" section (`setPlanTier`).
 *
 * Figures are the ones the user gave directly: FREE = 0 AZN / 5 şəkil / 1
 * cover / video yoxdur; PRO = 9 AZN/ay / 10 şəkil / 1 video / daha çox
 * görünürlük / analytics / əlavə listing imkanları.
 */
export function ProviderPlanPanel({
  planTier,
  initialRequest,
}: {
  planTier: MyProviderPlanTier;
  initialRequest: PlanUpgradeRequest | null;
}) {
  const [request, setRequest] = useState(initialRequest);
  const [note, setNote] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isPro = planTier !== 'FREE';

  async function submitRequest() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch('/api/provider/plan-upgrade-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        setError(body?.error?.message ?? 'Sorğu göndərilmədi. Yenidən cəhd edin.');
        return;
      }
      const created = (await response.json()) as PlanUpgradeRequest;
      setRequest(created);
      setShowForm(false);
    } catch {
      setError('Sorğu göndərilmədi. Yenidən cəhd edin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-h4 text-text-primary">Planım</h3>
          <p className="text-small text-text-secondary">Hazırkı plan: {PLAN_LABEL[planTier]}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-caption ${
            isPro ? 'bg-success-bg text-success' : 'bg-surface-elevated text-text-secondary'
          }`}
        >
          {PLAN_LABEL[planTier]}
        </span>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`flex flex-col gap-2 rounded-md border p-4 ${planTier === 'FREE' ? 'border-primary' : 'border-border'}`}>
          <p className="font-display text-h4 text-text-primary">FREE</p>
          <p className="text-small text-text-secondary">0 AZN</p>
          <ul className="mt-1 flex flex-col gap-1 text-small text-text-secondary">
            <li>5 şəkil</li>
            <li>1 üz qabığı (cover) şəkli</li>
            <li>Video yoxdur</li>
          </ul>
        </div>
        <div className={`flex flex-col gap-2 rounded-md border p-4 ${planTier !== 'FREE' ? 'border-primary' : 'border-border'}`}>
          <p className="font-display text-h4 text-text-primary">PRO</p>
          <p className="text-small text-text-secondary">9 AZN/ay</p>
          <ul className="mt-1 flex flex-col gap-1 text-small text-text-secondary">
            <li>10 şəkil</li>
            <li>1 video</li>
            <li>Daha çox görünürlük</li>
            <li>Analitika</li>
            <li>Əlavə listing imkanları</li>
          </ul>
        </div>
      </div>

      {planTier === 'FREE' &&
        (request ? (
          <p className="rounded-md bg-surface-elevated px-4 py-3 text-small text-text-secondary">
            Sorğunuz göndərilib ({formatDate(request.createdAt)}). Tezliklə sizinlə əlaqə saxlayacağıq.
          </p>
        ) : showForm ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-label">
              Qeyd (istəyə bağlı)
              <textarea
                className="min-h-24 w-full rounded-sm border border-border-strong bg-surface px-4 py-3 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Məs. neçə otağınız var, nə vaxt keçmək istəyirsiniz və s."
                maxLength={1000}
              />
            </label>
            <div className="flex gap-3">
              <Button type="button" disabled={busy} onClick={submitRequest}>
                {busy ? 'Göndərilir…' : 'Sorğunu göndər'}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setShowForm(false)}>
                Ləğv et
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={() => setShowForm(true)} className="self-start">
            Pro-ya keç
          </Button>
        ))}
    </Card>
  );
}
