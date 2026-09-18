import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ReferralCampaignEntity } from './entities/referral-campaign.entity';
import { PartnersService } from './partners.service';
import { CreateReferralCampaignDto } from './dto/create-referral-campaign.dto';
import { UpdateReferralCampaignDto } from './dto/update-referral-campaign.dto';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

/** Postgres unique-violation error code — how a duplicate campaign code is detected (mirrors PaymentsService's identical idempotency-guard pattern). */
const PG_UNIQUE_VIOLATION = '23505';

/** 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.2/§31.6 — campaigns nested under a partner. */
@Injectable()
export class ReferralCampaignsService {
  constructor(
    @InjectRepository(ReferralCampaignEntity)
    private readonly campaignRepo: Repository<ReferralCampaignEntity>,
    private readonly partnersService: PartnersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    partnerId: string,
    adminUserId: string,
    dto: CreateReferralCampaignDto,
  ): Promise<ReferralCampaignEntity> {
    await this.partnersService.findById(partnerId); // 404s if the partner doesn't exist

    const campaign = this.campaignRepo.create({
      partnerId,
      name: dto.name,
      code: dto.code,
      commissionTypeOverride: dto.commissionTypeOverride ?? null,
      commissionValueOverride:
        dto.commissionValueOverride != null
          ? String(dto.commissionValueOverride)
          : null,
      attributionWindowDays: dto.attributionWindowDays ?? 30,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      createdAt: new Date(),
    });

    let saved: ReferralCampaignEntity;
    try {
      saved = await this.campaignRepo.save(campaign);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw new DomainException(
          'CAMPAIGN_CODE_TAKEN',
          `Referral code "${dto.code}" is already in use.`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'ReferralCampaign',
      entityId: saved.id,
      action: 'CREATE',
      afterState: { partnerId, code: saved.code, status: saved.status },
    });
    return saved;
  }

  async listForPartner(partnerId: string): Promise<ReferralCampaignEntity[]> {
    return this.campaignRepo.find({
      where: { partnerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<ReferralCampaignEntity> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new ResourceNotFoundException('ReferralCampaign');
    return campaign;
  }

  async update(
    id: string,
    adminUserId: string,
    dto: UpdateReferralCampaignDto,
  ): Promise<ReferralCampaignEntity> {
    const campaign = await this.findById(id);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    const apply = (field: keyof ReferralCampaignEntity, value: unknown) => {
      if (value === undefined) return;
      before[field] = (campaign as any)[field];
      (campaign as any)[field] = value;
      after[field] = (campaign as any)[field];
    };
    apply('name', dto.name);
    apply('status', dto.status);
    apply('commissionTypeOverride', dto.commissionTypeOverride ?? undefined);
    apply(
      'commissionValueOverride',
      dto.commissionValueOverride != null
        ? String(dto.commissionValueOverride)
        : undefined,
    );
    apply('attributionWindowDays', dto.attributionWindowDays);
    apply('startsAt', dto.startsAt ? new Date(dto.startsAt) : undefined);
    apply('endsAt', dto.endsAt ? new Date(dto.endsAt) : undefined);

    if (Object.keys(after).length === 0) {
      throw new DomainException(
        'NO_FIELDS_TO_UPDATE',
        'At least one updatable field must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const saved = await this.campaignRepo.save(campaign);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'ReferralCampaign',
      entityId: id,
      action: 'UPDATE',
      beforeState: before,
      afterState: after,
    });
    return saved;
  }
}
