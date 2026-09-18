import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminSearchService } from './admin-search.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';

@ApiTags('Admin')
@Controller('admin/search')
@Roles(...ADMIN_ROLES)
export class AdminSearchController {
  constructor(private readonly adminSearchService: AdminSearchService) {}

  @Get()
  @ApiOperation({
    summary:
      'Global search across bookings, providers, rooms, customers, payments (§18 "Search Everywhere")',
  })
  async search(@Query('q') q: string) {
    return this.adminSearchService.search(q ?? '');
  }
}
