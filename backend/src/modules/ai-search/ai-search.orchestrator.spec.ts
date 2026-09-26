import { AiSearchOrchestrator } from './ai-search.orchestrator';
import { SearchService } from '../search/search.service';
import { AiSearchService } from './ai-search.service';
import { TaxonomyMapper } from './taxonomy.mapper';

describe('AiSearchOrchestrator', () => {
  it('maps AI intent to canonical filters before searching real spaces', async () => {
    const aiSearchService = {
      interpret: jest.fn().mockResolvedValue({
        filters: {
          district: 'Nərimanovda',
          roomType: 'görüş otağı',
          participants: 14,
          amenities: ['proyektor', 'Wi-Fi'],
        },
        confidence: 0.75,
        clarifyingQuestion: null,
      }),
    } as unknown as AiSearchService;
    const searchService = {
      search: jest.fn().mockResolvedValue({
        results: [],
        page: 1,
        pageSize: 20,
        totalCount: 0,
      }),
    } as unknown as SearchService;
    const orchestrator = new AiSearchOrchestrator(
      aiSearchService,
      searchService,
      new TaxonomyMapper(),
    );

    const result = await orchestrator.search(
      'Nərimanovda 14 nəfərlik görüş otağı',
      'az',
    );

    expect(searchService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        district: 'Nərimanov',
        roomType: 'room_type.meeting_room',
        participants: 14,
        amenities: ['amenity.projector', 'amenity.wifi'],
        page: 1,
        pageSize: 20,
      }),
    );
    expect(result.results.totalCount).toBe(0);
  });
});
