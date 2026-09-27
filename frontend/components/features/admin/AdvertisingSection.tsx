'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

type Placement = { id: string; key: string; name: string; rotationIntervalSeconds: number };
type Campaign = {
  id: string;
  placement?: { key: string };
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  advertiserName: string;
  creativeUrl: string;
  clickUrl: string;
  weight: number;
  creativeSize: string;
};
type AnalyticsRow = {
  campaignId: string;
  advertiserName: string;
  placementKey: string;
  live: boolean;
  impressions: number;
  clicks: number;
  ctr: number;
};

const EMPTY_FORM = {
  placementKey: 'homepage_sidebar',
  active: false,
  startsAt: '',
  endsAt: '',
  advertiserName: '',
  creativeUrl: '',
  clickUrl: '',
  weight: 1,
  creativeSize: '336x280',
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | T | undefined;
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } } | undefined)?.error?.message ?? 'Sorğu uğursuz oldu.');
  }
  return body as T;
}

export function AdvertisingSection() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [placementRows, campaignRows, analyticsRows] = await Promise.all([
      requestJson<Placement[]>('/api/admin/ads/placements'),
      requestJson<Campaign[]>('/api/admin/ads/campaigns'),
      requestJson<AnalyticsRow[]>('/api/admin/ads/analytics'),
    ]);
    setPlacements(placementRows);
    setCampaigns(campaignRows);
    setAnalytics(analyticsRows);
  }

  useEffect(() => {
    reload().catch((reason: Error) => setError(reason.message));
  }, []);

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        weight: Number(form.weight),
      };
      if (editingId) {
        await requestJson(`/api/admin/ads/campaigns/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await requestJson('/api/admin/ads/campaigns', { method: 'POST', body: JSON.stringify(payload) });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sorğu uğursuz oldu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-small text-error">{error}</p>}
      <Card>
        <h2 className="font-display text-h3">Yerləşdirmə</h2>
        <p className="mt-2 text-small text-text-secondary">Bir slot, bir anda bir kreativ. Rotasiya yalnız 30/45/60/90 saniyə ola bilər.</p>
        <div className="mt-4 space-y-3">
          {placements.map((placement) => (
            <label key={placement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <span className="text-label">{placement.name} <span className="text-caption text-text-muted">({placement.key})</span></span>
              <select
                className="min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-small"
                value={placement.rotationIntervalSeconds}
                onChange={async (event) => {
                  try {
                    await requestJson(`/api/admin/ads/placements/${placement.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ rotationIntervalSeconds: Number(event.target.value) }),
                    });
                    await reload();
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : 'Sorğu uğursuz oldu.');
                  }
                }}
              >
                {[30, 45, 60, 90].map((value) => (
                  <option key={value} value={value}>{value}s</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-h3">{editingId ? 'Kampaniyanı redaktə et' : 'Yeni kampaniya'}</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={saveCampaign}>
          <Input placeholder="Reklam verən" value={form.advertiserName} onChange={(event) => setForm({ ...form, advertiserName: event.target.value })} required />
          <Input placeholder="Kreativ URL (şəkil)" value={form.creativeUrl} onChange={(event) => setForm({ ...form, creativeUrl: event.target.value })} required />
          <Input placeholder="Keçid URL" value={form.clickUrl} onChange={(event) => setForm({ ...form, clickUrl: event.target.value })} required />
          <Input type="number" min={1} max={100} placeholder="Çəki" value={form.weight} onChange={(event) => setForm({ ...form, weight: Number(event.target.value) })} required />
          <Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          <Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
          <select className="min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-small" value={form.creativeSize} onChange={(event) => setForm({ ...form, creativeSize: event.target.value })}>
            <option value="336x280">336×280</option>
            <option value="300x250">300×250</option>
          </select>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Aktiv
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <Button type="submit" isLoading={busy}>{editingId ? 'Yenilə' : 'Yarat'}</Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                Ləğv et
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="font-display text-h3">Kampaniyalar</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="text-caption text-text-muted">
                <th className="pb-2">Reklam verən</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Çəki</th>
                <th className="pb-2">Ölçü</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-border">
                  <td className="py-3">{campaign.advertiserName}</td>
                  <td>{campaign.active ? 'Aktiv' : 'Dayandırılıb'}</td>
                  <td>{campaign.weight}</td>
                  <td>{campaign.creativeSize}</td>
                  <td className="text-right">
                    <button type="button" className="text-label text-primary" onClick={() => {
                      setEditingId(campaign.id);
                      setForm({
                        placementKey: campaign.placement?.key ?? 'homepage_sidebar',
                        active: campaign.active,
                        startsAt: campaign.startsAt ? campaign.startsAt.slice(0, 16) : '',
                        endsAt: campaign.endsAt ? campaign.endsAt.slice(0, 16) : '',
                        advertiserName: campaign.advertiserName,
                        creativeUrl: campaign.creativeUrl,
                        clickUrl: campaign.clickUrl,
                        weight: campaign.weight,
                        creativeSize: campaign.creativeSize,
                      });
                    }}>Redaktə</button>
                    <button type="button" className="ml-3 text-label text-error" onClick={async () => {
                      if (!window.confirm('Kampaniya silinsin?')) return;
                      await requestJson(`/api/admin/ads/campaigns/${campaign.id}`, { method: 'DELETE' });
                      await reload();
                    }}>Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-h3">Analitika</h2>
        <p className="mt-2 text-small text-text-secondary">Impression yalnız slot görünəndə sayılır. Billing yoxdur.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="text-caption text-text-muted">
                <th className="pb-2">Kampaniya</th>
                <th className="pb-2">Impression</th>
                <th className="pb-2">Klik</th>
                <th className="pb-2">CTR</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((row) => (
                <tr key={row.campaignId} className="border-t border-border">
                  <td className="py-3">{row.advertiserName}{row.live ? '' : ' (offline)'}</td>
                  <td>{row.impressions}</td>
                  <td>{row.clicks}</td>
                  <td>{row.ctr}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
