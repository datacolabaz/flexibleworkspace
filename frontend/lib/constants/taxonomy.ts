/**
 * Room type + amenity taxonomy — a fixed, closed set (backend's own
 * `search-query.dto.ts` comment: "matches room_type.translation_key
 * exactly ... this is a fixed taxonomy, not free text"), sourced directly
 * from `docs/phase2/30_SEED_DATA.sql`'s seed inserts (01_PRODUCT_
 * REQUIREMENTS.md §1.3, 09_DOMAIN_MODEL.md's Amenity entity).
 *
 * No public read API exposes this list today (only an admin-gated CRUD
 * surface does) — hardcoding it here, rather than blocking the search/
 * filter UI on a new backend endpoint, is a deliberate scope decision
 * for this pass (documented in PHASE4_REPORT.md). Each `translationKey`
 * is the exact string the backend's `roomType`/`amenities` query params
 * expect, and each is also a message key under the `taxonomy.roomType`/
 * `taxonomy.amenity` namespace for the display label.
 */

export interface RoomTypeOption {
  /** Exact `room_type.translation_key` value the backend expects verbatim. */
  translationKey: string;
  /** The key's own leaf segment — matches `messages/*.json`'s `taxonomy.roomType.<key>`. */
  key: string;
  /** `key` of the parent room type, for grouped rendering. `null` for a top-level type. */
  parentKey: string | null;
}

export const ROOM_TYPES: RoomTypeOption[] = [
  { translationKey: 'room_type.meeting_room', key: 'meeting_room', parentKey: null },
  { translationKey: 'room_type.coworking_desk', key: 'coworking_desk', parentKey: null },
  { translationKey: 'room_type.private_office', key: 'private_office', parentKey: null },
  { translationKey: 'room_type.training_room', key: 'training_room', parentKey: null },
  { translationKey: 'room_type.classroom', key: 'classroom', parentKey: null },
  { translationKey: 'room_type.workshop_space', key: 'workshop_space', parentKey: null },
  { translationKey: 'room_type.seminar_room', key: 'seminar_room', parentKey: null },
  { translationKey: 'room_type.conference_room', key: 'conference_room', parentKey: null },
  { translationKey: 'room_type.podcast_studio', key: 'podcast_studio', parentKey: null },
  { translationKey: 'room_type.photo_video_studio', key: 'photo_video_studio', parentKey: null },
  { translationKey: 'room_type.event_space', key: 'event_space', parentKey: null },
  { translationKey: 'room_type.business_meeting_room', key: 'business_meeting_room', parentKey: 'meeting_room' },
  { translationKey: 'room_type.interview_room', key: 'interview_room', parentKey: 'meeting_room' },
  { translationKey: 'room_type.tutor_teacher_room', key: 'tutor_teacher_room', parentKey: 'classroom' },
];

export type AmenityCategory = 'EQUIPMENT' | 'COMFORT' | 'ACCESSIBILITY';

export interface AmenityOption {
  /** Exact `amenity.translation_key` value the backend expects verbatim. */
  translationKey: string;
  /** The key's own leaf segment — matches `messages/*.json`'s `taxonomy.amenity.<key>`. */
  key: string;
  category: AmenityCategory;
  /** A single glyph, matching the app's existing lightweight icon approach
   * (Header's ☰/✕, ThemeToggle's ☀️/🌙, Alert's ⚠/✓/ℹ) — no icon library
   * dependency. Public API exposes no `icon_key` field (only 30_SEED_DATA.sql
   * defines one at the DB level, not surfaced through RoomDetail.amenities:
   * string[]), so this is a frontend-only mapping keyed off the same
   * translationKey, built for the room detail page's amenities list. */
  icon: string;
}

export const AMENITIES: AmenityOption[] = [
  { translationKey: 'amenity.wifi', key: 'wifi', category: 'EQUIPMENT', icon: '📶' },
  { translationKey: 'amenity.projector', key: 'projector', category: 'EQUIPMENT', icon: '📽️' },
  { translationKey: 'amenity.whiteboard', key: 'whiteboard', category: 'EQUIPMENT', icon: '🖊️' },
  { translationKey: 'amenity.tv_screen', key: 'tv_screen', category: 'EQUIPMENT', icon: '📺' },
  { translationKey: 'amenity.video_conferencing', key: 'video_conferencing', category: 'EQUIPMENT', icon: '🎥' },
  { translationKey: 'amenity.sound_system', key: 'sound_system', category: 'EQUIPMENT', icon: '🔊' },
  { translationKey: 'amenity.soundproofing', key: 'soundproofing', category: 'EQUIPMENT', icon: '🔇' },
  { translationKey: 'amenity.lighting_kit', key: 'lighting_kit', category: 'EQUIPMENT', icon: '💡' },
  { translationKey: 'amenity.air_conditioning', key: 'air_conditioning', category: 'COMFORT', icon: '❄️' },
  { translationKey: 'amenity.natural_light', key: 'natural_light', category: 'COMFORT', icon: '☀️' },
  { translationKey: 'amenity.coffee_tea', key: 'coffee_tea', category: 'COMFORT', icon: '☕' },
  { translationKey: 'amenity.kitchen_access', key: 'kitchen_access', category: 'COMFORT', icon: '🍽️' },
  { translationKey: 'amenity.parking', key: 'parking', category: 'ACCESSIBILITY', icon: '🅿️' },
  { translationKey: 'amenity.wheelchair_accessible', key: 'wheelchair_accessible', category: 'ACCESSIBILITY', icon: '♿' },
  { translationKey: 'amenity.near_metro', key: 'near_metro', category: 'ACCESSIBILITY', icon: '🚇' },
  { translationKey: 'amenity.reception_staff', key: 'reception_staff', category: 'COMFORT', icon: '🛎️' },
  { translationKey: 'amenity.printer_scanner', key: 'printer_scanner', category: 'EQUIPMENT', icon: '🖨️' },
  { translationKey: 'amenity.private_entrance', key: 'private_entrance', category: 'ACCESSIBILITY', icon: '🚪' },
];

const DEFAULT_AMENITY_ICON = '•';

export function amenityIconFromTranslationKey(translationKey: string): string {
  return AMENITIES.find((a) => a.translationKey === translationKey)?.icon ?? DEFAULT_AMENITY_ICON;
}

export const AMENITY_CATEGORIES: AmenityCategory[] = ['EQUIPMENT', 'COMFORT', 'ACCESSIBILITY'];

export function roomTypeKeyFromTranslationKey(translationKey: string | undefined | null): string | undefined {
  return ROOM_TYPES.find((rt) => rt.translationKey === translationKey)?.key;
}

export function amenityKeyFromTranslationKey(translationKey: string): string | undefined {
  return AMENITIES.find((a) => a.translationKey === translationKey)?.key;
}
