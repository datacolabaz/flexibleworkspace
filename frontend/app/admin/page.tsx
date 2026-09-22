'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AdminAnalyticsCharts } from '@/components/features/admin/AdminAnalyticsCharts';

type Section = 'overview' | 'listings' | 'pricing' | 'providers' | 'users' | 'audit';
type RoomStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

type AdminRoom = {
  id: string;
  name: string;
  status: RoomStatus;
  capacityMin: number;
  capacityMax: number;
  basePriceAmount: string;
  basePriceCurrency: string;
  updatedAt: string;
  locationName: string | null;
  city: string | null;
  providerName: string | null;
};

type AdminAuditEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  isActive: boolean;
  roles?: Array<{ role: string; providerId: string | null }>;
};

type AdminSummary = { totalRooms: number; activeRooms: number; draftRooms: number; totalUsers: number; bookingsToday: number; analytics?: { totalViews: number; uniqueVisitors: number; todayViews: number; todayUniqueVisitors: number; topPages: Array<{ path: string; views: number }> } };
type AdminPricing = { percentage: string; minimumPriceAmount: string; currency: string; updatedAt?: string | null };
type ProviderVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
type AdminProvider = { id: string; legalName: string; displayName: string; slug: string; category: string | null; taxId: string | null; verificationStatus: ProviderVerificationStatus; planTier: string; createdAt: string };

const NAV_ITEMS: Array<{ id: Section; label: string; description: string }> = [
  { id: 'overview', label: 'İcmal', description: 'Canlı kataloq göstəriciləri və növbəti addımlar' },
  { id: 'listings', label: 'Məkanlar', description: 'Yoxlama, təsdiq və qiymət nəzarəti' },
  { id: 'pricing', label: 'Qiymət və qaydalar', description: 'Gələcək komissiya və platforma ayarları' },
  { id: 'providers', label: 'Provider-lər', description: 'Doğrulama gözləyən və mövcud provider-lər' },
  { id: 'users', label: 'İstifadəçilər', description: 'Müştəri, provider və rollar' },
  { id: 'audit', label: 'Audit jurnalı', description: 'Kim nəyi və nə vaxt dəyişdi' },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | T | undefined;
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | undefined)?.error?.message ?? 'Sorğu uğursuz oldu.';
    throw new Error(message);
  }
  return body as T;
}

