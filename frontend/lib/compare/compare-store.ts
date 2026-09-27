'use client';

import { track, AnalyticsEvent } from '@/lib/analytics/track';

const STORAGE_KEY = 'spotva.compare.ids';
const MAX_COMPARE = 4;

function readIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event('spotva-compare-change'));
}

export function getCompareIds(): string[] {
  return readIds();
}

export function addToCompare(roomId: string): { ok: boolean; ids: string[]; reason?: 'duplicate' | 'full' } {
  const current = readIds();
  if (current.includes(roomId)) return { ok: false, ids: current, reason: 'duplicate' };
  if (current.length >= MAX_COMPARE) return { ok: false, ids: current, reason: 'full' };
  const ids = [...current, roomId];
  writeIds(ids);
  track(AnalyticsEvent.CompareAdded, { location_id: roomId });
  return { ok: true, ids };
}

export function removeFromCompare(roomId: string): string[] {
  const ids = readIds().filter((id) => id !== roomId);
  writeIds(ids);
  track(AnalyticsEvent.CompareRemoved, { location_id: roomId });
  return ids;
}

export const COMPARE_MAX = MAX_COMPARE;
