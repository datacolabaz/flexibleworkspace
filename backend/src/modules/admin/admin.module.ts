import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoomEntity } from '../rooms/entities/room.entity';
import { RoomTypeEntity } from '../rooms/entities/room-type.entity';
import { AmenityEntity } from '../rooms/entities/amenity.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { AuditModule } from '../audit/audit.module';

import { AdminSearchController } from './admin-search.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminTaxonomyController } from './admin-taxonomy.controller';

import { AdminSearchService } from './admin-search.service';
import { AdminUsersService } from './admin-users.service';
import { AdminListingsService } from './admin-listings.service';
import { AdminTaxonomyService } from './admin-taxonomy.service';

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
    ]),
    AuditModule,
  ],
  controllers: [
    AdminSearchController,
    AdminAuditController,
    AdminUsersController,
    AdminListingsController,
    AdminTaxonomyController,
  ],
  providers: [
    AdminSearchService,
    AdminUsersService,
    AdminListingsService,
    AdminTaxonomyService,
  ],
})
export class AdminModule {}
