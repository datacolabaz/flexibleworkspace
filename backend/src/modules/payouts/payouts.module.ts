import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PayoutEntity } from './entities/payout.entity';
import { LedgerEntryEntity } from '../payments/entities/ledger-entry.entity';
import { ProviderEntity } from '../providers/entities/provider.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { PartnerEntity } from '../partners/entities/partner.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    // PartnerEntity only — a repository dependency for notifyPartnerPaid,
    // not a PartnersModule import, so there's no PayoutsModule<->PartnersModule
    // cycle (PartnersModule is the one that imports PayoutsModule, for its
    // admin analytics endpoint's earned/paid figures).
    TypeOrmModule.forFeature([
      PayoutEntity,
      LedgerEntryEntity,
      ProviderEntity,
      AppUserEntity,
      PartnerEntity,
    ]),
    NotificationsModule,
    AuditModule,
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
