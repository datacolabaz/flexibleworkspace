'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type Section = 'overview' | 'listings' | 'pricing' | 'users' | 'audit';

const NAV_ITEMS: Array<{ id: Section; label: string; description: string }> = [
  { id: 'overview', label: 'İcmal', description: 'Platform göstəriciləri və növbəti addımlar' },
  { id: 'listings', label: 'Məkanlar', description: 'Yoxlama, təsdiq və qiymət nəzarəti' },
  { id: 'pricing', label: 'Qiymət və qaydalar', description: 'Gələcək komissiya və platforma ayarları' },
  { id: 'users', label: 'İstifadəçilər', description: 'Müştəri, provider və rollar' },
  { id: 'audit', label: 'Audit jurnalı', description: 'Kim nəyi və nə vaxt dəyişdi' },
];

const STATS = [
  { label: 'Aktiv məkanlar', value: '24', note: '3 yoxlama gözləyir', tone: 'text-primary' },
  { label: 'Bu gün rezervasiya', value: '18', note: '+12% ötən həftəyə görə', tone: 'text-success' },
  { label: 'Yoxlama gözləyən', value: '3', note: 'İş axınında növbəti addım', tone: 'text-warning' },
  { label: 'Açıq dəstək işi', value: '7', note: '2-si təcili', tone: 'text-info' },
];

const LISTINGS = [
  { name: 'Creative Workshop Space', owner: 'Aysel Məmmədova', status: 'Təsdiqli', price: '25 AZN/saat' },
  { name: 'Baku Podcast Studio', owner: 'Rauf Əliyev', status: 'Yoxlamada', price: '35 AZN/saat' },
  { name: 'Caspian Co-work Loft', owner: 'Nigar Həsənli', status: 'Təsdiqli', price: '18 AZN/saat' },
];

