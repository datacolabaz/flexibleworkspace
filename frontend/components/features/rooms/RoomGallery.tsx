'use client';

import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { IconButton } from '@/components/ui/IconButton';

export interface RoomGalleryProps {
  photos: string[];
  roomName: string;
}

/**
 * 07_UX_ARCHITECTURE.md §7.4: gallery/photos is the first thing on the
 * room detail page. A large active photo plus a thumbnail strip — no
 * carousel/lightbox library, since a click-to-swap main image covers the
 * "browse this room's photos" job without adding a dependency.
 */
export function RoomGallery({ photos, roomName }: RoomGalleryProps) {
  const t = useTranslations('room');
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-surface-elevated text-body text-text-muted">
        {t('noPhotos')}
      </div>
    );
  }

  const activePhoto = photos[Math.min(activeIndex, photos.length - 1)];

  // Wraps around at both ends (Instagram-style) rather than disabling the
  // arrow at the first/last photo — a visitor browsing a gallery expects
  // to keep going, not hit a dead end, and a disabled-looking arrow reads
  // as broken more often than it reads as "you're at the end".
  function showPrevious() {
    setActiveIndex((index) => (index - 1 + photos.length) % photos.length);
  }
  function showNext() {
    setActiveIndex((index) => (index + 1) % photos.length);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') showPrevious();
    else if (event.key === 'ArrowRight') showNext();
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Arrows live directly on the photo (not only in the thumbnail
       * strip below) — a provider flagged wanting to move through photos
       * by touching/clicking the photo itself instead of always having
       * to reach the strip. tabIndex+onKeyDown makes the arrow keys work
       * once the photo has focus, for the same reason. */}
      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-elevated outline-none"
        tabIndex={photos.length > 1 ? 0 : undefined}
        onKeyDown={photos.length > 1 ? handleKeyDown : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URLs, same rationale as RoomListingCard's cover photo. */}
        <img src={activePhoto} alt={roomName} className="h-full w-full object-cover" />
        {photos.length > 1 && (
          // Always visible, not hover-only — on a touch screen there is
          // no hover state to reveal them, and a provider flagged this
          // exact hover-only mistake before (ProviderRoomsPanel's photo
          // controls toolbar) for the same reason: it reads as "the
          // button doesn't exist" on mobile, not as "tap to reveal it".
          <>
            <div className="absolute inset-y-0 left-2 flex items-center">
              <div className="rounded-full bg-surface/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface/95">
                <IconButton aria-label={t('galleryPrevious')} onClick={showPrevious}>
                  <span aria-hidden="true" className="text-xl leading-none">‹</span>
                </IconButton>
              </div>
            </div>
            <div className="absolute inset-y-0 right-2 flex items-center">
              <div className="rounded-full bg-surface/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface/95">
                <IconButton aria-label={t('galleryNext')} onClick={showNext}>
                  <span aria-hidden="true" className="text-xl leading-none">›</span>
                </IconButton>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-surface/70 px-2 py-0.5 text-caption text-text-primary backdrop-blur-sm">
              {activeIndex + 1} / {photos.length}
            </div>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('galleryThumbnails')}>
          {photos.map((photo, index) => (
            <button
              key={photo + index}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={t('galleryThumbnailLabel', { index: index + 1, total: photos.length })}
              onClick={() => setActiveIndex(index)}
              className={[
                'h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                index === activeIndex ? 'border-primary' : 'border-transparent hover:border-border-strong',
              ].join(' ')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see main image above. */}
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
