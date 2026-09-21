import { Injectable, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';

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
      throw new ServiceUnavailableException({
        code: 'AI_SEARCH_NOT_CONFIGURED',
        message: 'AI search is not configured yet. Use the standard filters instead.',
      });
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

    if (!response?.ok) {
      throw new BadGatewayException({ code: 'AI_SEARCH_PROVIDER_ERROR', message: 'AI search is temporarily unavailable.' });
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException({ code: 'AI_SEARCH_EMPTY_RESPONSE', message: 'AI search returned no result.' });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException({ code: 'AI_SEARCH_INVALID_RESPONSE', message: 'AI search returned invalid filters.' });
    }

    const priceMaxAzn = typeof parsed.priceMaxAzn === 'number' && parsed.priceMaxAzn >= 0 ? parsed.priceMaxAzn : null;
    const filters = Object.fromEntries(Object.entries({
      city: parsed.city,
      district: parsed.district,
      roomType: parsed.roomType,
      date: parsed.date,
      startTime: parsed.startTime,
      durationMinutes: parsed.durationMinutes,
      participants: parsed.participants,
      priceMax: priceMaxAzn === null ? undefined : Math.round(priceMaxAzn * 100),
      amenities: Array.isArray(parsed.amenities) ? parsed.amenities.slice(0, 12) : [],
      sort: parsed.sort,
    }).filter(([, value]) => value !== null && value !== undefined && value !== '')) as SearchIntent['filters'];

    return {
      filters,
      clarifyingQuestion: typeof parsed.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion : null,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    };
  }
}
