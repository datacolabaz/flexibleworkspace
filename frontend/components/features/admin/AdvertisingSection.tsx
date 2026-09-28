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
type InquiryStatus = 'NEW' | 'CONTACTED' | 'CLOSED';
type Inquiry = {
  id: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  companyName: string | null;
  message: string | null;
  status: InquiryStatus;
  createdAt: string;
  contactedAt: string | null;
};

const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  NEW: 'Yeni',
  CONTACTED: 'Əlaqə saxlanılıb',
  CLOSED: 'Bağlanıb',
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
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inquiryBusyId, setInquiryBusyId] = useState<string | null>(null);

  async function reload() {
    const [placementRows, campaignRows, analyticsRows, inquiryRows] = await Promise.all([
      requestJson<Placement[]>('/api/admin/ads/placements'),
      requestJson<Campaign[]>('/api/admin/ads/campaigns'),
      requestJson<AnalyticsRow[]>('/api/admin/ads/analytics'),
      requestJson<Inquiry[]>('/api/admin/ads/inquiries'),
    ]);
    setPlacements(placementRows);
    setCampaigns(campaignRows);
    setAnalytics(analyticsRows);
    setInquiries(inquiryRows);
  }

  async function updateInquiryStatus(id: string, status: InquiryStatus) {
    setInquiryBusyId(id);
    setError('');
    try {
      await requestJson(`/api/admin/ads/inquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sorğu uğursuz oldu.');
    } finally {
      setInquiryBusyId(null);
    }
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
        <h2 className="font-display text-h3">Sorğular</h2>
        <p className="mt-2 text-small text-text-secondary">
          &ldquo;/advertise&rdquo; formundan gələn sifariş sorğuları — müştəri kreativini (şəkil faylını) əlaqə saxladıqdan sonra özü göndərir, bura yalnız əlaqə məlumatı düşür.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="text-caption text-text-muted">
                <th className="pb-2">Tarix</th>
                <th className="pb-2">Ad, soyad</th>
                <th className="pb-2">Əlaqə</th>
                <th className="pb-2">Şirkət</th>
                <th className="pb-2">Mesaj</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {inquiries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-text-muted">Hələ heç bir sorğu yoxdur.</td>
                </tr>
              )}
              {inquiries.map((inquiry) => (
                <tr key={inquiry.id} className="border-t border-border align-top">
                  <td className="py-3 whitespace-nowrap">{new Date(inquiry.createdAt).toLocaleDateString('az-AZ')}</td>
                  <td className="py-3">{inquiry.contactName}</td>
                  <td className="py-3">
                    <div>{inquiry.contactPhone}</div>
                    {inquiry.contactEmail && <div className="text-caption text-text-muted">{inquiry.contactEmail}</div>}
                  </td>
                  <td className="py-3">{inquiry.companyName ?? '—'}</td>
                  <td className="py-3 max-w-xs">{inquiry.message ?? '—'}</td>
                  <td className="py-3">
                    <span
                      className={
                        inquiry.status === 'NEW'
                          ? 'rounded-full bg-warning-bg px-2 py-0.5 text-caption font-semibold text-warning'
                          : inquiry.status === 'CONTACTED'
                            ? 'rounded-full bg-info-bg px-2 py-0.5 text-caption font-semibold text-info'
                            : 'rounded-full bg-success-bg px-2 py-0.5 text-caption font-semibold text-success'
                      }
                    >
                      {INQUIRY_STATUS_LABEL[inquiry.status]}
                    </span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {inquiry.status !== 'CONTACTED' && (
                      <button
                        type="button"
                        disabled={inquiryBusyId === inquiry.id}
                        className="text-label text-primary disabled:opacity-50"
                        onClick={() => updateInquiryStatus(inquiry.id, 'CONTACTED')}
                      >
                        Əlaqə saxlanıldı
                      </button>
                    )}
                    {inquiry.status !== 'CLOSED' && (
                      <button
                        type="button"
                        disabled={inquiryBusyId === inquiry.id}
                        className="ml-3 text-label text-text-muted disabled:opacity-50"
                        onClick={() => updateInquiryStatus(inquiry.id, 'CLOSED')}
                      >
                        Bağla
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
