import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TO_CATEGORY,
  MARKETPLACE_CATEGORY_SLUGS,
  buildSpaceSearchQuery,
  filterExistingAmenities,
  mapActivityToCategory,
  resolveRoomTypeForSpacesQuery,
  roomTypeFromMarketplaceCategory,
} from '@/lib/search/activity-category';

describe('activity → marketplace category mapping', () => {
  it('maps PODCAST_RECORDING to PODCAST_STUDIO', () => {
    expect(mapActivityToCategory('PODCAST_RECORDING')).toBe('PODCAST_STUDIO');
    expect(ACTIVITY_TO_CATEGORY.PODCAST_RECORDING).toBe('PODCAST_STUDIO');
  });

  it('maps COWORKING to COWORKING_SPACE, not COWORKING', () => {
    expect(mapActivityToCategory('COWORKING')).toBe('COWORKING_SPACE');
  });

  it('maps CREATIVE_SESSION to CREATIVE_COMMUNITY_SPACE', () => {
    expect(mapActivityToCategory('CREATIVE_SESSION')).toBe('CREATIVE_COMMUNITY_SPACE');
  });

  it('maps CONFERENCE to SMALL_EVENT_SPACE (EVENT_SPACE is not a marketplace slug)', () => {
    expect(mapActivityToCategory('CONFERENCE')).toBe('SMALL_EVENT_SPACE');
    expect((MARKETPLACE_CATEGORY_SLUGS as readonly string[]).includes('EVENT_SPACE')).toBe(false);
  });

  it('does not throw on unknown activity; omits category', () => {
    expect(() => mapActivityToCategory('UNKNOWN_ACTIVITY_XYZ')).not.toThrow();
    expect(mapActivityToCategory('UNKNOWN_ACTIVITY_XYZ')).toBeUndefined();
    const query = buildSpaceSearchQuery({
      activity: 'UNKNOWN_ACTIVITY_XYZ',
      participants: 8,
      city: 'Bakı',
    });
    expect(query.get('category')).toBeNull();
    expect(query.get('participants')).toBe('8');
    expect(query.get('city')).toBe('Bakı');
  });

  it('maps YOGA to YOGA_DANCE_STUDIO but does not invent a roomType that taxonomy lacks', () => {
    expect(mapActivityToCategory('YOGA')).toBe('YOGA_DANCE_STUDIO');
    expect(roomTypeFromMarketplaceCategory('YOGA_DANCE_STUDIO')).toBeUndefined();
    expect(roomTypeFromMarketplaceCategory('CREATIVE_COMMUNITY_SPACE')).toBeUndefined();
  });

  it('treats an already-mapped marketplace slug as identity', () => {
    expect(mapActivityToCategory('MEETING_ROOM')).toBe('MEETING_ROOM');
  });
});

describe('buildSpaceSearchQuery', () => {
  it('forwards participants and metro UUID with a mapped category', () => {
    const metroStationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const query = buildSpaceSearchQuery({
      activity: 'PODCAST_RECORDING',
      participants: 10,
      metroStationId,
      amenities: ['amenity.lighting_kit'],
    });
    expect(query.get('category')).toBe('PODCAST_STUDIO');
    expect(query.get('participants')).toBe('10');
    expect(query.get('metroStationId')).toBe(metroStationId);
    expect(query.get('amenities')).toBe('amenity.lighting_kit');
    expect(query.get('roomType')).toBeNull();
  });

  it('never puts camera, microphone, or green_screen in the query', () => {
    const query = buildSpaceSearchQuery({
      activity: 'PHOTO_SHOOT',
      amenities: ['camera', 'microphone', 'green_screen', 'amenity.camera', 'amenity.wifi'],
    });
    const amenities = query.get('amenities') ?? '';
    expect(amenities).toBe('amenity.wifi');
    expect(amenities).not.toMatch(/camera|microphone|green_screen/i);
    expect(filterExistingAmenities(['camera', 'microphone', 'green_screen'])).toEqual([]);
  });

  it('purpose-only selection does not auto-add amenities', () => {
    const query = buildSpaceSearchQuery({ activity: 'PODCAST_RECORDING' });
    expect(query.get('category')).toBe('PODCAST_STUDIO');
    expect(query.has('amenities')).toBe(false);
  });

  it('keeps existing roomType category search working', () => {
    const query = buildSpaceSearchQuery({
      roomType: 'room_type.meeting_room',
      participants: 4,
    });
    expect(query.get('roomType')).toBe('room_type.meeting_room');
    expect(query.get('participants')).toBe('4');
    expect(resolveRoomTypeForSpacesQuery({ roomType: 'room_type.meeting_room' })).toBe(
      'room_type.meeting_room',
    );
  });

  it('maps marketplace category slugs onto existing GET /spaces roomType keys', () => {
    expect(roomTypeFromMarketplaceCategory('PODCAST_STUDIO')).toBe('room_type.podcast_studio');
    expect(roomTypeFromMarketplaceCategory('COWORKING_SPACE')).toBe('room_type.coworking_desk');
    expect(roomTypeFromMarketplaceCategory('SMALL_EVENT_SPACE')).toBe('room_type.event_space');
    expect(resolveRoomTypeForSpacesQuery({ category: 'MEETING_ROOM' })).toBe('room_type.meeting_room');
  });
});
