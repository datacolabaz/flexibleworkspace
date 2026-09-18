import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { CommissionService } from './commission.service';
import { EpointPaymentProvider } from './providers/epoint.provider';
import { PayriffPaymentProvider } from './providers/payriff.provider';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentTransactionEntity } from './entities/payment-transaction.entity';
import { RefundEntity } from './entities/refund.entity';
import { CommissionRuleEntity } from './entities/commission-rule.entity';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { BookingsModule } from '../bookings/bookings.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      PaymentTransactionEntity,
      RefundEntity,
      CommissionRuleEntity,
      LedgerEntryEntity,
      BookingEntity,
      AppUserEntity,
    ]),
    BookingsModule,
    AuthModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    RefundsService,
    CommissionService,
    EpointPaymentProvider,
    PayriffPaymentProvider,
  ],
  exports: [PaymentsService, RefundsService, CommissionService],
})
export class PaymentsModule {}
