import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PartnersService } from './partners.service';
import { ReferralCampaignsService } from './referral-campaigns.service';
import { ReferralTrackingService } from './referral-tracking.service';
import { PartnerAnalyticsService } from './partner-analytics.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { ChangePartnerStatusDto } from './dto/change-partner-status.dto';
import { CreateReferralCampaignDto } from './dto/create-referral-campaign.dto';
import { UpdateReferralCampaignDto } from './dto/update-referral-campaign.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.6/§31.7 — admin-only partner
 * provisioning and campaign management (no partner self-service in V1).
 * `partner.read` for GETs, `partner.update` for ordinary field edits and
 * campaign management, `partner.approve` reserved for the PartnerStatus
 * trust-gating transition specifically (§33.4's matrix defines exactly
 * these three partner permissions, no finer split — same interpretation
 * discipline as AdminTaxonomyController's read-permission decision).
 */
@ApiTags('Admin')
@Controller('admin/partners')
@Roles(...ADMIN_ROLES)
export class AdminPartnersController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly campaignsService: ReferralCampaignsService,
    private readonly trackingService: ReferralTrackingService,
    private readonly analyticsService: PartnerAnalyticsService,
  ) {}

  @Post()
  @RequirePermission(AdminPermission.PARTNER_UPDATE)
  @ApiOperation({
    summary:
      'Provision a new partner (always starts PENDING — activate separately via /status)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePartnerDto,
  ) {
    return this.partnersService.create(user.userId, dto);
  }

  @Get()
  @RequirePermission(AdminPermission.PARTNER_READ)
  @ApiOperation({ summary: 'Search/list partners by name or contact email' })
  async list(@Query('q') q?: string) {
    return this.partnersService.list(q);
  }

  @Get(':id')
  @RequirePermission(AdminPermission.PARTNER_READ)
  async findOne(@Param('id') id: string) {
    return this.partnersService.findById(id);
  }

  @Patch(':id')
  @RequirePermission(AdminPermission.PARTNER_UPDATE)
  @ApiOperation({
    summary:
      "Correct a partner's fields (reason required, audited) — not for status changes",
  })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(id, user.userId, dto);
  }

  @Post(':id/status')
  @RequirePermission(AdminPermission.PARTNER_APPROVE)
  @ApiOperation({
    summary: 'Approve (PENDING->ACTIVE) or suspend/reinstate a partner',
  })
  async changeStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePartnerStatusDto,
  ) {
    return this.partnersService.changeStatus(id, user.userId, dto);
  }

  @Post(':id/campaigns')
  @RequirePermission(AdminPermission.PARTNER_UPDATE)
  @ApiOperation({
    summary: 'Create a trackable referral campaign/code for this partner',
  })
  async createCampaign(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReferralCampaignDto,
  ) {
    const campaign = await this.campaignsService.create(id, user.userId, dto);
    return {
      ...campaign,
      trackingUrl: this.trackingService.buildTrackingUrl(campaign.code),
    };
  }

  @Get(':id/campaigns')
  @RequirePermission(AdminPermission.PARTNER_READ)
  async listCampaigns(@Param('id') id: string) {
    const campaigns = await this.campaignsService.listForPartner(id);
    return campaigns.map((c) => ({
      ...c,
      trackingUrl: this.trackingService.buildTrackingUrl(c.code),
    }));
  }

  @Patch(':id/campaigns/:campaignId')
  @RequirePermission(AdminPermission.PARTNER_UPDATE)
  async updateCampaign(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateReferralCampaignDto,
  ) {
    return this.campaignsService.update(campaignId, user.userId, dto);
  }

  @Get(':id/analytics')
  @RequirePermission(AdminPermission.PARTNER_READ)
  @ApiOperation({
    summary:
      'Clicks, attributed bookings, commission earned/paid (§31.7 — admin-facing only in V1)',
  })
  async analytics(@Param('id') id: string) {
    return this.analyticsService.forPartner(id);
  }
}
