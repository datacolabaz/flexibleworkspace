import { Injectable } from '@nestjs/common';

export const ROOM_TYPE_KEYS = [
  'room_type.meeting_room',
  'room_type.coworking_desk',
  'room_type.private_office',
  'room_type.training_room',
  'room_type.classroom',
  'room_type.workshop_space',
  'room_type.seminar_room',
  'room_type.conference_room',
  'room_type.podcast_studio',
  'room_type.photo_video_studio',
  'room_type.event_space',
] as const;

export const AMENITY_KEYS = [
  'amenity.wifi',
  'amenity.projector',
  'amenity.whiteboard',
  'amenity.tv_screen',
  'amenity.video_conferencing',
  'amenity.sound_system',
  'amenity.soundproofing',
  'amenity.lighting_kit',
  'amenity.air_conditioning',
  'amenity.natural_light',
  'amenity.coffee_tea',
  'amenity.kitchen_access',
  'amenity.parking',
  'amenity.wheelchair_accessible',
  'amenity.near_metro',
  'amenity.reception_staff',
  'amenity.printer_scanner',
  'amenity.private_entrance',
] as const;

export type RoomTypeKey = (typeof ROOM_TYPE_KEYS)[number];
export type AmenityKey = (typeof AMENITY_KEYS)[number];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[ıİ]/g, 'i')
    .replace(/[əƏ]/g, 'e')
    .toLocaleLowerCase('az-AZ')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const roomTypeAliases: Record<string, RoomTypeKey> = {
  'room_type.meeting_room': 'room_type.meeting_room',
  'gorus otagi': 'room_type.meeting_room',
  'gorush otagi': 'room_type.meeting_room',
  'iclas otagi': 'room_type.meeting_room',
  'meeting room': 'room_type.meeting_room',
  'room type meeting': 'room_type.meeting_room',
  coworking: 'room_type.coworking_desk',
  'coworking desk': 'room_type.coworking_desk',
  'coworking masasi': 'room_type.coworking_desk',
  ofis: 'room_type.private_office',
  'private office': 'room_type.private_office',
  'telim otagi': 'room_type.training_room',
  'training room': 'room_type.training_room',
  'sinif otagi': 'room_type.classroom',
  classroom: 'room_type.classroom',
  'emeliyyat sahesi': 'room_type.workshop_space',
  emalatxana: 'room_type.workshop_space',
  workshop: 'room_type.workshop_space',
  'seminar otagi': 'room_type.seminar_room',
  'seminar room': 'room_type.seminar_room',
  'konfrans otagi': 'room_type.conference_room',
  'conference room': 'room_type.conference_room',
  'podkast studiyasi': 'room_type.podcast_studio',
  'podcast studio': 'room_type.podcast_studio',
  studio: 'room_type.photo_video_studio',
  studia: 'room_type.photo_video_studio',
  'foto studiyasi': 'room_type.photo_video_studio',
  'foto ve video studiyasi': 'room_type.photo_video_studio',
  'photo video studio': 'room_type.photo_video_studio',
  'tedbir mekani': 'room_type.event_space',
  'event space': 'room_type.event_space',
  'event venue': 'room_type.event_space',
};

const amenityAliases: Record<string, AmenityKey> = {
  'amenity.wifi': 'amenity.wifi',
  wifi: 'amenity.wifi',
  'wi-fi': 'amenity.wifi',
  internet: 'amenity.wifi',
  'simsiz internet': 'amenity.wifi',
  'amenity.projector': 'amenity.projector',
  proyektor: 'amenity.projector',
  projector: 'amenity.projector',
  'amenity.whiteboard': 'amenity.whiteboard',
  'ag lovhe': 'amenity.whiteboard',
  whiteboard: 'amenity.whiteboard',
  'white board': 'amenity.whiteboard',
  'amenity.tv_screen': 'amenity.tv_screen',
  tv: 'amenity.tv_screen',
  ekran: 'amenity.tv_screen',
  'amenity.video_conferencing': 'amenity.video_conferencing',
  'video konfrans': 'amenity.video_conferencing',
  zoom: 'amenity.video_conferencing',
  'amenity.air_conditioning': 'amenity.air_conditioning',
  kondisioner: 'amenity.air_conditioning',
  'air conditioning': 'amenity.air_conditioning',
  'amenity.natural_light': 'amenity.natural_light',
  'tebii isiq': 'amenity.natural_light',
  'natural light': 'amenity.natural_light',
  'amenity.coffee_tea': 'amenity.coffee_tea',
  'cay qehve': 'amenity.coffee_tea',
  coffee: 'amenity.coffee_tea',
  'amenity.parking': 'amenity.parking',
  parking: 'amenity.parking',
  parkinq: 'amenity.parking',
  avtodayanacaq: 'amenity.parking',
  'amenity.near_metro': 'amenity.near_metro',
  metro: 'amenity.near_metro',
  'metroya yaxin': 'amenity.near_metro',
  'amenity.wheelchair_accessible': 'amenity.wheelchair_accessible',
  'elil arabasi': 'amenity.wheelchair_accessible',
  'amenity.private_entrance': 'amenity.private_entrance',
  'ayrica giris': 'amenity.private_entrance',
  'amenity.soundproofing': 'amenity.soundproofing',
  sesizolasiya: 'amenity.soundproofing',
};

@Injectable()
export class TaxonomyMapper {
  mapRoomType(value: unknown): RoomTypeKey | undefined {
    if (typeof value !== 'string') return undefined;
    return roomTypeAliases[normalize(value)];
  }

  mapAmenities(value: unknown): AmenityKey[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map(normalize)
          .map((item) => amenityAliases[item])
          .filter((item): item is AmenityKey => Boolean(item)),
      ),
    ];
  }

  roomTypeKeys(): readonly RoomTypeKey[] {
    return ROOM_TYPE_KEYS;
  }

  amenityKeys(): readonly AmenityKey[] {
    return AMENITY_KEYS;
  }
}

export { normalize as normalizeTaxonomyText };