export default function AdminHome() {
  const [section, setSection] = useState<Section>('overview');
  const [query, setQuery] = useState('');
  const filteredListings = useMemo(
    () => LISTINGS.filter((listing) => `${listing.name} ${listing.owner}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

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
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`min-w-max rounded-md px-3 py-2.5 text-left text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${section === item.id ? 'bg-primary text-primary-on' : 'text-text-secondary hover:bg-surface-elevated hover:text-accent'}`}
              >
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

          {section === 'overview' && <Overview onNavigate={setSection} />}
          {section === 'listings' && (
            <section className="space-y-5" aria-labelledby="listings-title">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 id="listings-title" className="font-display text-h3">Məkan kataloqu</h2>
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Məkan və ya provider axtar" className="sm:max-w-xs" />
              </div>
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-small">
                    <thead className="border-b border-border bg-surface-elevated text-label text-text-secondary"><tr><th className="px-5 py-3">Məkan</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Qiymət</th></tr></thead>
                    <tbody>{filteredListings.map((listing) => <tr key={listing.name} className="border-b border-border last:border-0"><td className="px-5 py-4 font-semibold">{listing.name}</td><td className="px-5 py-4 text-text-secondary">{listing.owner}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-caption ${listing.status === 'Təsdiqli' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>{listing.status}</span></td><td className="px-5 py-4">{listing.price}</td></tr>)}</tbody>
                  </table>
                </div>
                {filteredListings.length === 0 && <p className="p-5 text-small text-text-secondary">Nəticə tapılmadı.</p>}
              </Card>
              <InfoNotice>Backend-də provider təsdiqi və məkan düzəlişi üçün admin endpoint-ləri mövcuddur. Bu cədvəlin canlı API ilə bağlanması növbəti inteqrasiya addımıdır.</InfoNotice>
            </section>
          )}
          {section === 'pricing' && <PricingSection />}
          {section === 'users' && <ComingSoonSection title="İstifadəçi və rollar" description="Müştəri, provider və admin rollarını bir yerdən idarə etmək üçün ekran strukturu hazırdır." items={['Provider təsdiqi', 'Rol və icazələr', 'Hesab statusu', 'Dəstək qeydləri']} />}
          {section === 'audit' && <ComingSoonSection title="Audit jurnalı" description="Admin əməliyyatlarının izini saxlamaq üçün nəzərdə tutulmuş təhlükəsiz jurnal görünüşü." items={['Kim dəyişdi', 'Nə dəyişdi', 'Səbəb və vaxt', 'Geri qaytarma izi']} />}
        </main>
      </div>
    </div>
  );
}

function Overview({ onNavigate }: { onNavigate: (section: Section) => void }) {
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{STATS.map((stat) => <Card key={stat.label} className="p-5"><p className="text-small text-text-secondary">{stat.label}</p><p className={`mt-3 font-display text-h2 ${stat.tone}`}>{stat.value}</p><p className="mt-1 text-caption text-text-muted">{stat.note}</p></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <Card><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-h3">İdarəetmə prioritetləri</h2><p className="mt-2 text-small text-text-secondary">Gələcəkdə qiymət, kataloq və təhlükəsizlik dəyişiklikləri bu paneldən idarə ediləcək.</p></div><span className="rounded-full bg-info-bg px-2.5 py-1 text-caption text-info">MVP</span></div><div className="mt-5 space-y-3">{[['Məkanları yoxla', '3 məkan provider təsdiqi gözləyir', 'listings'], ['Qiymət qaydalarını qur', 'Platforma komissiyası və minimum qiymət siyasəti', 'pricing'], ['İcazələri nəzərdən keçir', 'Admin rolları backend-də artıq modelləşdirilib', 'users']].map(([title, note, target]) => <button key={title} type="button" onClick={() => onNavigate(target as Section)} className="flex w-full items-center justify-between rounded-md border border-border p-4 text-left transition-colors hover:border-primary hover:bg-surface-elevated"><span><span className="block text-label">{title}</span><span className="mt-1 block text-small text-text-secondary">{note}</span></span><span className="text-accent">→</span></button>)}</div></Card>
      <Card><h2 className="font-display text-h3">Sistem vəziyyəti</h2><div className="mt-5 space-y-4">{[['Public sayt', 'İşlək', 'bg-success-bg text-success'], ['Axtarış API', 'İşlək', 'bg-success-bg text-success'], ['Admin API', 'Hazır / auth tələb edir', 'bg-warning-bg text-warning'], ['Admin UI', 'İndi əlavə edildi', 'bg-info-bg text-info']].map(([label, status, tone]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"><span className="text-small text-text-secondary">{label}</span><span className={`rounded-full px-2.5 py-1 text-caption ${tone}`}>{status}</span></div>)}</div></Card>
    </div>
    <InfoNotice>Admin paneli artıq boş səhifə deyil. Məlumat idarəetməsinin UI skeleti hazırdır; real dəyişikliklərin saxlanması üçün sessiya əsaslı admin auth və backend endpoint inteqrasiyası qoşulmalıdır.</InfoNotice>
  </div>;
}

function PricingSection() {
  return <section className="space-y-5"><Card><h2 className="font-display text-h3">Platforma qiymət ayarları</h2><p className="mt-2 max-w-2xl text-small text-text-secondary">Bu sahələr gələcəkdə mərkəzləşdirilmiş qiymət və komissiya qaydaları üçün nəzərdə tutulub. Hazırda nümayiş rejimindədir və məlumatı dəyişmir.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-label">Platforma komissiyası (%)<Input type="number" defaultValue="10" min="0" max="100" disabled /></label><label className="flex flex-col gap-2 text-label">Minimum saatlıq qiymət (AZN)<Input type="number" defaultValue="10" min="0" disabled /></label></div><div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled>Qaydaları yadda saxla</Button><span className="text-small text-text-muted">Backend settings endpoint-i qoşulduqda aktiv olacaq.</span></div></Card><InfoNotice>Backend-də <strong>commission.update</strong> və <strong>settings.update</strong> icazələri artıq ayrılıb. Bu, gələcəkdə kimlərin qiymət qaydalarını dəyişə biləcəyini məhdudlaşdırmağa imkan verir.</InfoNotice></section>;
}

function ComingSoonSection({ title, description, items }: { title: string; description: string; items: string[] }) {
  return <section className="space-y-5"><Card><h2 className="font-display text-h3">{title}</h2><p className="mt-2 max-w-2xl text-small text-text-secondary">{description}</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{items.map((item) => <div key={item} className="rounded-md border border-border bg-surface-elevated p-4"><p className="text-label">{item}</p><p className="mt-1 text-caption text-text-muted">API inteqrasiyası gözləyir</p></div>)}</div></Card><InfoNotice>Bu görünüş admin arxitekturasına uyğun hazırlıq qatıdır. İstehsalda əməliyyat düymələri yalnız uyğun admin permission olduqda aktivləşdirilməlidir.</InfoNotice></section>;
}

function InfoNotice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-info/30 bg-info-bg px-4 py-3 text-small text-text-primary">{children}</div>;
}
