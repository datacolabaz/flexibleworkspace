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
import { RoomEntity } from '../rooms/entities/room.entity';
import { AvailabilityRuleEntity } from '../rooms/entities/availability-rule.entity';
import { BlockedPeriodEntity } from '../rooms/entities/blocked-period.entity';
import { HolidayEntity } from '../rooms/entities/holiday.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BookingEntity,
      BookingItemEntity,
      RoomEntity,
      AvailabilityRuleEntity,
      BlockedPeriodEntity,
      HolidayEntity,
    ]),
    ScheduleModule.forRoot(),
    RoomsModule,
    AuthModule,
    PartnersModule, // ReferralTrackingService.attributeBooking (31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 step 4)
  ],
  controllers: [BookingsController],
  providers: [BookingsService, AvailabilityService, BookingsTasks],
  exports: [BookingsService, AvailabilityService, TypeOrmModule],
})
export class BookingsModule {}
