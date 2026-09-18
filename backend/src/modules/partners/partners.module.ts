import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PartnerEntity } from './entities/partner.entity';
import { ReferralCampaignEntity } from './entities/referral-campaign.entity';
import { ReferralClickEntity } from './entities/referral-click.entity';
import { BookingReferralAttributionEntity } from './entities/booking-referral-attribution.entity';

import { PartnersService } from './partners.service';
import { ReferralCampaignsService } from './referral-campaigns.service';
import { ReferralTrackingService } from './referral-tracking.service';
import { PartnerAnalyticsService } from './partner-analytics.service';

import { AdminPartnersController } from './admin-partners.controller';
import { ReferralTrackingController } from './referral-tracking.controller';

import { AuditModule } from '../audit/audit.module';
import { PayoutsModule } from '../payouts/payouts.module';

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md — Partner/Affiliate/Referral module
 * (P4-3a). Exports ReferralTrackingService so BookingsModule can write the
 * booking-time attribution row inside its own creation transaction (§31.4
 * step 4) without this module depending on Bookings in return.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnerEntity,
      ReferralCampaignEntity,
      ReferralClickEntity,
      BookingReferralAttributionEntity,
    ]),
    AuditModule,
    PayoutsModule, // PartnerAnalyticsService reuses PayoutsService.getBalance rather than re-deriving payout eligibility math
  ],
  controllers: [AdminPartnersController, ReferralTrackingController],
  providers: [
    PartnersService,
    ReferralCampaignsService,
    ReferralTrackingService,
    PartnerAnalyticsService,
  ],
  exports: [ReferralTrackingService, PartnersService, TypeOrmModule],
})
export class PartnersModule {}
