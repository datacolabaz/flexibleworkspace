import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdsService } from '../ads/ads.service';
import {
  CreateAdCampaignDto,
  UpdateAdCampaignDto,
  UpdateAdPlacementDto,
} from '../ads/dto/ads.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

@ApiTags('Admin')
@Controller('admin/ads')
@Roles(...ADMIN_ROLES)
export class AdminAdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get('placements')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({ summary: 'List ad placements (one reusable slot per key)' })
  listPlacements() {
    return this.adsService.listPlacements();
  }

  @Patch('placements/:id')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({
    summary: 'Update placement rotation interval (30/45/60/90s)',
  })
  updatePlacement(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAdPlacementDto,
  ) {
    return this.adsService.updatePlacement(id, user.userId, dto);
  }

  @Get('campaigns')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({ summary: 'List advertising campaigns' })
  listCampaigns() {
    return this.adsService.listCampaigns();
  }

  @Post('campaigns')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({ summary: 'Create an advertising campaign' })
  createCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdCampaignDto,
  ) {
    return this.adsService.createCampaign(user.userId, dto);
  }

  @Patch('campaigns/:id')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({ summary: 'Update an advertising campaign' })
  updateCampaign(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAdCampaignDto,
  ) {
    return this.adsService.updateCampaign(id, user.userId, dto);
  }

  @Delete('campaigns/:id')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({ summary: 'Delete an advertising campaign' })
  deleteCampaign(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adsService.deleteCampaign(id, user.userId);
  }

  @Get('analytics')
  @RequirePermission(AdminPermission.CMS_UPDATE)
  @ApiOperation({ summary: 'Campaign impression, click and CTR totals' })
  analytics() {
    return this.adsService.analytics();
  }
}
