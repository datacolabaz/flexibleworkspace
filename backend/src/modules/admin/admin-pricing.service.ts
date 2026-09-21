import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminPricingSettingEntity } from './entities/admin-pricing-setting.entity';
import { UpdatePricingSettingDto } from './dto/update-pricing-setting.dto';
import { AuditLogService } from '../audit/audit-log.service';
import { CommissionRuleEntity } from '../payments/entities/commission-rule.entity';
import { CommissionRuleScope } from '../../common/constants/payment.enum';

@Injectable()
export class AdminPricingService {
  constructor(
    @InjectRepository(AdminPricingSettingEntity) private readonly settingRepo: Repository<AdminPricingSettingEntity>,
    @InjectRepository(CommissionRuleEntity) private readonly commissionRepo: Repository<CommissionRuleEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getDefault() {
    const setting = await this.settingRepo.findOne({ where: { settingKey: 'platform_default' } });
    return setting ?? { settingKey: 'platform_default', percentage: '0.00', minimumPriceAmount: '0', currency: 'AZN', updatedBy: null, updatedAt: null };
  }

  async updateDefault(adminUserId: string, dto: UpdatePricingSettingDto) {
    const setting = await this.settingRepo.findOne({ where: { settingKey: 'platform_default' } });
    const before = setting ? { percentage: setting.percentage, minimumPriceAmount: setting.minimumPriceAmount, currency: setting.currency } : null;
    const entity = setting ?? this.settingRepo.create({ settingKey: 'platform_default', currency: 'AZN' });
    entity.percentage = dto.percentage.toFixed(2);
    entity.minimumPriceAmount = String(Math.round(dto.minimumPriceAmount));
    entity.updatedBy = adminUserId;
    entity.updatedAt = new Date();
    const saved = await this.settingRepo.save(entity);
    let commissionRule = await this.commissionRepo.findOne({ where: { scope: CommissionRuleScope.PLATFORM_DEFAULT } });
    commissionRule ??= this.commissionRepo.create({ scope: CommissionRuleScope.PLATFORM_DEFAULT, priority: 0 });
    commissionRule.percentage = entity.percentage;
    commissionRule.fixedFeeAmount = '0';
    commissionRule.fixedFeeCurrency = entity.currency;
    commissionRule.startsAt = null;
    commissionRule.endsAt = null;
    await this.commissionRepo.save(commissionRule);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'AdminPricingSetting',
      entityId: saved.id,
      action: 'ADMIN_PRICING_UPDATE',
      beforeState: before,
      afterState: { percentage: saved.percentage, minimumPriceAmount: saved.minimumPriceAmount, currency: saved.currency },
      reason: dto.reason,
    });
    return saved;
  }
}
