import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetroStationEntity } from '../locations/entities/metro-station.entity';
import { LocationCategoryEntity } from '../locations/entities/location-category.entity';
import {
  ROOM_TYPE_KEYS,
  TaxonomyMapper,
  normalizeTaxonomyText,
} from './taxonomy.mapper';

export type VoiceFilters = {
  metroStation?: string;
  metroStationId?: string;
  nearbyMetro?: boolean;
  /** PostGIS proximity: latitude of the target point (metro station or landmark). */
  lat?: number;
  /** PostGIS proximity: longitude of the target point. */
  lng?: number;
  /** PostGIS proximity radius in km (default 0.8 — approx 10 min walk). */
  radiusKm?: number;
  roomType?: string;
  participants?: number;
  maxHourlyPrice?: number;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
};

export type SearchIntent = {
  filters: {
    city?: string;
    district?: string;
    roomType?: string;
    date?: string;
    startTime?: string;
    durationMinutes?: number;
    participants?: number;
    priceMax?: number;
    amenities?: string[];
    sort?: 'relevance' | 'price' | 'distance' | 'rating';
  };
  clarifyingQuestion: string | null;
  confidence: number;
};

/** Proximity radius when searching "near a metro station" or a landmark (≈10 min walk). */
const NEARBY_METRO_RADIUS_KM = 0.8;

/**
 * Well-known Baku landmarks mapped to coordinates.
 * Search terms are pre-normalised (diacritics stripped, lowercase) so they
 * can be compared directly against the output of normalizeTaxonomyText().
 */
const BAKU_LANDMARKS: ReadonlyArray<{
  name: string;
  searchTerms: readonly string[];
  lat: number;
  lng: number;
}> = [
  {
    name: 'Həydər Əliyev Mərkəzi',
    searchTerms: ['heyder eliyev', 'heydar aliyev'],
    lat: 40.3974,
    lng: 49.8673,
  },
  {
    name: 'Bəyük Park / Buləvar',
    searchTerms: ['bulevar', 'bulvar', 'denizkenari'],
    lat: 40.3669,
    lng: 49.8346,
  },
  {
    name: 'Fəvvarələr meydanı',
    searchTerms: ['fevvareler', 'fontanlar'],
    lat: 40.3717,
    lng: 49.8402,
  },
  {
    name: 'İçərişəhər',
    searchTerms: ['iceriseher', 'iceri seher', 'old city'],
    lat: 40.3663,
    lng: 49.8357,
  },
  {
    name: 'Gənclik Mall',
    searchTerms: ['genclik mall'],
    lat: 40.4079,
    lng: 49.8671,
  },
  {
    name: 'Nizami küçəsi',
    searchTerms: ['torqovaya', 'torgovaya'],
    lat: 40.3728,
    lng: 49.8385,
  },
  {
    name: 'Port Baku',
    searchTerms: ['port baku', 'port baki'],
    lat: 40.3641,
    lng: 49.8314,
  },
];

const SEARCH_INTENT_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: ['string', 'null'] },
    district: { type: ['string', 'null'] },
    roomType: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    startTime: { type: ['string', 'null'] },
    durationMinutes: { type: ['integer', 'null'], minimum: 1 },
    participants: { type: ['integer', 'null'], minimum: 1 },
    priceMaxAzn: { type: ['number', 'null'], minimum: 0 },
    amenities: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    sort: {
      type: ['string', 'null'],
      enum: ['relevance', 'price', 'distance', 'rating', null],
    },
    clarifyingQuestion: { type: ['string', 'null'], maxLength: 240 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'city',
    'district',
    'roomType',
    'date',
    'startTime',
    'durationMinutes',
    'participants',
    'priceMaxAzn',
    'amenities',
    'sort',
    'clarifyingQuestion',
    'confidence',
  ],
  additionalProperties: false,
};

/**
 * Human-readable Azerbaijani labels for each room-type translation key.
 * Used only in the voiceParse() system prompt so GPT can pick the right key
 * when the user speaks Azerbaijani. These do NOT need to be kept in the DB —
 * they are a static prompt aid derived from the fixed taxonomy.
 */
const ROOM_TYPE_AZ_LABELS: Record<string, string> = {
  'room_type.meeting_room': 'görüş/iclas otağı',
  'room_type.coworking_desk': 'kovorkinq masası',
  'room_type.private_office': 'şəxsi/xüsusi ofis',
  'room_type.training_room': 'təlim otağı',
  'room_type.classroom': 'sinif otağı, dərslik',
  'room_type.workshop_space': 'emalatxana, workshop',
  'room_type.seminar_room': 'seminar otağı',
  'room_type.conference_room': 'konfrans otağı',
  'room_type.podcast_studio': 'podkast studiyası',
  'room_type.photo_video_studio': 'foto/video studiyası',
  'room_type.event_space': 'tədbir məkanı, mərasim zalı',
};

