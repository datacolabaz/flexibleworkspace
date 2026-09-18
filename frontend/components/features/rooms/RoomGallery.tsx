'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

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

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-surface-elevated">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote, provider-uploaded photo URLs, same rationale as RoomListingCard's cover photo. */}
        <img src={activePhoto} alt={roomName} className="h-full w-full object-cover" />
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
