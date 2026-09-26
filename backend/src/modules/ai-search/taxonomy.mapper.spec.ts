import { TaxonomyMapper } from './taxonomy.mapper';

describe('TaxonomyMapper', () => {
  const mapper = new TaxonomyMapper();

  it('maps Azerbaijani room aliases to canonical keys', () => {
    expect(mapper.mapRoomType('Nərimanovda görüş otağı')).toBeUndefined();
    expect(mapper.mapRoomType('görüş otağı')).toBe('room_type.meeting_room');
    expect(mapper.mapRoomType('foto studiyası')).toBe(
      'room_type.photo_video_studio',
    );
  });

  it('maps and deduplicates Azerbaijani amenities', () => {
    expect(
      mapper.mapAmenities(['Wi-Fi', 'internet', 'proyektor', 'avtodayanacaq']),
    ).toEqual(['amenity.wifi', 'amenity.projector', 'amenity.parking']);
  });

  it('drops unknown taxonomy values instead of sending free text to SQL', () => {
    expect(mapper.mapRoomType('unknown room')).toBeUndefined();
    expect(mapper.mapAmenities(['magic amenity', 42])).toEqual([]);
  });
});