function formatPrice(amount: string, currency: string) {
  return `${(Number(amount) / 100).toLocaleString('az-AZ', { maximumFractionDigits: 2 })} ${currency}/saat`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('az-AZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminHome() {
  const [section, setSection] = useState<Section>('overview');
  const [query, setQuery] = useState('');
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingRoom, setEditingRoom] = useState<AdminRoom | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [pricing, setPricing] = useState<AdminPricing | null>(null);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [providerStatusFilter, setProviderStatusFilter] = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const endpoint = section === 'overview'
      ? '/api/admin/dashboard/summary'
      : section === 'pricing'
        ? '/api/admin/pricing/default'
        : section === 'providers'
          ? `/api/admin/providers${providerStatusFilter ? `?verificationStatus=${providerStatusFilter}` : ''}`
        : section === 'audit'
      ? '/api/admin/audit-log'
      : section === 'users'
        ? `/api/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`
        : `/api/admin/rooms${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;

    requestJson<AdminRoom[] | AdminAuditEntry[] | AdminUser[] | AdminProvider[]>(endpoint, { signal: controller.signal })
      .then((data) => {
        if (section === 'overview') setSummary(data as unknown as AdminSummary);
        else if (section === 'pricing') setPricing(data as unknown as AdminPricing);
        else if (section === 'providers') setProviders(data as AdminProvider[]);
        else if (section === 'audit') setAudit(data as AdminAuditEntry[]);
        else if (section === 'users') setUsers(data as AdminUser[]);
        else setRooms(data as AdminRoom[]);
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [section, query, providerStatusFilter]);

  const activeRooms = useMemo(() => rooms.filter((room) => room.status === 'ACTIVE').length, [rooms]);
  const pendingRooms = useMemo(() => rooms.filter((room) => room.status === 'DRAFT').length, [rooms]);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/az" aria-label="Spotva ana səhifə" title="Spotva ana səhifə" className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <Logo variant="auto" height={28} />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-small text-text-secondary sm:inline">İdarəetmə paneli</span>
            <Link href="/az" className="rounded-md border border-border-strong px-3 py-2 text-label text-text-primary transition-colors hover:bg-surface-elevated">
              Sayta qayıt
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="self-start rounded-lg border border-border bg-surface p-3 shadow-sm lg:sticky lg:top-6">
          <div className="mb-3 px-3 py-2">
            <p className="text-caption font-semibold uppercase tracking-[0.14em] text-text-muted">Spotva Admin</p>
            <p className="mt-1 text-small text-text-secondary">Əməliyyat mərkəzi</p>
          </div>
          <nav aria-label="Admin bölmələri" className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} type="button" onClick={() => { setSection(item.id); setQuery(''); setError(''); }} className={`min-w-max rounded-md px-3 py-2.5 text-left text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${section === item.id ? 'bg-primary text-primary-on' : 'text-text-secondary hover:bg-surface-elevated hover:text-accent'}`}>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main id="main-content" className="min-w-0">
          <div className="mb-6">
            <p className="text-label text-accent">Nəzarət paneli</p>
            <h1 className="mt-1 font-display text-h2 text-text-primary">{NAV_ITEMS.find((item) => item.id === section)?.label}</h1>
            <p className="mt-2 max-w-2xl text-body text-text-secondary">{NAV_ITEMS.find((item) => item.id === section)?.description}</p>
          </div>

          {error && <div className="mb-5 rounded-md border border-error/30 bg-error-bg px-4 py-3 text-small text-error">{error}</div>}
          {loading && <div className="mb-5 rounded-md border border-border bg-surface px-4 py-3 text-small text-text-secondary">Məlumatlar yüklənir…</div>}

          {section === 'overview' && <Overview rooms={rooms} summary={summary} activeRooms={activeRooms} pendingRooms={pendingRooms} onNavigate={setSection} />}
          {section === 'listings' && <Listings rooms={rooms} query={query} onQuery={setQuery} editingRoom={editingRoom} onEdit={setEditingRoom} onSaved={(room) => { setRooms((current) => current.map((item) => item.id === room.id ? room : item)); setEditingRoom(null); }} />}
          {section === 'pricing' && <PricingSection pricing={pricing} onSaved={setPricing} />}
          {section === 'providers' && <ProvidersSection providers={providers} statusFilter={providerStatusFilter} onFilterChange={setProviderStatusFilter} onUpdated={(updated) => setProviders((current) => current.map((item) => item.id === updated.id ? updated : item))} />}
          {section === 'users' && <UsersSection users={users} query={query} onQuery={setQuery} />}
          {section === 'audit' && <AuditSection entries={audit} />}
        </main>
      </div>
    </div>
  );
}

function Overview({ rooms, summary, activeRooms, pendingRooms, onNavigate }: { rooms: AdminRoom[]; summary: AdminSummary | null; activeRooms: number; pendingRooms: number; onNavigate: (section: Section) => void }) {
  const stats = [
    { label: 'Məkan kataloqu', value: summary?.totalRooms ?? rooms.length, note: 'Canlı dashboard summary', tone: 'text-primary' },
    { label: 'Aktiv məkanlar', value: summary?.activeRooms ?? activeRooms, note: 'Statusu ACTIVE olanlar', tone: 'text-success' },
    { label: 'Yoxlama gözləyən', value: summary?.draftRooms ?? pendingRooms, note: 'Statusu DRAFT olanlar', tone: 'text-warning' },
    { label: 'Bu gün rezervasiyalar', value: summary?.bookingsToday ?? '—', note: 'Aktiv booking statusları', tone: 'text-info' },
    { label: 'Unikal ziyarətçi (30 gün)', value: summary?.analytics?.uniqueVisitors ?? '—', note: 'Anonim, hash-lanmış visitor ID', tone: 'text-info' },
    { label: 'Baxışlar (30 gün)', value: summary?.analytics?.totalViews ?? '—', note: 'Müştəri səhifələrinə baxış', tone: 'text-primary' },
    { label: 'Bu gün ziyarətçi', value: summary?.analytics?.todayUniqueVisitors ?? '—', note: 'Bugünkü unikal visitor', tone: 'text-success' },
    { label: 'Bu gün baxış', value: summary?.analytics?.todayViews ?? '—', note: 'Bugünkü pageview', tone: 'text-warning' },
  ];

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <Card key={stat.label} className="p-5"><p className="text-small text-text-secondary">{stat.label}</p><p className={`mt-3 font-display text-h2 ${stat.tone}`}>{stat.value}</p><p className="mt-1 text-caption text-text-muted">{stat.note}</p></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <Card><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-h3">İdarəetmə prioritetləri</h2><p className="mt-2 text-small text-text-secondary">Bu paneldə dəyişikliklər artıq canlı admin endpoint-lərinə gedir və audit izi yaradır.</p></div><span className="rounded-full bg-success-bg px-2.5 py-1 text-caption text-success">LIVE API</span></div><div className="mt-5 space-y-3">{[['Məkanları yoxla', 'Canlı kataloq və qiymət/tutum düzəlişi', 'listings'], ['Qiymət qaydalarını qur', 'Platforma komissiyası üçün ayrıca settings API lazımdır', 'pricing'], ['İcazələri nəzərdən keçir', 'İstifadəçi endpoint-i qoşulub', 'users']].map(([title, note, target]) => <button key={title} type="button" onClick={() => onNavigate(target as Section)} className="flex w-full items-center justify-between rounded-md border border-border p-4 text-left transition-colors hover:border-primary hover:bg-surface-elevated"><span><span className="block text-label">{title}</span><span className="mt-1 block text-small text-text-secondary">{note}</span></span><span className="text-accent">→</span></button>)}</div></Card>
      <Card><h2 className="font-display text-h3">Sistem vəziyyəti</h2><div className="mt-5 space-y-4">{[['Public sayt', 'İşlək', 'bg-success-bg text-success'], ['Məkan API', 'İşlək', 'bg-success-bg text-success'], ['Admin auth', 'Server-side qorunur', 'bg-success-bg text-success'], ['Audit API', 'Qoşulub', 'bg-success-bg text-success']].map(([label, status, tone]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"><span className="text-small text-text-secondary">{label}</span><span className={`rounded-full px-2.5 py-1 text-caption ${tone}`}>{status}</span></div>)}</div></Card>
    </div>
    <AdminAnalyticsCharts pages={summary?.analytics?.topPages ?? []} />
  </div>;
}

function Listings({ rooms, query, onQuery, editingRoom, onEdit, onSaved }: { rooms: AdminRoom[]; query: string; onQuery: (value: string) => void; editingRoom: AdminRoom | null; onEdit: (room: AdminRoom | null) => void; onSaved: (room: AdminRoom) => void }) {
  return <section className="space-y-5" aria-labelledby="listings-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 id="listings-title" className="font-display text-h3">Məkan kataloqu</h2><Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Məkan, provider və ya şəhər axtar" className="sm:max-w-xs" /></div>
    <Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-small"><thead className="border-b border-border bg-surface-elevated text-label text-text-secondary"><tr><th className="px-5 py-3">Məkan</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Qiymət</th><th className="px-5 py-3">Əməliyyat</th></tr></thead><tbody>{rooms.map((room) => <tr key={room.id} className="border-b border-border last:border-0"><td className="px-5 py-4"><strong className="block">{room.name}</strong><span className="text-caption text-text-muted">{room.locationName ?? room.city ?? '—'}</span></td><td className="px-5 py-4 text-text-secondary">{room.providerName ?? '—'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-caption ${room.status === 'ACTIVE' ? 'bg-success-bg text-success' : room.status === 'DRAFT' ? 'bg-warning-bg text-warning' : 'bg-surface-elevated text-text-secondary'}`}>{room.status}</span></td><td className="px-5 py-4">{formatPrice(room.basePriceAmount, room.basePriceCurrency)}<span className="block text-caption text-text-muted">{room.capacityMin}–{room.capacityMax} nəfər</span></td><td className="px-5 py-4"><Button type="button" variant="secondary" size="sm" onClick={() => onEdit(room)}>Düzəliş et</Button></td></tr>)}</tbody></table></div>{rooms.length === 0 && <p className="p-5 text-small text-text-secondary">Nəticə tapılmadı.</p>}</Card>
    {editingRoom && <RoomEditor room={editingRoom} onCancel={() => onEdit(null)} onSaved={onSaved} />}
  </section>;
}

