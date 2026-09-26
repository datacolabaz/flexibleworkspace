import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminPricingService } from './admin-pricing.service';
import { UpdatePricingSettingDto } from './dto/update-pricing-setting.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

@ApiTags('Admin')
@Controller('admin/pricing')
@Roles(...ADMIN_ROLES)
export class AdminPricingController {
  constructor(private readonly pricingService: AdminPricingService) {}

  @Get('default')
  @RequirePermission(AdminPermission.COMMISSION_READ)
  @ApiOperation({
    summary: 'Read platform default commission and minimum price',
  })
  getDefault() {
    return this.pricingService.getDefault();
  }

  @Patch('default')
  @RequirePermission(AdminPermission.COMMISSION_UPDATE)
  @ApiOperation({ summary: 'Update platform default pricing rules' })
  updateDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePricingSettingDto,
  ) {
    return this.pricingService.updateDefault(user.userId, dto);
  }
}
