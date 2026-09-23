import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PlanUpgradeRequestsService } from './plan-upgrade-requests.service';
import { ResolvePlanUpgradeRequestDto } from './dto/resolve-plan-upgrade-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';
import { PlanUpgradeRequestStatus } from '../../common/constants/plan-upgrade-request.enum';

@ApiTags('Admin')
@Controller('admin/plan-upgrade-requests')
@Roles(...ADMIN_ROLES)
export class PlanUpgradeRequestsAdminController {
  constructor(
    private readonly planUpgradeRequestsService: PlanUpgradeRequestsService,
  ) {}

  @Get()
  @RequirePermission(AdminPermission.PROVIDER_PLAN_MANAGE)
  @ApiOperation({
    summary: 'List plan-upgrade requests, optionally filtered by status',
  })
  async list(@Query('status') status?: PlanUpgradeRequestStatus) {
    return this.planUpgradeRequestsService.listForAdmin(status);
  }

  @Post(':id/resolve')
  @RequirePermission(AdminPermission.PROVIDER_PLAN_MANAGE)
  @ApiOperation({
    summary:
      'Resolve a plan-upgrade request, optionally granting a plan tier in the same call',
  })
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolvePlanUpgradeRequestDto,
  ) {
    return this.planUpgradeRequestsService.resolve(
      id,
      user.userId,
      dto.grantPlanTier,
    );
  }
}
