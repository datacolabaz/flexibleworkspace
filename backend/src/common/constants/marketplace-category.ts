/** Canonical marketplace supply categories. EN slugs are stable API keys. */
export const MARKETPLACE_CATEGORY_SLUGS = [
  'TRAINING_ROOM',
  'WORKSHOP_SPACE',
  'PHOTO_VIDEO_STUDIO',
  'PODCAST_STUDIO',
  'YOGA_DANCE_STUDIO',
  'RESTAURANT_HOTEL_EVENT_SPACE',
  'SMALL_EVENT_SPACE',
  'CREATIVE_COMMUNITY_SPACE',
  'MEETING_ROOM',
  'COWORKING_SPACE',
] as const;

export type MarketplaceCategorySlug =
  (typeof MARKETPLACE_CATEGORY_SLUGS)[number];

export const MARKETPLACE_CATEGORY_SET = new Set<string>(
  MARKETPLACE_CATEGORY_SLUGS,
);

/** Legacy `location_categories.slug` values → marketplace slug. */
export const LEGACY_LOCATION_CATEGORY_TO_MARKETPLACE: Record<string, string> = {
  'telim-otagi': 'TRAINING_ROOM',
  'sinif-otagi': 'TRAINING_ROOM',
  'seminar-otagi': 'TRAINING_ROOM',
  'workshop-otagi': 'WORKSHOP_SPACE',
  emalatxana: 'WORKSHOP_SPACE',
  'foto-video-studiya': 'PHOTO_VIDEO_STUDIO',
  studiya: 'PHOTO_VIDEO_STUDIO',
  'podkast-studiyasi': 'PODCAST_STUDIO',
  'ses-studiyasi': 'PODCAST_STUDIO',
  'spor-zal': 'YOGA_DANCE_STUDIO',
  'rehearsal-space': 'YOGA_DANCE_STUDIO',
  'kafe-restoran': 'RESTAURANT_HOTEL_EVENT_SPACE',
  'tdbir-mkani': 'SMALL_EVENT_SPACE',
  'outdoor-space': 'CREATIVE_COMMUNITY_SPACE',
  'icas-otagi': 'MEETING_ROOM',
  'konfrans-otagi': 'MEETING_ROOM',
  coworking: 'COWORKING_SPACE',
  'ofis-sahesi': 'COWORKING_SPACE',
  'ferdi-ofis': 'COWORKING_SPACE',
};

export function resolveMarketplaceCategorySlug(
  slug: string | null | undefined,
): string | null {
  if (!slug) return null;
  if (MARKETPLACE_CATEGORY_SET.has(slug)) return slug;
  return LEGACY_LOCATION_CATEGORY_TO_MARKETPLACE[slug] ?? null;
}

export function providerHasMarketplaceCategory(
  categories: string[] | null | undefined,
): boolean {
  if (!categories || categories.length === 0) return false;
  return categories.some((c) => resolveMarketplaceCategorySlug(c) != null);
}
