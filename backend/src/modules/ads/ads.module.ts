import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AdCampaignEntity } from './entities/ad-campaign.entity';
import { AdEventEntity } from './entities/ad-event.entity';
import { AdPlacementEntity } from './entities/ad-placement.entity';
import { SiteSettingEntity } from './entities/site-setting.entity';
import { AdsService } from './ads.service';
import { AdsPublicController } from './ads-public.controller';
import { SiteSettingsService } from './site-settings.service';
import { SiteSettingsPublicController } from './site-settings-public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdPlacementEntity,
      AdCampaignEntity,
      AdEventEntity,
      SiteSettingEntity,
    ]),
    AuditModule,
  ],
  controllers: [AdsPublicController, SiteSettingsPublicController],
  providers: [AdsService, SiteSettingsService],
  exports: [AdsService, SiteSettingsService],
})
export class AdsModule {}
