import { describe, expect, it } from 'vitest';
import {
  AMENITIES,
  ROOM_TYPES,
  amenityKeyFromTranslationKey,
  roomTypeKeyFromTranslationKey,
} from '@/lib/constants/taxonomy';

describe('taxonomy constants', () => {
  it('has exactly the 11 top-level + 3 sub room types from 30_SEED_DATA.sql', () => {
    expect(ROOM_TYPES).toHaveLength(14);
    expect(ROOM_TYPES.filter((rt) => rt.parentKey === null)).toHaveLength(11);
    expect(ROOM_TYPES.filter((rt) => rt.parentKey !== null)).toHaveLength(3);
  });

  it('every room type translationKey is prefixed room_type. and matches its own key', () => {
    for (const rt of ROOM_TYPES) {
      expect(rt.translationKey).toBe(`room_type.${rt.key}`);
    }
  });

  it('has exactly the 18 amenities from 30_SEED_DATA.sql', () => {
    expect(AMENITIES).toHaveLength(18);
  });

  it('every amenity translationKey is prefixed amenity. and matches its own key', () => {
    for (const a of AMENITIES) {
      expect(a.translationKey).toBe(`amenity.${a.key}`);
    }
  });

  it('roomTypeKeyFromTranslationKey resolves a known key and returns undefined for an unknown one', () => {
    expect(roomTypeKeyFromTranslationKey('room_type.meeting_room')).toBe('meeting_room');
    expect(roomTypeKeyFromTranslationKey('room_type.not_real')).toBeUndefined();
    expect(roomTypeKeyFromTranslationKey(undefined)).toBeUndefined();
  });

  it('amenityKeyFromTranslationKey resolves a known key and returns undefined for an unknown one', () => {
    expect(amenityKeyFromTranslationKey('amenity.wifi')).toBe('wifi');
    expect(amenityKeyFromTranslationKey('amenity.not_real')).toBeUndefined();
  });
});
