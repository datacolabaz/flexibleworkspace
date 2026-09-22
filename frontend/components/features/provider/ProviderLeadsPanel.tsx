'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Lead, LeadStatus } from '@/lib/api-client/leads';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Yeni',
  CONTACTED: 'Əlaqə saxlanılıb',
  CONVERTED: 'Müştəriyə çevrildi',
  CLOSED: 'Bağlanıb',
};

const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: 'bg-info-bg text-info',
  CONTACTED: 'bg-warning-bg text-warning',
  CONVERTED: 'bg-success-bg text-success',
  CLOSED: 'bg-surface-elevated text-text-secondary',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('az-AZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sprint 3, Lead Tracking — provider-only leads inbox in `/provider`.
 * Deliberately provider-scoped, not admin-panel: the user's own choice
 * (AskUserQuestion) was "Provider (öz panelində)" only, not
 * "Admin (admin panelində)". Mirrors `ProviderVerificationPanel`'s
 * styling and `admin/page.tsx`'s `ProvidersSection` status-badge/action-
 * button conventions (busy-per-row disabled state, PATCH-then-refresh).
 */
export function ProviderLeadsPanel({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function setStatus(lead: Lead, status: LeadStatus) {
    setBusyId(lead.id);
    setError(undefined);
    try {
      const response = await fetch(`/api/provider/leads/${encodeURIComponent(lead.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        setError(body?.error?.message ?? 'Status yenilənmədi. Yenidən cəhd edin.');
        return;
      }
      const updated = (await response.json()) as Lead;
      setLeads((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setError('Status yenilənmədi. Yenidən cəhd edin.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">Maraqlanan müştərilər</h3>
        <p className="text-small text-text-secondary">
          Otaqlarınıza maraq göstərən, lakin hələ rezervasiya etməyən müştərilər burada görünür.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {leads.length === 0 ? (
        <p className="text-small text-text-muted">Hələ heç bir müraciət yoxdur.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => (
            <li key={lead.id} className="flex flex-col gap-2 rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-body font-semibold text-text-primary">{lead.customerName}</p>
                  <p className="text-small text-text-secondary">{lead.customerPhone}</p>
                  {lead.customerEmail && <p className="text-small text-text-secondary">{lead.customerEmail}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-caption ${STATUS_TONE[lead.status]}`}>
                  {STATUS_LABEL[lead.status]}
                </span>
              </div>
              {lead.message && <p className="text-small text-text-secondary">{lead.message}</p>}
              <p className="text-caption text-text-muted">{formatDate(lead.createdAt)}</p>
              <div className="flex flex-wrap gap-2">
                {lead.status === 'NEW' && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === lead.id}
                    onClick={() => setStatus(lead, 'CONTACTED')}
                  >
                    Əlaqə saxladım
                  </Button>
                )}
                {lead.status === 'CONTACTED' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === lead.id}
                      onClick={() => setStatus(lead, 'CONVERTED')}
                    >
                      Müştəriyə çevrildi
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === lead.id}
                      onClick={() => setStatus(lead, 'CLOSED')}
                    >
                      Bağla
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
