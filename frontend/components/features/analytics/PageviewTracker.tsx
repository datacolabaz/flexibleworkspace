'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    void fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never affect the customer experience.
    });
  }, [pathname]);

  return null;
}
