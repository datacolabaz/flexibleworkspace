'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Matches the room detail route `/{locale}/rooms/{id}` (id-only, per that
 * page's own routing comment) and nothing under it — `/rooms/{id}/book`
 * deliberately does NOT match, since that's a different page. Extracting
 * the room id straight from the pathname (rather than needing a `roomId`
 * prop threaded down from the room detail page through this globally-
 * mounted-in-the-root-layout component) keeps this a one-file change:
 * `PageviewTracker` already recomputes on every `usePathname()` change.
 */
const ROOM_DETAIL_PATH = /^\/[a-z]{2}\/rooms\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    const roomId = ROOM_DETAIL_PATH.exec(pathname)?.[1];
    void fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomId ? { path: pathname, roomId } : { path: pathname }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never affect the customer experience.
    });
  }, [pathname]);

  return null;
}
