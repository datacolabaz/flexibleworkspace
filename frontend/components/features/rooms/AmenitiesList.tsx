'use client';

import { useTranslations } from 'next-intl';
import { amenityIconFromTranslationKey, amenityKeyFromTranslationKey } from '@/lib/constants/taxonomy';

export interface AmenitiesListProps {
  amenities: string[];
}

/**
 * 07_UX_ARCHITECTURE.md §7.4's "amenities/equipment" is one section here —
 * `RoomDetail.amenities` already includes the EQUIPMENT-category entries
 * (wifi, projector, sound system, ...) alongside COMFORT/ACCESSIBILITY
 * ones; there is no separate backend `equipment` field to split them from
 * (see 29_API_OPENAPI.yaml's RoomDetail comment, fixed as doc-only drift
 * this pass). An unrecognized translation key (taxonomy drift between
 * frontend and backend) still renders with a fallback bullet + the raw
 * key, rather than silently disappearing.
 */
export function AmenitiesList({ amenities }: AmenitiesListProps) {
  const t = useTranslations();

  if (amenities.length === 0) {
    return <p className="text-small text-text-secondary">{t('room.noAmenities')}</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {amenities.map((translationKey) => {
        const key = amenityKeyFromTranslationKey(translationKey);
        const label = key ? t(`taxonomy.amenity.${key}`) : translationKey;
        return (
          <li key={translationKey} className="flex items-center gap-2 text-small text-text-primary">
            <span aria-hidden="true">{amenityIconFromTranslationKey(translationKey)}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
