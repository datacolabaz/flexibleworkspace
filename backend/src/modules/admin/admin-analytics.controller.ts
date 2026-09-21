import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminPermission } from '../../common/constants/admin-permission.enum';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('Admin')
@Controller('admin/analytics')
@Roles(...ADMIN_ROLES)
@RequirePermission(AdminPermission.AUDIT_READ)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.analyticsService.dashboard(30);
  }
}
