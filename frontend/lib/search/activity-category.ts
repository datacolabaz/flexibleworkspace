import { AMENITIES, ROOM_TYPES } from '@/lib/constants/taxonomy';

/**
 * Closed marketplace category slugs used by V1 purpose search.
 * These are product-facing English slugs, not a DB enum. GET /spaces does
 * not accept `category`; the BFF maps a known slug onto existing `roomType`.
 */
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

export type MarketplaceCategorySlug = (typeof MARKETPLACE_CATEGORY_SLUGS)[number];

export const SEARCH_ACTIVITIES = [
  'PODCAST_RECORDING',
  'PHOTO_SHOOT',
  'VIDEO_SHOOT',
  'CONTENT_CREATION',
  'TEAM_MEETING',
  'TRAINING',
  'WORKSHOP',
  'COWORKING',
  'YOGA',
  'DANCE',
  'CONFERENCE',
  'PRESENTATION',
  'INTERVIEW',
  'CREATIVE_SESSION',
  'SMALL_EVENT',
] as const;

export type SearchActivitySlug = (typeof SEARCH_ACTIVITIES)[number];

/** EVENT_SPACE is not a marketplace slug; conferences use SMALL_EVENT_SPACE. */
export const ACTIVITY_TO_CATEGORY: Record<SearchActivitySlug, MarketplaceCategorySlug> = {
  PODCAST_RECORDING: 'PODCAST_STUDIO',
  PHOTO_SHOOT: 'PHOTO_VIDEO_STUDIO',
  VIDEO_SHOOT: 'PHOTO_VIDEO_STUDIO',
  CONTENT_CREATION: 'PHOTO_VIDEO_STUDIO',
  TEAM_MEETING: 'MEETING_ROOM',
  TRAINING: 'TRAINING_ROOM',
  WORKSHOP: 'WORKSHOP_SPACE',
  COWORKING: 'COWORKING_SPACE',
  YOGA: 'YOGA_DANCE_STUDIO',
  DANCE: 'YOGA_DANCE_STUDIO',
  CONFERENCE: 'SMALL_EVENT_SPACE',
  PRESENTATION: 'MEETING_ROOM',
  INTERVIEW: 'MEETING_ROOM',
  CREATIVE_SESSION: 'CREATIVE_COMMUNITY_SPACE',
  SMALL_EVENT: 'SMALL_EVENT_SPACE',
};

/**
 * Marketplace slug → existing `room_type.*` translation key.
 * YOGA_DANCE_STUDIO, CREATIVE_COMMUNITY_SPACE, and RESTAURANT_HOTEL_EVENT_SPACE
 * have no matching room type in frontend taxonomy — omit `roomType` rather
 * than inventing one.
 */
export const CATEGORY_TO_ROOM_TYPE: Partial<Record<MarketplaceCategorySlug, string>> = {
  TRAINING_ROOM: 'room_type.training_room',
  WORKSHOP_SPACE: 'room_type.workshop_space',
  PHOTO_VIDEO_STUDIO: 'room_type.photo_video_studio',
  PODCAST_STUDIO: 'room_type.podcast_studio',
  SMALL_EVENT_SPACE: 'room_type.event_space',
  MEETING_ROOM: 'room_type.meeting_room',
  COWORKING_SPACE: 'room_type.coworking_desk',
};

const MARKETPLACE_CATEGORY_SET = new Set<string>(MARKETPLACE_CATEGORY_SLUGS);
const ACTIVITY_SET = new Set<string>(SEARCH_ACTIVITIES);
const ROOM_TYPE_SET = new Set(ROOM_TYPES.map((type) => type.translationKey));
const AMENITY_KEY_SET = new Set(AMENITIES.map((amenity) => amenity.key));
const AMENITY_TRANSLATION_SET = new Set(AMENITIES.map((amenity) => amenity.translationKey));

const FORBIDDEN_AMENITY_TOKENS = new Set([
  'camera',
  'microphone',
  'green_screen',
  'green-screen',
  'greenscreen',
  'amenity.camera',
  'amenity.microphone',
  'amenity.green_screen',
  'amenity.green-screen',
  'amenity.greenscreen',
]);

