import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AD_ROTATION_INTERVALS,
  DEFAULT_AD_ROTATION_INTERVAL,
  HOMEPAGE_SIDEBAR_PLACEMENT,
} from '../../common/constants/ads.enum';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import { AdCampaignEntity } from './entities/ad-campaign.entity';
import { AdEventEntity } from './entities/ad-event.entity';
import { AdPlacementEntity } from './entities/ad-placement.entity';
import { AdInquiryEntity } from './entities/ad-inquiry.entity';
import {
  CreateAdCampaignDto,
  RecordAdEventDto,
  UpdateAdCampaignDto,
  UpdateAdPlacementDto,
} from './dto/ads.dto';
import {
  CreateAdInquiryDto,
  UpdateAdInquiryStatusDto,
} from './dto/ad-inquiry.dto';
import { AdInquiryStatus } from '../../common/constants/ad-inquiry.enum';
import { AuditLogService } from '../audit/audit-log.service';

export function isCampaignLive(
  campaign: AdCampaignEntity,
  now = new Date(),
): boolean {
  if (!campaign.active) return false;
  if (campaign.startsAt && campaign.startsAt > now) return false;
  if (campaign.endsAt && campaign.endsAt < now) return false;
  return Boolean(campaign.creativeUrl && campaign.clickUrl);
}