@Injectable()
export class AiSearchService {
  constructor(
    @InjectRepository(MetroStationEntity)
    private readonly metroRepo: Repository<MetroStationEntity>,
    @InjectRepository(LocationCategoryEntity)
    private readonly categoryRepo: Repository<LocationCategoryEntity>,
    private readonly taxonomyMapper: TaxonomyMapper,
  ) {}

  // ---------------------------------------------------------------------------
  // Voice: parse Azerbaijani transcript → structured filters
  // ---------------------------------------------------------------------------
  async voiceParse(transcript: string): Promise<VoiceFilters> {
    const apiKey = process.env.OPENAI_API_KEY;
    const apiBase = (
      process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, '');
    const model = process.env.AI_SEARCH_MODEL ?? 'gpt-5-mini';

    if (!apiKey) return {};

    // Fetch reference data from DB — select id too so we can return metroStationId.
    const stations = await this.metroRepo.find({
      where: { isActive: true },
      select: ['id', 'nameAz'],
    });
    const stationsList = stations.map((s) => s.nameAz).join(', ');

    // Room types come from the canonical taxonomy (not location_categories) so
    // the returned key is directly usable as a search filter.
    const roomTypeList = ROOM_TYPE_KEYS.map((key) => {
      const az = ROOM_TYPE_AZ_LABELS[key] ?? key;
      return `${key} (${az})`;
    }).join(', ');

    const systemPrompt = `Sən Spotva platforması üçün filter assistentisən. İstifadəçinin Azərbaycan dilindəki sorğusunu aşağıdakı filter strukturuna çevir.

Mövcud metro stansiyaları: ${stationsList}
Mövcud otaq növləri (açar: Azərbaycan adı): ${roomTypeList}

Yalnız aşağıdakı JSON formatında cavab ver, başqa heç nə yazma:
{
  "metroStation": "dəqiq stansiya adı yuxarıdakı siyahıdan" | null,
  "nearbyMetro": true | false,
  "roomType": "room_type.xxx açarı yuxarıdakı siyahıdan" | null,
  "participants": number | null,
  "maxHourlyPrice": number | null,
  "date": "YYYY-MM-DD" | null,
  "startTime": "HH:mm" | null,
  "durationMinutes": number | null
}

Qayda 1: metroStation üçün YALNIZ yuxarıdakı siyahıdakı dəqiq adlardan birini istifadə et. Siyahıda yoxdursa null qoy.
Qayda 2: nearbyMetro — istifadəçi metro stansiyasına yaxınlığı ifadə edirsə ("yanında", "yaxınında", "yaxın", "ətrafında", "ətrafına", "yaxınlıqda", "metroya yaxın", "metrodan yaxın") true qoy. Yoxdursa false.
Qayda 3: roomType üçün YALNIZ yuxarıdakı "room_type.xxx" açarlarından birini istifadə et. Siyahıda yoxdursa null qoy.
Qayda 4: Əmin olmadığın hər bir sahəni null qoy.`;

    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: transcript.trim() },
          ],
          max_completion_tokens: 400,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return {};

      const payload = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) return {};

      const jsonStr = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      const result: VoiceFilters = {};

      // ---- Metro station: validate GPT output against canonical DB list ----
      if (typeof parsed.metroStation === 'string' && parsed.metroStation) {
        const stationNames = stations.map((s) => s.nameAz);
        const canonical = this.findClosestMetroName(parsed.metroStation, stationNames);
        if (canonical) {
          result.metroStation = canonical;
          const matched = stations.find((s) => s.nameAz === canonical);
          if (matched) {
            result.metroStationId = matched.id;
            // When user says "near/yanında" and the station has coordinates,
            // use PostGIS proximity (ST_DWithin) instead of the FK-only filter.
            // This covers locations that haven't had nearest_metro_station_id
            // populated yet, while still finding everything within walking distance.
            if (
              parsed.nearbyMetro === true &&
              matched.latitude !== null &&
              matched.longitude !== null
            ) {
              result.lat = matched.latitude;
              result.lng = matched.longitude;
              result.radiusKm = NEARBY_METRO_RADIUS_KM;
            }
          }
        }
      }

      // ---- Nearby metro intent ----
      if (parsed.nearbyMetro === true) result.nearbyMetro = true;

      // ---- Room type: validate against canonical taxonomy keys ----
      if (typeof parsed.roomType === 'string' && parsed.roomType) {
        // Try direct translation key match first, then fall back to TaxonomyMapper aliases.
        const directMatch = (ROOM_TYPE_KEYS as readonly string[]).includes(parsed.roomType)
          ? (parsed.roomType as (typeof ROOM_TYPE_KEYS)[number])
          : undefined;
        const mapped = directMatch ?? this.taxonomyMapper.mapRoomType(parsed.roomType);
        if (mapped) result.roomType = mapped;
      }

      if (typeof parsed.participants === 'number' && parsed.participants > 0)
        result.participants = parsed.participants;
      if (typeof parsed.maxHourlyPrice === 'number' && parsed.maxHourlyPrice > 0)
        result.maxHourlyPrice = parsed.maxHourlyPrice;
      if (typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date))
        result.date = parsed.date;
      if (typeof parsed.startTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.startTime))
        result.startTime = parsed.startTime;
      if (typeof parsed.durationMinutes === 'number' && parsed.durationMinutes > 0)
        result.durationMinutes = parsed.durationMinutes;

      // ---- Landmark resolution (runs only when metro proximity didn't already
      // set coords — landmark coords are used for the same ST_DWithin path). ----
      if (result.lat === undefined) {
        const landmark = this.findLandmarkInTranscript(transcript);
        if (landmark) {
          result.lat = landmark.lat;
          result.lng = landmark.lng;
          result.radiusKm = NEARBY_METRO_RADIUS_KM;
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  /**
   * Fuzzy-matches `input` against a list of canonical metro station names
   * using Azerbaijani diacritic normalisation. Returns the canonical name if
   * found, or null. Never invents names — always returns a member of
   * `canonicals` or null.
   */
  private findClosestMetroName(
    input: string,
    canonicals: string[],
  ): string | null {
    if (!input || canonicals.length === 0) return null;

    // 1. Exact match (fastest path, covers most correctly-spelled GPT output)
    if (canonicals.includes(input)) return input;

    const normInput = normalizeTaxonomyText(input);

    // 2. Exact match after diacritic normalisation
    const exact = canonicals.find((c) => normalizeTaxonomyText(c) === normInput);
    if (exact) return exact;

    // 3. Substring containment (handles "28 May" ↔ "28 May (xətt 2)")
    const contains = canonicals.find((c) => {
      const normC = normalizeTaxonomyText(c);
      return normInput.includes(normC) || normC.includes(normInput);
    });
    if (contains) return contains;

    // 4. Word-level overlap — any canonical word (≥4 chars) appears in input
    const wordMatch = canonicals.find((c) => {
      const words = normalizeTaxonomyText(c)
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      return words.some((w) => normInput.includes(w));
    });
    if (wordMatch) return wordMatch;

    return null;
  }

  /**
   * Checks the raw transcript for any known Baku landmark name.
   * Uses pre-normalised search terms from BAKU_LANDMARKS so no DB round-trip
   * is needed. Returns the landmark's coordinates, or null if nothing matched.
   */
  private findLandmarkInTranscript(
    transcript: string,
  ): { lat: number; lng: number } | null {
    const normTranscript = normalizeTaxonomyText(transcript);
    for (const landmark of BAKU_LANDMARKS) {
      for (const term of landmark.searchTerms) {
        if (normTranscript.includes(term)) {
          return { lat: landmark.lat, lng: landmark.lng };
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Voice: transcribe audio buffer via OpenAI Whisper
  // ---------------------------------------------------------------------------
  async voiceTranscribe(
    audioBuffer: Buffer,
    mimeType: string,
    originalName: string,
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    const apiBase = (
      process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, '');

    if (!apiKey) return '';

    const formData = new FormData();
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = originalName || `voice.${ext}`;
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'az');
    formData.append('response_format', 'text');

    try {
      const res = await fetch(`${apiBase}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) return '';
      const text = await res.text();
      return text.trim();
    } catch {
      return '';
    }
  }

  async interpret(
    query: string,
    locale: 'az' | 'ru' | 'en',
  ): Promise<SearchIntent> {
    const apiKey = process.env.OPENAI_API_KEY;
    const apiBase = (
      process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, '');
    if (!apiKey) {
      return this.fallbackIntent(query);
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_SEARCH_MODEL ?? 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You extract search filters for a room and workspace marketplace. The user language is ${locale}. Return only JSON matching the schema. Never invent availability, prices, addresses or room IDs. Use ONLY these canonical roomType keys: room_type.meeting_room, room_type.coworking_desk, room_type.private_office, room_type.training_room, room_type.classroom, room_type.workshop_space, room_type.seminar_room, room_type.conference_room, room_type.podcast_studio, room_type.photo_video_studio, room_type.event_space. Use ONLY canonical amenity keys such as amenity.wifi, amenity.projector, amenity.whiteboard, amenity.tv_screen, amenity.video_conferencing, amenity.air_conditioning, amenity.natural_light, amenity.coffee_tea, amenity.parking, amenity.near_metro, amenity.wheelchair_accessible, amenity.private_entrance. Azerbaijani aliases include: görüş/iclas otağı = room_type.meeting_room, coworking masası = room_type.coworking_desk, studiya/foto studiyası = room_type.photo_video_studio, tədbir məkanı = room_type.event_space, proyektor = amenity.projector, Wi-Fi/internet = amenity.wifi, ağ lövhə = amenity.whiteboard, avtodayanacaq/parkinq = amenity.parking, metroya yaxın = amenity.near_metro. Convert AZN budgets to priceMaxAzn. Normalize district spellings such as Nərimanov/Nerimanov/Narimanov to Nərimanov. If the request is ambiguous, set clarifyingQuestion to one short question; otherwise null.`,
          },
          { role: 'user', content: query.trim() },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'search_intent',
            strict: true,
            schema: SEARCH_INTENT_SCHEMA,
          },
        },
        max_completion_tokens: 700,
      }),
    }).catch(() => null);

    if (!response?.ok) return this.fallbackIntent(query);

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return this.fallbackIntent(query);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return this.fallbackIntent(query);
    }

    const priceValue = parsed.priceMaxAzn;
    const priceMaxAzn =
      typeof priceValue === 'number' && priceValue >= 0 ? priceValue : null;
    const amenitiesValue = parsed.amenities;
    const clarifyingQuestionValue = parsed.clarifyingQuestion;
    const confidenceValue = parsed.confidence;
    const filters = Object.fromEntries(
      Object.entries({
        city: parsed.city,
        district: parsed.district,
        roomType: parsed.roomType,
        date: parsed.date,
        startTime: parsed.startTime,
        durationMinutes: parsed.durationMinutes,
        participants: parsed.participants,
        priceMax:
          priceMaxAzn === null ? undefined : Math.round(priceMaxAzn * 100),
        amenities: Array.isArray(amenitiesValue)
          ? amenitiesValue.slice(0, 12)
          : [],
        sort: parsed.sort,
      }).filter(
        ([, value]) => value !== null && value !== undefined && value !== '',
      ),
    ) as SearchIntent['filters'];

    return {
      filters,
      clarifyingQuestion:
        typeof clarifyingQuestionValue === 'string'
          ? clarifyingQuestionValue
          : null,
      confidence:
        typeof confidenceValue === 'number'
          ? Math.max(0, Math.min(1, confidenceValue))
          : 0,
    };
  }

  private fallbackIntent(query: string): SearchIntent {
    const text = query.toLocaleLowerCase('az-AZ');
    const number = (pattern: RegExp) => {
      const match = text.match(pattern);
      return match ? Number(match[1]) : undefined;
    };
    const district = [
      'nərimanov',
      'yasamal',
      'xətai',
      'nəsimi',
      'səbail',
      'binəqədi',
    ].find((value) => text.includes(value));
    const city =
      text.includes('baku') || text.includes('bakı') ? 'Baku' : undefined;
    const roomType = text.includes('studio')
      ? 'room_type.photo_video_studio'
      : text.includes('tədbir')
        ? 'room_type.event_space'
        : text.includes('görüş') || text.includes('iclas')
          ? 'room_type.meeting_room'
          : undefined;
    const amenityMap: Array<[RegExp, string]> = [
      [/proyektor|projector/, 'amenity.projector'],
      [/wifi|wi-fi/, 'amenity.wifi'],
      [/ağ lövhə|whiteboard/, 'amenity.whiteboard'],
      [/parkinq|avtodayanacaq|parking/, 'amenity.parking'],
      [/metro/, 'amenity.near_metro'],
    ];
    const amenities = amenityMap
      .filter(([pattern]) => pattern.test(text))
      .map(([, key]) => key);
    const participants = number(/(\d+)\s*(?:nəfər|people|persons|чел)/);
    const priceAzn = number(/(\d+)\s*(?:azn|manat|₼)/);
    const hours = number(/(\d+)\s*(?:saat|hour|ч)/);
    return {
      filters: {
        ...(city ? { city } : {}),
        ...(district ? { district } : {}),
        ...(roomType ? { roomType } : {}),
        ...(participants ? { participants } : {}),
        ...(priceAzn ? { priceMax: priceAzn * 100 } : {}),
        ...(hours ? { durationMinutes: hours * 60 } : {}),
        amenities,
      },
      clarifyingQuestion:
        amenities.length ||
        city ||
        district ||
        roomType ||
        participants ||
        priceAzn
          ? null
          : 'Şəhər, iştirakçı sayı və ya büdcə əlavə edin.',
      confidence: 0.35,
    };
  }
}
