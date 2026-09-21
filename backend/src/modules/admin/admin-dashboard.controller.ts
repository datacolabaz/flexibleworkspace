import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminDashboardService } from './admin-dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

@ApiTags('Admin')
@Controller('admin/dashboard')
@Roles(...ADMIN_ROLES)
@RequirePermission(AdminPermission.AUDIT_READ)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Live admin dashboard summary counts' })
  summary() {
    return this.dashboardService.summary();
  }
}