function optionalDate(value?: string | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return new Date(value);
}

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(AdPlacementEntity)
    private readonly placementRepo: Repository<AdPlacementEntity>,
    @InjectRepository(AdCampaignEntity)
    private readonly campaignRepo: Repository<AdCampaignEntity>,
    @InjectRepository(AdEventEntity)
    private readonly eventRepo: Repository<AdEventEntity>,
    @InjectRepository(AdInquiryEntity)
    private readonly inquiryRepo: Repository<AdInquiryEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getPublicSlot(placementKey: string) {
    const placement = await this.placementRepo.findOne({
      where: { key: placementKey },
    });
    if (!placement) {
      return {
        placementKey,
        rotationIntervalSeconds: DEFAULT_AD_ROTATION_INTERVAL,
        ads: [] as Array<{
          id: string;
          advertiserName: string;
          creativeUrl: string;
          clickUrl: string;
          weight: number;
          creativeSize: string;
        }>,
      };
    }
    const campaigns = await this.campaignRepo.find({
      where: { placementId: placement.id },
    });
    const ads = campaigns
      .filter((campaign) => isCampaignLive(campaign))
      .map((campaign) => ({
        id: campaign.id,
        advertiserName: campaign.advertiserName,
        creativeUrl: campaign.creativeUrl,
        clickUrl: campaign.clickUrl,
        weight: campaign.weight,
        creativeSize: campaign.creativeSize,
      }));
    return {
      placementKey: placement.key,
      rotationIntervalSeconds: placement.rotationIntervalSeconds,
      ads,
    };
  }

  async recordEvent(campaignId: string, dto: RecordAdEventDto) {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign || !isCampaignLive(campaign)) {
      throw new ResourceNotFoundException('Ad campaign');
    }
    const clientEventId = dto.eventId?.trim() || null;
    if (clientEventId) {
      const existing = await this.eventRepo.findOne({
        where: { clientEventId },
      });
      if (existing) return { recorded: false };
    }
    await this.eventRepo.save(
      this.eventRepo.create({
        campaignId,
        eventType: dto.type,
        clientEventId,
        createdAt: new Date(),
      }),
    );
    return { recorded: true };
  }

  listPlacements() {
    return this.placementRepo.find({ order: { key: 'ASC' } });
  }

  async updatePlacement(
    id: string,
    adminUserId: string,
    dto: UpdateAdPlacementDto,
  ) {
    if (
      !AD_ROTATION_INTERVALS.includes(
        dto.rotationIntervalSeconds as (typeof AD_ROTATION_INTERVALS)[number],
      )
    ) {
      throw new DomainException(
        'INVALID_AD_INTERVAL',
        'Rotation interval must be 30, 45, 60 or 90 seconds.',
      );
    }
    const placement = await this.placementRepo.findOne({ where: { id } });
    if (!placement) throw new ResourceNotFoundException('Ad placement');
    const before = {
      rotationIntervalSeconds: placement.rotationIntervalSeconds,
    };
    placement.rotationIntervalSeconds = dto.rotationIntervalSeconds;
    const saved = await this.placementRepo.save(placement);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdPlacement',
      entityId: saved.id,
      action: 'ADMIN_AD_PLACEMENT_UPDATE',
      beforeState: before,
      afterState: { rotationIntervalSeconds: saved.rotationIntervalSeconds },
    });
    return saved;
  }

  async listCampaigns() {
    return this.campaignRepo.find({
      relations: ['placement'],
      order: { updatedAt: 'DESC' },
    });
  }

  async createCampaign(adminUserId: string, dto: CreateAdCampaignDto) {
    const placement = await this.requirePlacementByKey(dto.placementKey);
    const now = new Date();
    const saved = await this.campaignRepo.save(
      this.campaignRepo.create({
        placementId: placement.id,
        active: dto.active,
        startsAt: optionalDate(dto.startsAt),
        endsAt: optionalDate(dto.endsAt),
        advertiserName: dto.advertiserName.trim(),
        creativeUrl: dto.creativeUrl.trim(),
        clickUrl: dto.clickUrl.trim(),
        weight: dto.weight,
        creativeSize: dto.creativeSize,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdCampaign',
      entityId: saved.id,
      action: 'ADMIN_AD_CAMPAIGN_CREATE',
      afterState: this.campaignSnapshot(saved, placement.key),
    });
    return { ...saved, placement };
  }

  async updateCampaign(
    id: string,
    adminUserId: string,
    dto: UpdateAdCampaignDto,
  ) {
    const campaign = await this.campaignRepo.findOne({
      where: { id },
      relations: ['placement'],
    });
    if (!campaign) throw new ResourceNotFoundException('Ad campaign');
    const before = this.campaignSnapshot(campaign, campaign.placement?.key);
    if (dto.placementKey) {
      const placement = await this.requirePlacementByKey(dto.placementKey);
      campaign.placementId = placement.id;
      campaign.placement = placement;
    }
    if (dto.active !== undefined) campaign.active = dto.active;
    if (dto.startsAt !== undefined)
      campaign.startsAt = optionalDate(dto.startsAt);
    if (dto.endsAt !== undefined) campaign.endsAt = optionalDate(dto.endsAt);
    if (dto.advertiserName !== undefined)
      campaign.advertiserName = dto.advertiserName.trim();
    if (dto.creativeUrl !== undefined)
      campaign.creativeUrl = dto.creativeUrl.trim();
    if (dto.clickUrl !== undefined) campaign.clickUrl = dto.clickUrl.trim();
    if (dto.weight !== undefined) campaign.weight = dto.weight;
    if (dto.creativeSize !== undefined)
      campaign.creativeSize = dto.creativeSize;
    campaign.updatedAt = new Date();
    const saved = await this.campaignRepo.save(campaign);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdCampaign',
      entityId: saved.id,
      action: 'ADMIN_AD_CAMPAIGN_UPDATE',
      beforeState: before,
      afterState: this.campaignSnapshot(saved, campaign.placement?.key),
    });
    return saved;
  }

  async deleteCampaign(id: string, adminUserId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new ResourceNotFoundException('Ad campaign');
    await this.campaignRepo.remove(campaign);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdCampaign',
      entityId: id,
      action: 'ADMIN_AD_CAMPAIGN_DELETE',
      beforeState: { advertiserName: campaign.advertiserName },
    });
    return { deleted: true as const };
  }

  async analytics() {
    const campaigns = await this.campaignRepo.find({
      relations: ['placement'],
      order: { advertiserName: 'ASC' },
    });
    const counts = await this.eventRepo
      .createQueryBuilder('event')
      .select('event.campaignId', 'campaignId')
      .addSelect(
        `SUM(CASE WHEN event.eventType = 'impression' THEN 1 ELSE 0 END)`,
        'impressions',
      )
      .addSelect(
        `SUM(CASE WHEN event.eventType = 'click' THEN 1 ELSE 0 END)`,
        'clicks',
      )
      .groupBy('event.campaignId')
      .getRawMany<{
        campaignId: string;
        impressions: string;
        clicks: string;
      }>();
    const byCampaign = new Map(
      counts.map((row) => [
        row.campaignId,
        {
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
        },
      ]),
    );
    return campaigns.map((campaign) => {
      const stats = byCampaign.get(campaign.id) ?? {
        impressions: 0,
        clicks: 0,
      };
      const ctr =
        stats.impressions === 0 ? 0 : (stats.clicks / stats.impressions) * 100;
      return {
        campaignId: campaign.id,
        advertiserName: campaign.advertiserName,
        placementKey: campaign.placement?.key ?? HOMEPAGE_SIDEBAR_PLACEMENT,
        active: campaign.active,
        live: isCampaignLive(campaign),
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: Number(ctr.toFixed(2)),
      };
    });
  }

  /**
   * Public — no auth, no captcha (the `/advertise` form is the only
   * caller; abuse is bounded by `AdsPublicController`'s own `@Throttle`,
   * same posture as `AdsPublicController.recordEvent`). Never anything
   * beyond a DB row: no email/SMS is sent, since neither is wired up
   * anywhere in this codebase yet — an admin has to check the inbox
   * (`listInquiries`) themselves.
   */
  async createInquiry(dto: CreateAdInquiryDto): Promise<AdInquiryEntity> {
    return this.inquiryRepo.save(
      this.inquiryRepo.create({
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        contactEmail: dto.contactEmail?.trim() || null,
        companyName: dto.companyName?.trim() || null,
        message: dto.message?.trim() || null,
        status: AdInquiryStatus.NEW,
        createdAt: new Date(),
      }),
    );
  }

  async listInquiries(): Promise<AdInquiryEntity[]> {
    return this.inquiryRepo.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async updateInquiryStatus(
    id: string,
    adminUserId: string,
    dto: UpdateAdInquiryStatusDto,
  ): Promise<AdInquiryEntity> {
    const inquiry = await this.inquiryRepo.findOne({ where: { id } });
    if (!inquiry) throw new ResourceNotFoundException('Ad inquiry');
    const before = { status: inquiry.status };
    inquiry.status = dto.status;
    if (dto.status === AdInquiryStatus.CONTACTED && !inquiry.contactedAt) {
      inquiry.contactedAt = new Date();
      inquiry.contactedByUserId = adminUserId;
    }
    const saved = await this.inquiryRepo.save(inquiry);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdInquiry',
      entityId: saved.id,
      action: 'ADMIN_AD_INQUIRY_STATUS_UPDATE',
      beforeState: before,
      afterState: { status: saved.status },
    });
    return saved;
  }

  private async requirePlacementByKey(key: string) {
    const placement = await this.placementRepo.findOne({ where: { key } });
    if (!placement) throw new ResourceNotFoundException('Ad placement');
    return placement;
  }

  private campaignSnapshot(campaign: AdCampaignEntity, placementKey?: string) {
    return {
      placementKey: placementKey ?? null,
      active: campaign.active,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      advertiserName: campaign.advertiserName,
      creativeUrl: campaign.creativeUrl,
      clickUrl: campaign.clickUrl,
      weight: campaign.weight,
      creativeSize: campaign.creativeSize,
    };
  }
}
