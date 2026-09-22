import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

/**
 * Provider Analytics (Feature Gap Analysis, Medium priority) — mirrors
 * `LeadsProviderController`'s shape exactly: same `@Roles` guard, same
 * `requireProviderId` ownership check, one read-only endpoint.
 */
@ApiTags('Provider')
@Controller('provider/analytics')
@Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
export class ProviderAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private requireProviderId(user: AuthenticatedUser): string {
    const providerId = currentProviderId(user);
    if (!providerId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    return providerId;
  }

  @Get()
  @ApiOperation({
    summary:
      'My analytics: room views, booking requests, confirmation rate (last 30 days)',
  })
  async overview(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.forProvider(this.requireProviderId(user));
  }
}
