import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('spaces')
  @ApiOperation({
    summary:
      'Search rooms with structured filters + live availability (16_SEARCH_ARCHITECTURE.md)',
  })
  async search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  // Registered BEFORE `spaces/:roomId` on purpose — Nest/Express match
  // routes in declaration order, and `:roomId` would otherwise swallow
  // `/spaces/featured` as roomId="featured".
  @Public()
  @Get('spaces/featured')
  @ApiOperation({
    summary:
      "Admin-curated Featured rooms for the homepage (Sprint 4) — 'is_featured' rooms, most recently updated first",
  })
  async getFeatured(@Query('limit') limit?: string) {
    return this.searchService.getFeaturedRooms(
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Public()
  @Get('spaces/:roomId')
  @ApiOperation({ summary: 'Full room detail (public)' })
  async getRoomDetail(@Param('roomId') roomId: string) {
    return this.searchService.getRoomDetail(roomId);
  }
}
