import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SiteSettingsService } from '../ads/site-settings.service';
import { UpdateSiteSettingsDto } from '../ads/dto/update-site-settings.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

@ApiTags('Admin')
@Controller('admin/site-settings')
@Roles(...ADMIN_ROLES)
export class AdminSiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  @RequirePermission(AdminPermission.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Read configurable site settings (social URLs)' })
  list() {
    return this.siteSettingsService.getAdminSettings();
  }

  @Patch()
  @RequirePermission(AdminPermission.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Update configurable site settings' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSiteSettingsDto,
  ) {
    return this.siteSettingsService.updateSettings(user.userId, dto);
  }
}
