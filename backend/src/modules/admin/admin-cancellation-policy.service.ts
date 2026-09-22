import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminCancellationPolicySettingEntity } from './entities/admin-cancellation-policy-setting.entity';
import { UpdateCancellationPolicySettingDto } from './dto/update-cancellation-policy-setting.dto';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * 05_USER_FLOWS.md §5.6 — the platform-wide fallback cancellation policy,
 * used whenever a room never set its own `cancellation_policy` (RoomEntity,
 * nullable JSONB). Same "platform_default" single-row pattern as
 * AdminPricingService. Read directly by RefundsService/PayoutsService —
 * see their own comments — rather than through this service, since those
 * live on the hot refund/payout-eligibility path and only need the raw
 * numbers, not the admin CRUD/audit wrapper.
 */
@Injectable()
export class AdminCancellationPolicyService {
  constructor(
    @InjectRepository(AdminCancellationPolicySettingEntity)
    private readonly settingRepo: Repository<AdminCancellationPolicySettingEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getDefault() {
    const setting = await this.settingRepo.findOne({
      where: { settingKey: 'platform_default' },
    });
    return (
      setting ?? {
        settingKey: 'platform_default',
        freeUntilHours: '24.00',
        partialRefundPct: '0.00',
        updatedBy: null,
        updatedAt: null,
      }
    );
  }

  async updateDefault(
    adminUserId: string,
    dto: UpdateCancellationPolicySettingDto,
  ) {
    const setting = await this.settingRepo.findOne({
      where: { settingKey: 'platform_default' },
    });
    const before = setting
      ? {
          freeUntilHours: setting.freeUntilHours,
          partialRefundPct: setting.partialRefundPct,
        }
      : null;
    const entity =
      setting ?? this.settingRepo.create({ settingKey: 'platform_default' });
    entity.freeUntilHours = dto.freeUntilHours.toFixed(2);
    entity.partialRefundPct = dto.partialRefundPct.toFixed(2);
    entity.updatedBy = adminUserId;
    entity.updatedAt = new Date();
    const saved = await this.settingRepo.save(entity);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdminCancellationPolicySetting',
      entityId: saved.id,
      action: 'ADMIN_CANCELLATION_POLICY_UPDATE',
      beforeState: before,
      afterState: {
        freeUntilHours: saved.freeUntilHours,
        partialRefundPct: saved.partialRefundPct,
      },
      reason: dto.reason,
    });

    return saved;
  }
}
