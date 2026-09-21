import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { RoomEntity } from '../rooms/entities/room.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { BookingStatus } from '../../common/constants/booking.enum';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(RoomEntity) private readonly roomRepo: Repository<RoomEntity>,
    @InjectRepository(BookingEntity) private readonly bookingRepo: Repository<BookingEntity>,
    @InjectRepository(AppUserEntity) private readonly userRepo: Repository<AppUserEntity>,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async summary() {
    const [totalRooms, activeRooms, draftRooms, totalUsers, bookingsToday, analytics] = await Promise.all([
      this.roomRepo.count({ where: { deletedAt: null } }),
      this.roomRepo.count({ where: { status: 'ACTIVE' as RoomEntity['status'], deletedAt: null } }),
      this.roomRepo.count({ where: { status: 'DRAFT' as RoomEntity['status'], deletedAt: null } }),
      this.userRepo.count({ where: { deletedAt: null } }),
      this.bookingRepo
        .createQueryBuilder('booking')
        .where('booking.deleted_at IS NULL')
        .andWhere('booking.created_at >= CURRENT_DATE')
        .andWhere('booking.status IN (:...statuses)', { statuses: [BookingStatus.PENDING, BookingStatus.PAYMENT_PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED] })
        .getCount(),
      this.analyticsService.dashboard(30),
    ]);

    return { totalRooms, activeRooms, draftRooms, totalUsers, bookingsToday, analytics };
  }
}
