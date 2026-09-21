import { Injectable } from '@nestjs/common';
import { SearchQueryDto } from '../search/dto/search-query.dto';
import { SearchResultPage, SearchService } from '../search/search.service';
import { AiSearchService, SearchIntent } from './ai-search.service';
import { TaxonomyMapper } from './taxonomy.mapper';

export interface AiSearchResult {
  query: string;
  filters: SearchQueryDto;
  confidence: number;
  clarifyingQuestion: string | null;
  results: SearchResultPage;
}

function cleanLocation(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/\s*(?:da|də|de|do|du)$/iu, '')
    .trim();
  return cleaned || undefined;
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

@Injectable()
export class AiSearchOrchestrator {
  constructor(
    private readonly aiSearchService: AiSearchService,
    private readonly searchService: SearchService,
    private readonly taxonomyMapper: TaxonomyMapper,
  ) {}

  async search(query: string, locale: 'az' | 'ru' | 'en'): Promise<AiSearchResult> {
    const intent: SearchIntent = await this.aiSearchService.interpret(query, locale);
    const raw = intent.filters;

    const filters: SearchQueryDto = {
      city: cleanLocation(raw.city),
      district: cleanLocation(raw.district),
      roomType: this.taxonomyMapper.mapRoomType(raw.roomType),
      date: typeof raw.date === 'string' ? raw.date : undefined,
      startTime: typeof raw.startTime === 'string' ? raw.startTime : undefined,
      durationMinutes: positiveInt(raw.durationMinutes),
      participants: positiveInt(raw.participants),
      priceMax: positiveInt(raw.priceMax),
      amenities: this.taxonomyMapper.mapAmenities(raw.amenities),
      sort: raw.sort,
      page: 1,
      pageSize: 20,
    };

    const results = await this.searchService.search(filters);

    return {
      query,
      filters,
      confidence: intent.confidence,
      clarifyingQuestion: intent.clarifyingQuestion,
      results,
    };
  }
}
