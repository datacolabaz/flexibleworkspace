import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminCancellationPolicyService } from './admin-cancellation-policy.service';
import { UpdateCancellationPolicySettingDto } from './dto/update-cancellation-policy-setting.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

@ApiTags('Admin')
@Controller('admin/cancellation-policy')
@Roles(...ADMIN_ROLES)
export class AdminCancellationPolicyController {
  constructor(
    private readonly cancellationPolicyService: AdminCancellationPolicyService,
  ) {}

  @Get('default')
  @RequirePermission(AdminPermission.CANCELLATION_POLICY_READ)
  @ApiOperation({ summary: 'Read the platform default cancellation policy' })
  getDefault() {
    return this.cancellationPolicyService.getDefault();
  }

  @Patch('default')
  @RequirePermission(AdminPermission.CANCELLATION_POLICY_UPDATE)
  @ApiOperation({ summary: 'Update the platform default cancellation policy' })
  updateDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCancellationPolicySettingDto,
  ) {
    return this.cancellationPolicyService.updateDefault(user.userId, dto);
  }
}
