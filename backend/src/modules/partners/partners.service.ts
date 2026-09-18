import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { PartnerEntity } from './entities/partner.entity';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { ChangePartnerStatusDto } from './dto/change-partner-status.dto';
import { PARTNER_STATUS_TRANSITIONS } from '../../common/constants/partner.enum';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

const UPDATABLE_FIELDS = [
  'name',
  'type',
  'contactEmail',
  'contactPhone',
  'defaultCommissionType',
  'defaultCommissionValue',
  'bankAccountDetails',
] as const;

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.7 — "partners are admin-provisioned,
 * matching how Provider verification already works." Every mutation goes
 * through AuditLogService (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.6 —
 * the one path every admin write goes through), same discipline as
 * AdminUsersService/AdminListingsService.
 */
@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partnerRepo: Repository<PartnerEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    adminUserId: string,
    dto: CreatePartnerDto,
  ): Promise<PartnerEntity> {
    const now = new Date();
    const partner = this.partnerRepo.create({
      name: dto.name,
      type: dto.type,
      contactEmail: dto.contactEmail ?? null,
      contactPhone: dto.contactPhone ?? null,
      defaultCommissionType: dto.defaultCommissionType,
      defaultCommissionValue: String(dto.defaultCommissionValue),
      bankAccountDetails: dto.bankAccountDetails ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.partnerRepo.save(partner);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Partner',
      entityId: saved.id,
      action: 'CREATE',
      afterState: { name: saved.name, type: saved.type, status: saved.status },
    });
    return saved;
  }

  async findById(id: string): Promise<PartnerEntity> {
    const partner = await this.partnerRepo.findOne({ where: { id } });
    if (!partner || partner.deletedAt)
      throw new ResourceNotFoundException('Partner');
    return partner;
  }

  async list(q?: string): Promise<PartnerEntity[]> {
    if (!q)
      return this.partnerRepo.find({ order: { createdAt: 'DESC' }, take: 200 });
    return this.partnerRepo.find({
      where: [{ name: Like(`%${q}%`) }, { contactEmail: Like(`%${q}%`) }],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async update(
    id: string,
    adminUserId: string,
    dto: UpdatePartnerDto,
  ): Promise<PartnerEntity> {
    const partner = await this.findById(id);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      const value = (dto as any)[field];
      if (value === undefined) continue;
      before[field] = (partner as any)[field];
      (partner as any)[field] =
        field === 'defaultCommissionValue' ? String(value) : value;
      after[field] = (partner as any)[field];
    }
    if (Object.keys(after).length === 0) {
      throw new DomainException(
        'NO_FIELDS_TO_UPDATE',
        'At least one updatable field must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }

    partner.updatedAt = new Date();
    const saved = await this.partnerRepo.save(partner);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Partner',
      entityId: id,
      action: 'ADMIN_UPDATE',
      beforeState: before,
      afterState: after,
      reason: dto.reason,
    });
    return saved;
  }

  /**
   * The trust-gating transition (`partner.approve`, §33.4) — PENDING -> ACTIVE
   * (admin approval), ACTIVE <-> SUSPENDED. Rejects any edge not explicitly
   * modeled rather than silently applying it, same discipline as
   * BookingsService.transition/PayoutsService.transition.
   */
  async changeStatus(
    id: string,
    adminUserId: string,
    dto: ChangePartnerStatusDto,
  ): Promise<PartnerEntity> {
    const partner = await this.findById(id);
    const allowed = PARTNER_STATUS_TRANSITIONS[partner.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new DomainException(
        'INVALID_PARTNER_STATE_TRANSITION',
        `Cannot move partner from ${partner.status} to ${dto.status}.`,
        HttpStatus.CONFLICT,
      );
    }

    const before = { status: partner.status };
    partner.status = dto.status;
    partner.updatedAt = new Date();
    const saved = await this.partnerRepo.save(partner);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Partner',
      entityId: id,
      action: 'STATUS_CHANGE',
      beforeState: before,
      afterState: { status: saved.status },
      reason: dto.reason,
    });
    return saved;
  }
}