function RoomEditor({ room, onCancel, onSaved }: { room: AdminRoom; onCancel: () => void; onSaved: (room: AdminRoom) => void }) {
  const [price, setPrice] = useState(String(Number(room.basePriceAmount) / 100));
  const [capacityMax, setCapacityMax] = useState(String(room.capacityMax));
  const [status, setStatus] = useState<RoomStatus>(room.status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (reason.trim().length < 3) { setError('Səbəb ən azı 3 simvol olmalıdır.'); return; }
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) { setError('Saatlıq qiymət 0-dan böyük olmalıdır.'); return; }
    if (!Number.isInteger(Number(capacityMax)) || Number(capacityMax) < room.capacityMin) { setError(`Maks. tutum ən azı ${room.capacityMin} olmalıdır.`); return; }
    setSaving(true); setError('');
    try {
      const updated = await requestJson<AdminRoom>(`/api/admin/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ basePriceAmount: Math.round(Number(price) * 100), capacityMax: Number(capacityMax), status, reason }) });
      onSaved(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Yadda saxlamaq mümkün olmadı.'); }
    finally { setSaving(false); }
  }

  return <Card className="border-primary/40 bg-surface-elevated"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-caption uppercase tracking-[0.12em] text-accent">Canlı düzəliş</p><h3 className="mt-1 font-display text-h3">{room.name}</h3></div><button type="button" onClick={onCancel} className="text-small text-text-secondary hover:text-text-primary">Bağla</button></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="flex flex-col gap-2 text-label">Saatlıq qiymət (AZN)<Input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="flex flex-col gap-2 text-label">Maks. tutum<Input type="number" min="1" value={capacityMax} onChange={(event) => setCapacityMax(event.target.value)} /></label><label className="flex flex-col gap-2 text-label">Status<select className="min-h-11 rounded-md border border-border-strong bg-surface px-3" value={status} onChange={(event) => setStatus(event.target.value as RoomStatus)}><option value="DRAFT">DRAFT</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label></div><label className="mt-4 flex flex-col gap-2 text-label">Dəyişiklik səbəbi<Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Məs. Provider təsdiqlədi" /></label>{error && <p className="mt-3 text-small text-error">{error}</p>}<div className="mt-5 flex gap-3"><Button type="button" onClick={save} disabled={saving}>{saving ? 'Yadda saxlanır…' : 'Yadda saxla'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Ləğv et</Button></div></Card>;
}

function PricingSection({ pricing, onSaved }: { pricing: AdminPricing | null; onSaved: (value: AdminPricing) => void }) {
  const [percentage, setPercentage] = useState('');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (pricing) { setPercentage(pricing.percentage); setMinimumPrice(String(Number(pricing.minimumPriceAmount) / 100)); } }, [pricing]);
  async function save() {
    if (!reason.trim() || reason.trim().length < 3) { setError('Səbəb ən azı 3 simvol olmalıdır.'); return; }
    if (!Number.isFinite(Number(percentage)) || Number(percentage) < 0 || Number(percentage) > 100) { setError('Komissiya 0–100 aralığında olmalıdır.'); return; }
    if (!Number.isFinite(Number(minimumPrice)) || Number(minimumPrice) < 0) { setError('Minimum qiymət düzgün daxil edilməlidir.'); return; }
    setSaving(true); setError('');
    try { const updated = await requestJson<AdminPricing>('/api/admin/pricing/default', { method: 'PATCH', body: JSON.stringify({ percentage: Number(percentage), minimumPriceAmount: Math.round(Number(minimumPrice) * 100), reason }) }); onSaved(updated); setReason(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Yadda saxlamaq mümkün olmadı.'); }
    finally { setSaving(false); }
  }
  return <section className="space-y-5"><Card><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-caption uppercase tracking-[0.12em] text-accent">Platforma qaydaları</p><h2 className="mt-1 font-display text-h3">Qiymət və komissiya</h2><p className="mt-2 max-w-2xl text-small text-text-secondary">Bu qaydalar yeni rezervasiyalarda istifadə ediləcək. Tarixi ledger məlumatları dəyişmir və hər update audit jurnalına yazılır.</p></div><span className="rounded-full bg-success-bg px-2.5 py-1 text-caption text-success">LIVE API</span></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-label">Platforma komissiyası (%)<Input type="number" min="0" max="100" step="0.01" value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label><label className="flex flex-col gap-2 text-label">Minimum saatlıq qiymət (AZN)<Input type="number" min="0" step="0.01" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} /></label></div><label className="mt-4 flex flex-col gap-2 text-label">Dəyişiklik səbəbi<Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Məs. Yeni platforma komissiyası" /></label>{error && <p className="mt-3 rounded-md bg-error-bg px-4 py-3 text-small text-error">{error}</p>}<div className="mt-5 flex items-center justify-between gap-4"><p className="text-caption text-text-muted">Son yenilənmə: {pricing?.updatedAt ? formatDate(pricing.updatedAt) : '—'}</p><Button type="button" onClick={save} disabled={saving}>{saving ? 'Yadda saxlanır…' : 'Qaydaları yadda saxla'}</Button></div></Card></section>;
}

function ProvidersSection({ providers, statusFilter, onFilterChange, onUpdated }: { providers: AdminProvider[]; statusFilter: string; onFilterChange: (value: string) => void; onUpdated: (provider: AdminProvider) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function verify(provider: AdminProvider, decision: 'VERIFIED' | 'REJECTED') {
    const notes = window.prompt(decision === 'VERIFIED' ? 'Təsdiq qeydi (istəyə bağlı):' : 'Rədd səbəbi:');
    if (decision === 'REJECTED' && (!notes || notes.trim().length < 3)) { setError('Rədd üçün səbəb yazılmalıdır (ən azı 3 simvol).'); return; }
    setBusyId(provider.id); setError('');
    try {
      const updated = await requestJson<AdminProvider>(`/api/admin/providers/${provider.id}/verify`, { method: 'POST', body: JSON.stringify({ decision, notes: notes?.trim() || undefined }) });
      onUpdated(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Əməliyyat uğursuz oldu.'); }
    finally { setBusyId(null); }
  }

  async function toggleSuspend(provider: AdminProvider) {
    const suspending = provider.verificationStatus === 'VERIFIED';
    const notes = window.prompt(suspending ? 'Suspend səbəbi:' : 'Bərpa qeydi (istəyə bağlı):');
    if (suspending && (!notes || notes.trim().length < 3)) { setError('Suspend üçün səbəb yazılmalıdır (ən azı 3 simvol).'); return; }
    setBusyId(provider.id); setError('');
    try {
      const updated = await requestJson<AdminProvider>(`/api/admin/providers/${provider.id}/suspend`, { method: 'PATCH', body: JSON.stringify({ suspended: suspending, notes: notes?.trim() || undefined }) });
      onUpdated(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Əməliyyat uğursuz oldu.'); }
    finally { setBusyId(null); }
  }

  const statusLabel: Record<ProviderVerificationStatus, string> = { PENDING: 'Gözləyir', VERIFIED: 'Təsdiqlənib', REJECTED: 'Rədd edilib', SUSPENDED: 'Dayandırılıb' };
  const statusTone: Record<ProviderVerificationStatus, string> = { PENDING: 'bg-warning-bg text-warning', VERIFIED: 'bg-success-bg text-success', REJECTED: 'bg-error-bg text-error', SUSPENDED: 'bg-error-bg text-error' };

  return <section className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-display text-h3">Provider-lər</h2>
      <select className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-label" value={statusFilter} onChange={(event) => onFilterChange(event.target.value)}>
        <option value="">Hamısı</option>
        <option value="PENDING">Gözləyir</option>
        <option value="VERIFIED">Təsdiqlənib</option>
        <option value="REJECTED">Rədd edilib</option>
        <option value="SUSPENDED">Dayandırılıb</option>
      </select>
    </div>
    {error && <p className="rounded-md bg-error-bg px-4 py-3 text-small text-error">{error}</p>}
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-small">
          <thead className="border-b border-border bg-surface-elevated text-label text-text-secondary">
            <tr>
              <th className="px-5 py-3">Provider</th>
              <th className="px-5 py-3">Kateqoriya</th>
              <th className="px-5 py-3">VÖEN</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Qeydiyyat</th>
              <th className="px-5 py-3">Əməliyyat</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id} className="border-b border-border last:border-0">
                <td className="px-5 py-4"><strong className="block">{provider.displayName}</strong><span className="text-caption text-text-muted">{provider.legalName}</span></td>
                <td className="px-5 py-4 text-text-secondary">{provider.category ?? '—'}</td>
                <td className="px-5 py-4 text-text-secondary">{provider.taxId ?? '—'}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-caption ${statusTone[provider.verificationStatus]}`}>{statusLabel[provider.verificationStatus]}</span></td>
                <td className="px-5 py-4 text-text-secondary">{formatDate(provider.createdAt)}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    {(provider.verificationStatus === 'PENDING' || provider.verificationStatus === 'REJECTED') && (
                      <>
                        <Button type="button" size="sm" disabled={busyId === provider.id} onClick={() => verify(provider, 'VERIFIED')}>Təsdiqlə</Button>
                        <Button type="button" variant="secondary" size="sm" disabled={busyId === provider.id} onClick={() => verify(provider, 'REJECTED')}>Rədd et</Button>
                      </>
                    )}
                    {(provider.verificationStatus === 'VERIFIED' || provider.verificationStatus === 'SUSPENDED') && (
                      <Button type="button" variant="secondary" size="sm" disabled={busyId === provider.id} onClick={() => toggleSuspend(provider)}>
                        {provider.verificationStatus === 'VERIFIED' ? 'Suspend et' : 'Bərpa et'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {providers.length === 0 && <p className="p-5 text-small text-text-secondary">Provider tapılmadı.</p>}
    </Card>
  </section>;
}

function UsersSection({ users, query, onQuery }: { users: AdminUser[]; query: string; onQuery: (value: string) => void }) {
  const [rows, setRows] = useState(users);
  useEffect(() => setRows(users), [users]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function toggle(user: AdminUser) {
    const reason = window.prompt(user.isActive ? 'Suspend səbəbi:' : 'Reaktivasiya səbəbi:');
    if (!reason || reason.trim().length < 3) return;
    setBusyId(user.id); setError('');
    try {
      const updated = await requestJson<AdminUser>(`/api/admin/users/${user.id}/suspend`, { method: 'POST', body: JSON.stringify({ suspended: user.isActive, reason }) });
      setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Əməliyyat uğursuz oldu.'); }
    finally { setBusyId(null); }
  }
  return <section className="space-y-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-h3">İstifadəçilər</h2><Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Email, telefon və ya ad" className="sm:max-w-xs" /></div>{error && <p className="rounded-md bg-error-bg px-4 py-3 text-small text-error">{error}</p>}<Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-small"><thead className="border-b border-border bg-surface-elevated text-label text-text-secondary"><tr><th className="px-5 py-3">İstifadəçi</th><th className="px-5 py-3">Əlaqə</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Əməliyyat</th></tr></thead><tbody>{rows.map((user) => <tr key={user.id} className="border-b border-border last:border-0"><td className="px-5 py-4 font-semibold">{user.displayName ?? 'Adsız istifadəçi'}</td><td className="px-5 py-4 text-text-secondary">{user.email ?? user.phone ?? '—'}</td><td className="px-5 py-4">{user.isActive ? <span className="rounded-full bg-success-bg px-2.5 py-1 text-caption text-success">Aktiv</span> : <span className="rounded-full bg-error-bg px-2.5 py-1 text-caption text-error">Suspended</span>}</td><td className="px-5 py-4"><Button type="button" variant="secondary" size="sm" disabled={busyId === user.id} onClick={() => toggle(user)}>{busyId === user.id ? 'Gözləyin…' : user.isActive ? 'Suspend et' : 'Reactivate et'}</Button></td></tr>)}</tbody></table></div>{rows.length === 0 && <p className="p-5 text-small text-text-secondary">İstifadəçi tapılmadı.</p>}</Card></section>;
}

function AuditSection({ entries }: { entries: AdminAuditEntry[] }) {
  return <section className="space-y-5"><h2 className="font-display text-h3">Audit jurnalı</h2><Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-small"><thead className="border-b border-border bg-surface-elevated text-label text-text-secondary"><tr><th className="px-5 py-3">Vaxt</th><th className="px-5 py-3">Əməliyyat</th><th className="px-5 py-3">Entity</th><th className="px-5 py-3">Səbəb</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-border last:border-0"><td className="px-5 py-4 text-text-secondary">{formatDate(entry.createdAt)}</td><td className="px-5 py-4 font-semibold">{entry.action}</td><td className="px-5 py-4">{entry.entityType} · {entry.entityId ?? '—'}</td><td className="px-5 py-4 text-text-secondary">{entry.reason ?? '—'}</td></tr>)}</tbody></table></div>{entries.length === 0 && <p className="p-5 text-small text-text-secondary">Audit qeydi tapılmadı.</p>}</Card></section>;
}
