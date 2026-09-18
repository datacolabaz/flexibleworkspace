'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconButton } from '@/components/ui/IconButton';

export interface ShareButtonProps {
  title: string;
  url: string;
}

/**
 * "Paylaşma düyməsi" — Web Share API where the browser supports it
 * (mobile Safari/Chrome show the native share sheet), falling back to a
 * clipboard copy with a brief inline confirmation everywhere else. No
 * backend dependency either way.
 */
export function ShareButton({ title, url }: ShareButtonProps) {
  const t = useTranslations('room');
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // AbortError when the user dismisses the native share sheet —
        // not a failure worth surfacing.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy the share link:', err);
    }
  }

  return (
    <div className="relative">
      <IconButton aria-label={t('share')} onClick={handleShare}>
        <span aria-hidden="true" className="text-xl leading-none">
          ↗
        </span>
      </IconButton>
      {copied && (
        <span role="status" className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-md bg-text-primary px-2 py-1 text-caption text-surface">
          {t('linkCopied')}
        </span>
      )}
    </div>
  );
}
