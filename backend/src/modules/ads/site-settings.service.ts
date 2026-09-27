import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DomainException } from '../../common/exceptions/domain.exception';
import { SITE_SETTING_SOCIAL_KEYS } from '../../common/constants/ads.enum';
import { SiteSettingEntity } from './entities/site-setting.entity';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { AuditLogService } from '../audit/audit-log.service';

const ALLOWED_KEYS = new Set<string>(SITE_SETTING_SOCIAL_KEYS);

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

@Injectable()
export class SiteSettingsService {
  constructor(
    @InjectRepository(SiteSettingEntity)
    private readonly settingsRepo: Repository<SiteSettingEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getPublicSocials() {
    const rows = await this.settingsRepo.find({
      where: { key: In([...SITE_SETTING_SOCIAL_KEYS]) },
    });
    const map = Object.fromEntries(
      SITE_SETTING_SOCIAL_KEYS.map((key) => [key, '']),
    );
    for (const row of rows) {
      map[row.key] = row.value ?? '';
    }
    return {
      instagram: map['social.instagram'],
      facebook: map['social.facebook'],
      tiktok: map['social.tiktok'],
      linkedin: map['social.linkedin'],
    };
  }

  async getAdminSettings() {
    const rows = await this.settingsRepo.find({ order: { key: 'ASC' } });
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }));
  }

  async updateSettings(adminUserId: string, dto: UpdateSiteSettingsDto) {
    const entries = Object.entries(dto.settings ?? {});
    for (const [key, value] of entries) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new DomainException(
          'INVALID_SITE_SETTING',
          `Unknown setting key: ${key}`,
        );
      }
      if (typeof value !== 'string') {
        throw new DomainException(
          'INVALID_SITE_SETTING',
          `Setting ${key} must be a string.`,
        );
      }
      if (value.length > 500) {
        throw new DomainException(
          'INVALID_SITE_SETTING',
          `Setting ${key} is too long.`,
        );
      }
      if (!isHttpUrl(value)) {
        throw new DomainException(
          'INVALID_SITE_SETTING',
          `Setting ${key} must be an http(s) URL or empty.`,
        );
      }
    }

    const before = await this.getPublicSocials();
    const now = new Date();
    for (const [key, value] of entries) {
      let row = await this.settingsRepo.findOne({ where: { key } });
      row ??= this.settingsRepo.create({ key, value: '' });
      row.value = value.trim();
      row.updatedBy = adminUserId;
      row.updatedAt = now;
      await this.settingsRepo.save(row);
    }
    const after = await this.getPublicSocials();
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'SiteSetting',
      entityId: 'social',
      action: 'ADMIN_SITE_SETTINGS_UPDATE',
      beforeState: before,
      afterState: after,
      reason: dto.reason ?? null,
    });
    return this.getAdminSettings();
  }
}
