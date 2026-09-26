import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PromoCodeEntity } from './entities/promo-code.entity';
import { ReferralEntity } from './entities/referral.entity';
import { PromoService } from './promo.service';

/**
 * Task 4 — Promo/referral module.
 * Exports PromoService so BookingsModule can inject it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PromoCodeEntity, ReferralEntity])],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}
