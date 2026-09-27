'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { track, AnalyticsEvent } from '@/lib/analytics/track';
import { getCompareIds, removeFromCompare } from '@/lib/compare/compare-store';
import { formatMoney } from '@/lib/format/money';
import { useLocale } from 'next-intl';
import { roomTypeKeyFromTranslationKey } from '@/lib/constants/taxonomy';

type CompareRoom = {
  id: string;
  name?: string;
  providerName?: string;
  primaryCategory?: string | null;
  roomType?: string;
  district?: string | null;
  metro?: string | null;
  capacityMin?: number;
  capacityMax?: number;
  pricePackages?: { unitType: string; amount: number | null; currency: string; priceType: string }[];
  amenities?: string[];
  availabilityStatus?: string;
};

function packageAmount(room: CompareRoom, unit: string): number | null {
  const pkg = room.pricePackages?.find((p) => p.unitType === unit);
  if (!pkg || pkg.amount == null) return null;
  if (pkg.priceType === 'NOT_AVAILABLE' || pkg.priceType === 'REQUEST') return null;
  return pkg.amount;
}

export function CompareTable() {
  const t = useTranslations('compare');
  const tSearch = useTranslations('search');
  const tTax = useTranslations('taxonomy');
  const locale = useLocale();
  const [rooms, setRooms] = useState<CompareRoom[]>([]);

  useEffect(() => {
    track(AnalyticsEvent.CompareViewed, {});
    const ids = getCompareIds();
    if (ids.length === 0) {
      setRooms([]);
      return;
    }
    fetch(`/api/search/compare?ids=${ids.join(',')}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRooms(Array.isArray(data) ? data : []))
      .catch(() => setRooms([]));
  }, []);

  const cheapestByUnit = useMemo(() => {
    const units = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
    const map: Record<string, string | null> = {};
    for (const unit of units) {
      const scored = rooms
        .map((r) => ({ id: r.id, amount: packageAmount(r, unit) }))
        .filter((r) => r.amount != null) as { id: string; amount: number }[];
      if (scored.length === 0) {
        map[unit] = null;
        continue;
      }
      const min = Math.min(...scored.map((s) => s.amount));
      const winners = scored.filter((s) => s.amount === min);
      map[unit] = winners.length === 1 ? winners[0].id : null;
    }
    return map;
  }, [rooms]);

  if (rooms.length === 0) {
    return <p className="text-body text-text-secondary">{t('empty')}</p>;
  }

  const renderPrice = (room: CompareRoom, unit: string) => {
    const pkg = room.pricePackages?.find((p) => p.unitType === unit);
    if (!pkg || pkg.priceType === 'NOT_AVAILABLE' || pkg.amount == null) return t('noData');
    if (pkg.priceType === 'REQUEST') return tSearch('priceRequest');
    const money = formatMoney(pkg.amount, pkg.currency, locale);
    const label = pkg.priceType === 'FROM' ? tSearch('priceFrom', { price: money }) : money;
    const badge = cheapestByUnit[unit] === room.id ? ` · ${t('cheapest')}` : '';
    return `${label}${badge}`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-small">
        <thead>
          <tr>
            <th className="border-b p-2 text-left">{t('title')}</th>
            {rooms.map((room) => (
              <th key={room.id} className="border-b p-2 text-left">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/rooms/${room.id}`} className="font-semibold text-text-primary">
                    {room.name}
                  </Link>
                  <button type="button" className="text-caption text-text-muted" onClick={() => {
                    removeFromCompare(room.id);
                    setRooms((prev) => prev.filter((r) => r.id !== room.id));
                  }}>
                    ×
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b p-2">Provider</td>
            {rooms.map((r) => <td key={r.id} className="border-b p-2">{r.providerName}</td>)}
          </tr>
          <tr>
            <td className="border-b p-2">Category</td>
            {rooms.map((r) => {
              const key = roomTypeKeyFromTranslationKey(r.roomType);
              return <td key={r.id} className="border-b p-2">{r.primaryCategory ?? (key ? tTax(`roomType.${key}`) : r.roomType)}</td>;
            })}
          </tr>
          <tr>
            <td className="border-b p-2">District</td>
            {rooms.map((r) => <td key={r.id} className="border-b p-2">{r.district ?? t('noData')}</td>)}
          </tr>
          <tr>
            <td className="border-b p-2">Metro</td>
            {rooms.map((r) => <td key={r.id} className="border-b p-2">{r.metro ?? t('noData')}</td>)}
          </tr>
          <tr>
            <td className="border-b p-2">Capacity</td>
            {rooms.map((r) => <td key={r.id} className="border-b p-2">{r.capacityMin}–{r.capacityMax}</td>)}
          </tr>
          {(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((unit) => (
            <tr key={unit}>
              <td className="border-b p-2">{unit}</td>
              {rooms.map((r) => <td key={r.id} className="border-b p-2">{renderPrice(r, unit)}</td>)}
            </tr>
          ))}
          <tr>
            <td className="border-b p-2">Amenities</td>
            {rooms.map((r) => (
              <td key={r.id} className="border-b p-2">{(r.amenities ?? []).length ? r.amenities!.join(', ') : t('noData')}</td>
            ))}
          </tr>
          <tr>
            <td className="border-b p-2">Availability</td>
            {rooms.map((r) => (
              <td key={r.id} className="border-b p-2">
                {r.availabilityStatus ? tSearch(`availability.${r.availabilityStatus}`) : t('noData')}
              </td>
            ))}
          </tr>
          <tr>
            <td className="border-b p-2">{t('responseTime')}</td>
            {rooms.map((r) => <td key={r.id} className="border-b p-2">{t('noData')}</td>)}
          </tr>
          <tr>
            <td className="p-2" />
            {rooms.map((r) => (
              <td key={r.id} className="p-2">
                <Link
                  href={`/rooms/${r.id}`}
                  className="font-semibold text-primary"
                  onClick={() => track(AnalyticsEvent.CompareBookingStarted, { location_id: r.id })}
                >
                  {t('bookingCta')}
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
