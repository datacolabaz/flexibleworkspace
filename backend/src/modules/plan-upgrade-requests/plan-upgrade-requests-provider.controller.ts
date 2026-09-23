import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PlanUpgradeRequestsService } from './plan-upgrade-requests.service';
import { CreatePlanUpgradeRequestDto } from './dto/create-plan-upgrade-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

@ApiTags('Provider')
@Controller('provider/plan-upgrade-request')
@Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
export class PlanUpgradeRequestsProviderController {
  constructor(
    private readonly planUpgradeRequestsService: PlanUpgradeRequestsService,
  ) {}

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
  @ApiOperation({ summary: 'My open plan-upgrade request, if any' })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.planUpgradeRequestsService.myLatestPending(
      this.requireProviderId(user),
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Ask an admin to move me to a higher plan (no self-serve checkout yet)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlanUpgradeRequestDto,
  ) {
    return this.planUpgradeRequestsService.requestUpgrade(
      this.requireProviderId(user),
      dto.note,
    );
  }
}
