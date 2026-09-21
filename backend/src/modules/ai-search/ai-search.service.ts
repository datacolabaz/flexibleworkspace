import { Injectable } from '@nestjs/common';

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
    sort: { type: ['string', 'null'], enum: ['relevance', 'price', 'distance', 'rating', null] },
    clarifyingQuestion: { type: ['string', 'null'], maxLength: 240 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['city', 'district', 'roomType', 'date', 'startTime', 'durationMinutes', 'participants', 'priceMaxAzn', 'amenities', 'sort', 'clarifyingQuestion', 'confidence'],
  additionalProperties: false,
};

@Injectable()
export class AiSearchService {
  async interpret(query: string, locale: 'az' | 'ru' | 'en'): Promise<SearchIntent> {
    const apiKey = process.env.OPENAI_API_KEY;
    const apiBase = (process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    if (!apiKey) {
      return this.fallbackIntent(query);
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_SEARCH_MODEL ?? 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You extract search filters for a room and workspace marketplace. The user language is ${locale}. Return only JSON matching the schema. Never invent availability, prices, addresses or room IDs. Use room type taxonomy keys when known (for example room_type.meeting_room, room_type.event_space, room_type.studio). Convert AZN budgets to priceMaxAzn. If the request is ambiguous, set clarifyingQuestion to one short question; otherwise null.`,
          },
          { role: 'user', content: query.trim() },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'search_intent', strict: true, schema: SEARCH_INTENT_SCHEMA },
        },
        max_completion_tokens: 700,
      }),
    }).catch(() => null);

    if (!response?.ok) return this.fallbackIntent(query);

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return this.fallbackIntent(query);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return this.fallbackIntent(query);
    }

    const priceValue = parsed.priceMaxAzn;
    const priceMaxAzn = typeof priceValue === 'number' && priceValue >= 0 ? priceValue : null;
    const amenitiesValue = parsed.amenities;
    const clarifyingQuestionValue = parsed.clarifyingQuestion;
    const confidenceValue = parsed.confidence;
    const filters = Object.fromEntries(Object.entries({
      city: parsed.city,
      district: parsed.district,
      roomType: parsed.roomType,
      date: parsed.date,
      startTime: parsed.startTime,
      durationMinutes: parsed.durationMinutes,
      participants: parsed.participants,
      priceMax: priceMaxAzn === null ? undefined : Math.round(priceMaxAzn * 100),
      amenities: Array.isArray(amenitiesValue) ? amenitiesValue.slice(0, 12) : [],
      sort: parsed.sort,
    }).filter(([, value]) => value !== null && value !== undefined && value !== '')) as SearchIntent['filters'];

    return {
      filters,
      clarifyingQuestion: typeof clarifyingQuestionValue === 'string' ? clarifyingQuestionValue : null,
      confidence: typeof confidenceValue === 'number' ? Math.max(0, Math.min(1, confidenceValue)) : 0,
    };
  }

  private fallbackIntent(query: string): SearchIntent {
    const text = query.toLocaleLowerCase('az-AZ');
    const number = (pattern: RegExp) => {
      const match = text.match(pattern);
      return match ? Number(match[1]) : undefined;
    };
    const district = ['nərimanov', 'yasamal', 'xətai', 'nəsimi', 'səbail', 'binəqədi'].find((value) => text.includes(value));
    const city = text.includes('baku') || text.includes('bakı') ? 'Baku' : undefined;
    const roomType = text.includes('studio') ? 'room_type.photo_video_studio' : text.includes('tədbir') ? 'room_type.event_space' : text.includes('görüş') || text.includes('iclas') ? 'room_type.meeting_room' : undefined;
    const amenityMap: Array<[RegExp, string]> = [
      [/proyektor|projector/, 'amenity.projector'],
      [/wifi|wi-fi/, 'amenity.wifi'],
      [/ağ lövhə|whiteboard/, 'amenity.whiteboard'],
      [/parkinq|avtodayanacaq|parking/, 'amenity.parking'],
      [/metro/, 'amenity.near_metro'],
    ];
    const amenities = amenityMap.filter(([pattern]) => pattern.test(text)).map(([, key]) => key);
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
      clarifyingQuestion: amenities.length || city || district || roomType || participants || priceAzn ? null : 'Şəhər, iştirakçı sayı və ya büdcə əlavə edin.',
      confidence: 0.35,
    };
  }
}