export function isMarketplaceCategorySlug(value: string): value is MarketplaceCategorySlug {
  return MARKETPLACE_CATEGORY_SET.has(value);
}

export function isSearchActivitySlug(value: string): value is SearchActivitySlug {
  return ACTIVITY_SET.has(value);
}

/**
 * Map a purpose/activity slug to an existing marketplace category.
 * Unknown values never throw — callers omit `category` and keep other params.
 */
export function mapActivityToCategory(activity: string | undefined | null): MarketplaceCategorySlug | undefined {
  if (!activity) return undefined;
  const trimmed = activity.trim();
  if (!trimmed) return undefined;
  if (isMarketplaceCategorySlug(trimmed)) return trimmed;
  if (isSearchActivitySlug(trimmed)) return ACTIVITY_TO_CATEGORY[trimmed];
  return undefined;
}

export function roomTypeFromMarketplaceCategory(
  category: string | undefined | null,
): string | undefined {
  if (!category || !isMarketplaceCategorySlug(category)) return undefined;
  const roomType = CATEGORY_TO_ROOM_TYPE[category];
  return roomType && ROOM_TYPE_SET.has(roomType) ? roomType : undefined;
}

export function resolveRoomTypeForSpacesQuery(input: {
  roomType?: string | null;
  category?: string | null;
  activity?: string | null;
}): string | undefined {
  const explicit = input.roomType?.trim();
  if (explicit && ROOM_TYPE_SET.has(explicit)) return explicit;

  const category = mapActivityToCategory(input.category) ?? mapActivityToCategory(input.activity);
  return roomTypeFromMarketplaceCategory(category);
}

function isForbiddenAmenity(token: string): boolean {
  return FORBIDDEN_AMENITY_TOKENS.has(token) || FORBIDDEN_AMENITY_TOKENS.has(token.replace(/^amenity\./, ''));
}

/** Keep only seeded amenity.* keys. Never invent camera / microphone / green_screen. */
export function filterExistingAmenities(amenities: string[] | undefined | null): string[] {
  if (!amenities || amenities.length === 0) return [];
  const next: string[] = [];
  for (const raw of amenities) {
    const token = raw.trim();
    if (!token || isForbiddenAmenity(token)) continue;
    if (AMENITY_TRANSLATION_SET.has(token)) {
      next.push(token);
      continue;
    }
    if (AMENITY_KEY_SET.has(token)) {
      next.push(`amenity.${token}`);
    }
  }
  return next;
}

export interface SpaceSearchQueryInput {
  activity?: string | null;
  category?: string | null;
  roomType?: string | null;
  participants?: string | number | null;
  metroStationId?: string | null;
  amenities?: string[] | null;
  city?: string | null;
  date?: string | null;
  district?: string | null;
}

/**
 * Customer-facing /search query. Purpose writes `category` (marketplace slug).
 * Does not auto-attach amenities. Unknown activity omits category.
 */
export function buildSpaceSearchQuery(input: SpaceSearchQueryInput): URLSearchParams {
  const query = new URLSearchParams();
  const category =
    mapActivityToCategory(input.category) ?? mapActivityToCategory(input.activity);
  if (category) query.set('category', category);

  const explicitRoomType = input.roomType?.trim();
  if (explicitRoomType && ROOM_TYPE_SET.has(explicitRoomType)) {
    query.set('roomType', explicitRoomType);
  }

  if (input.city?.trim()) query.set('city', input.city.trim());
  if (input.district?.trim()) query.set('district', input.district.trim());
  if (input.date) query.set('date', input.date);

  if (input.participants !== undefined && input.participants !== null && `${input.participants}` !== '') {
    query.set('participants', String(input.participants));
  }

  if (input.metroStationId?.trim()) {
    query.set('metroStationId', input.metroStationId.trim());
  }

  const amenities = filterExistingAmenities(input.amenities);
  if (amenities.length > 0) query.set('amenities', amenities.join(','));

  return query;
}
