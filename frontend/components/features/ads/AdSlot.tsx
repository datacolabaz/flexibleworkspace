'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { pickWeighted } from '@/lib/ads/weighted-rotation';
import type { PublicAd, PublicAdSlot } from '@/lib/api-client/ads';

const SLOT_HEIGHT_PX = 280;
const SLOT_WIDTH_PX = 336;

function recordAdEvent(campaignId: string, type: 'impression' | 'click') {
  const eventId = `${type}:${campaignId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  void fetch(`/api/ads/campaigns/${encodeURIComponent(campaignId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, eventId }),
    ...(typeof window !== 'undefined' && 'keepalive' in Request.prototype ? { keepalive: true } : {}),
  }).catch(() => undefined);
}

function initialAd(ads: PublicAd[]) {
  if (ads.length === 0) return null;
  return [...ads].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))[0] ?? null;
}

export function AdSlot({ slot }: { slot: PublicAdSlot }) {
  const t = useTranslations('home');
  const ads = slot.ads;
  const intervalMs = (slot.rotationIntervalSeconds || 45) * 1000;
  const [current, setCurrent] = useState<PublicAd | null>(() => initialAd(ads));
  const currentRef = useRef(current);
  currentRef.current = current;
  const boxRef = useRef<HTMLDivElement>(null);
  const inViewRef = useRef(false);
  const tabVisibleRef = useRef(typeof document === 'undefined' ? true : document.visibilityState === 'visible');
  const impressedRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrent(initialAd(ads));
  }, [ads]);

  useEffect(() => {
    const node = boxRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onVisibility() {
      tabVisibleRef.current = document.visibilityState === 'visible';
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    const canCount = () => inViewRef.current && tabVisibleRef.current && document.visibilityState === 'visible';
    const tryImpression = () => {
      if (!currentRef.current) return;
      if (!canCount()) return;
      if (impressedRef.current === currentRef.current.id) return;
      impressedRef.current = currentRef.current.id;
      recordAdEvent(currentRef.current.id, 'impression');
    };
    tryImpression();
    const poll = window.setInterval(tryImpression, 500);
    return () => window.clearInterval(poll);
  }, [current]);

  useEffect(() => {
    if (ads.length < 2) return undefined;
    let timer: number | undefined;
    function arm() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState !== 'visible' || !inViewRef.current) {
          arm();
          return;
        }
        setCurrent((prev) => pickWeighted(ads, prev?.id) ?? prev);
        arm();
      }, intervalMs);
    }
    arm();
    function onVisibility() {
      if (document.visibilityState === 'visible') arm();
      else window.clearTimeout(timer);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ads, intervalMs]);

  return (
    <section
      ref={boxRef}
      className="overflow-hidden rounded-lg border border-warning bg-warning-bg p-3"
      aria-label={t('ads.ariaLabel')}
    >
      <span className="text-caption font-semibold uppercase tracking-wide text-warning">{t('sponsor.label')}</span>
      <div
        className="mt-3 flex items-center justify-center overflow-hidden rounded-md bg-surface"
        style={{ width: '100%', maxWidth: SLOT_WIDTH_PX, height: SLOT_HEIGHT_PX, marginInline: 'auto' }}
      >
        {current ? (
          <a
            href={current.clickUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full w-full items-center justify-center"
            aria-label={t('ads.clickLabel', { advertiser: current.advertiserName })}
            onClick={() => recordAdEvent(current.id, 'click')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- advertiser creative URLs are not a fixed local set. */}
            <img
              src={current.creativeUrl}
              alt={current.advertiserName}
              width={current.creativeSize === '300x250' ? 300 : 336}
              height={current.creativeSize === '300x250' ? 250 : 280}
              className="max-h-full max-w-full object-contain"
            />
          </a>
        ) : (
          <div className="flex h-full w-full flex-col justify-center p-4">
            <h2 className="font-display text-h4 text-text-primary">{t('sponsor.title')}</h2>
            <p className="mt-2 text-small text-text-secondary">{t('sponsor.body')}</p>
            <Link href="/advertise" className="mt-4 inline-block text-label font-semibold text-primary">
              {t('sponsor.cta')} →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
