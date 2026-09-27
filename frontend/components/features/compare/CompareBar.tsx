'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { addToCompare, getCompareIds, removeFromCompare, COMPARE_MAX } from '@/lib/compare/compare-store';

export function CompareToggle({ roomId }: { roomId: string }) {
  const t = useTranslations('search');
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(getCompareIds());
    sync();
    window.addEventListener('spotva-compare-change', sync);
    return () => window.removeEventListener('spotva-compare-change', sync);
  }, []);

  const selected = ids.includes(roomId);

  return (
    <button
      type="button"
      className="rounded-md border border-border bg-surface px-2 py-1 text-caption font-medium text-text-secondary hover:border-primary hover:text-primary"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selected) removeFromCompare(roomId);
        else addToCompare(roomId);
      }}
    >
      {selected ? t('removeFromCompare') : ids.length >= COMPARE_MAX ? t('compareFull') : t('addToCompare')}
    </button>
  );
}

export function CompareBar() {
  const t = useTranslations('compare');
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(getCompareIds());
    sync();
    window.addEventListener('spotva-compare-change', sync);
    return () => window.removeEventListener('spotva-compare-change', sync);
  }, []);

  if (ids.length === 0) return null;

  return (
    <div className="sticky bottom-3 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2 shadow-md">
      <p className="text-small text-text-secondary">{ids.length} / {COMPARE_MAX}</p>
      <Link href="/compare" className="text-label font-semibold text-primary">
        {t('title')}
      </Link>
    </div>
  );
}
