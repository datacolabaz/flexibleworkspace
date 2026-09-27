import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';

@ApiTags('Organizer')
@Controller('organizer/events')
export class OrganizerAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get(':eventId/analytics')
  @ApiOperation({ summary: 'Analytics for an event I organize' })
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    return this.analyticsService.forOrganizer(user.userId, eventId);
  }
}
