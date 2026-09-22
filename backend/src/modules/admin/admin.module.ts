import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoomEntity } from '../rooms/entities/room.entity';
import { RoomTypeEntity } from '../rooms/entities/room-type.entity';
import { AmenityEntity } from '../rooms/entities/amenity.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { AuditModule } from '../audit/audit.module';
import { AdminPricingSettingEntity } from './entities/admin-pricing-setting.entity';
import { AdminCancellationPolicySettingEntity } from './entities/admin-cancellation-policy-setting.entity';
import { CommissionRuleEntity } from '../payments/entities/commission-rule.entity';
import { AnalyticsModule } from '../analytics/analytics.module';

import { AdminSearchController } from './admin-search.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminTaxonomyController } from './admin-taxonomy.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminCancellationPolicyController } from './admin-cancellation-policy.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';

import { AdminSearchService } from './admin-search.service';
import { AdminUsersService } from './admin-users.service';
import { AdminListingsService } from './admin-listings.service';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminCancellationPolicyService } from './admin-cancellation-policy.service';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md — Admin Operational Control
 * Center (P4-8). Wires the search/audit-browsing/user-management/
 * cross-provider-listing-correction/taxonomy-management surfaces built on
 * top of the pre-existing RBAC (AdminPermission/PermissionGuard/@Roles)
 * and AuditLogService foundation.
 *
 * Deliberately OUT of scope for this module (see code comments at the
 * relevant services/controllers, and PHASE4_REPORT.md "known
 * limitations"): CMS (banners/FAQ) and system settings (feature
 * flags/maintenance mode) have no approved DDL to build against, and
 * Partner admin management depends on the Partner/Referral module
 * (P4-3a), which does not exist yet.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoomEntity,
      RoomTypeEntity,
      AmenityEntity,
      AppUserEntity,
      BookingEntity,
      AdminPricingSettingEntity,
      AdminCancellationPolicySettingEntity,
      CommissionRuleEntity,
    ]),
    AuditModule,
    AnalyticsModule,
  ],
  controllers: [
    AdminSearchController,
    AdminAuditController,
    AdminUsersController,
    AdminListingsController,
    AdminTaxonomyController,
    AdminDashboardController,
    AdminPricingController,
    AdminCancellationPolicyController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminSearchService,
    AdminUsersService,
    AdminListingsService,
    AdminTaxonomyService,
    AdminDashboardService,
    AdminPricingService,
    AdminCancellationPolicyService,
  ],
})
export class AdminModule {}
