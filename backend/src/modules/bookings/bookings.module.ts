import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { BookingsTasks } from './bookings.tasks';
import { BookingEntity } from './entities/booking.entity';
import { BookingItemEntity } from './entities/booking-item.entity';
import { RoomsModule } from '../rooms/rooms.module';
import { AuthModule } from '../auth/auth.module';
import { PartnersModule } from '../partners/partners.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProvidersModule } from '../providers/providers.module';
import { RoomEntity } from '../rooms/entities/room.entity';
import { AvailabilityRuleEntity } from '../rooms/entities/availability-rule.entity';
import { BlockedPeriodEntity } from '../rooms/entities/blocked-period.entity';
import { HolidayEntity } from '../rooms/entities/holiday.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BookingEntity,
      BookingItemEntity,
      RoomEntity,
      AvailabilityRuleEntity,
      BlockedPeriodEntity,
      HolidayEntity,
      AppUserEntity,
    ]),
    ScheduleModule.forRoot(),
    RoomsModule,
    AuthModule,
    PartnersModule, // ReferralTrackingService.attributeBooking (31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 step 4)
    NotificationsModule, // T4 — accept/reject customer notifications
    ProvidersModule, // T4 — provider ownership + verification-status checks
    PromoModule, // Task 4 — promo code validation and referral qualification
  ],
  controllers: [BookingsController],
  providers: [BookingsService, AvailabilityService, BookingsTasks],
  exports: [BookingsService, AvailabilityService, TypeOrmModule],
})
export class BookingsModule {}
