import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { BookingEntity } from './entities/booking.entity';
import { BookingItemEntity } from './entities/booking-item.entity';
import { RoomEntity } from '../rooms/entities/room.entity';
import { AvailabilityService } from './availability.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AuthService } from '../auth/auth.service';
import { ReferralTrackingService } from '../partners/referral-tracking.service';
import {
  BOOKING_TRANSITIONS,
  BookingStatus,
} from '../../common/constants/booking.enum';
import { RoomStatus } from '../../common/constants/provider.enum';
import {
  DomainException,
  InvalidBookingStateTransitionException,
  ResourceNotFoundException,
  SlotUnavailableException,
} from '../../common/exceptions/domain.exception';

/** Postgres error code for an EXCLUDE-constraint violation (10_DATABASE_SCHEMA.md §10.4). */
const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
    @InjectRepository(BookingItemEntity)
    private readonly bookingItemRepo: Repository<BookingItemEntity>,
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
    private readonly availabilityService: AvailabilityService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly referralTrackingService: ReferralTrackingService,
  ) {}

  /**
   * 12_RESERVATION_ENGINE.md §12.2 — the ONLY trusted guarantee against
   * double-booking is the DB exclusion constraint. This method does a live
   * availability pre-check first (fast, good UX in the non-racing case),
   * then attempts the insert inside a transaction and translates a
   * constraint violation into a clean 409, exactly as specified.
   */
  async create(
    customerUserId: string | null,
    dto: CreateBookingDto,
    attributionToken?: string | null,
  ): Promise<BookingEntity> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (!(endAt > startAt)) {
      throw new DomainException(
        'INVALID_RANGE',
        'endAt must be after startAt.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const room = await this.roomRepo.findOne({ where: { id: dto.roomId } });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');
    if (room.status !== RoomStatus.ACTIVE) {
      throw new DomainException(
        'ROOM_NOT_ACTIVE',
        'This room is not currently bookable.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Resolve the customer: authenticated caller, or guest checkout
    // provisioning an account the same way OTP login does (05_USER_FLOWS.md
    // §5.2 "account created automatically when needed" — no forced signup step).
    let resolvedCustomerId = customerUserId;
    if (!resolvedCustomerId) {
      const identifier = dto.customer?.email || dto.customer?.phone;
      if (!identifier) {
        throw new DomainException(
          'CUSTOMER_REQUIRED',
          'customer.email or customer.phone is required for guest checkout.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const user = await this.authService.ensureUser(identifier);
      resolvedCustomerId = user.id;
    }

    // Fast pre-check (not the guarantee, just good UX — §12.2).
    const availability = await this.availabilityService.isRangeAvailable(
      dto.roomId,
      startAt,
      endAt,
    );
    if (!availability.ok) {
      throw new SlotUnavailableException({ reason: availability.reason });
    }

    const durationHours = (endAt.getTime() - startAt.getTime()) / 3_600_000;
    const grossAmount = Math.round(
      Number(room.basePriceAmount) * durationHours,
    );
    const serviceFeePercentage =
      this.configService.get<number>('booking.serviceFeePercentage') ?? 0;
    const serviceFeeAmount = Math.round(
      grossAmount * (serviceFeePercentage / 100),
    );
    const totalAmount = grossAmount + serviceFeeAmount;
    const holdMinutes =
      this.configService.get<number>('booking.holdMinutes') ?? 15;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const now = new Date();
      const booking = queryRunner.manager.create(BookingEntity, {
        customerUserId: resolvedCustomerId,
        status: BookingStatus.PENDING,
        currency: room.basePriceCurrency,
        grossAmount: String(grossAmount),
        serviceFeeAmount: String(serviceFeeAmount),
        totalAmount: String(totalAmount),
        purpose: dto.purpose ?? null,
        participantsCount: dto.participants ?? null,
        holdExpiresAt: new Date(now.getTime() + holdMinutes * 60_000),
        createdAt: now,
        updatedAt: now,
      });
      const savedBooking = await queryRunner.manager.save(booking);

      const item = queryRunner.manager.create(BookingItemEntity, {
        bookingId: savedBooking.id,
        roomId: dto.roomId,
        startAt,
        endAt,
        unitPriceAmount: room.basePriceAmount,
        quantity: 1,
        status: BookingStatus.PENDING,
      });
      // THE critical insert — this is what the no_overlapping_bookings
      // EXCLUDE constraint guards. If a concurrent request already holds an
      // overlapping active slot on this room, Postgres rejects this insert
      // with a 23P01 exclusion_violation, caught below.
      await queryRunner.manager.save(item);

      // 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 step 4 — inside the SAME
      // transaction as the booking/item insert, so a crash between the two
      // can never leave a should-have-been-attributed booking without its
      // attribution row. Every failure mode inside attributeBooking is
      // itself a silent no-op (no token, expired click, ended campaign,
      // suspended partner, duplicate) — it never throws, so it can never
      // fail booking creation.
      await this.referralTrackingService.attributeBooking(
        queryRunner.manager,
        savedBooking.id,
        attributionToken,
      );

      await queryRunner.commitTransaction();
      savedBooking.items = [item];
      return savedBooking;
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      if (err?.code === PG_EXCLUSION_VIOLATION) {
        this.logger.log(
          `Exclusion constraint rejected overlapping booking for room ${dto.roomId} — clean 409.`,
        );
        throw new SlotUnavailableException({ roomId: dto.roomId });
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findById(id: string): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!booking || booking.deletedAt)
      throw new ResourceNotFoundException('Booking');
    return booking;
  }

  async listForCustomer(
    customerUserId: string,
    status?: 'upcoming' | 'past' | 'cancelled',
  ): Promise<BookingEntity[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.items', 'items')
      .where('b.customer_user_id = :customerUserId', { customerUserId })
      .andWhere('b.deleted_at IS NULL');

    if (status === 'cancelled') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          BookingStatus.CANCELLED,
          BookingStatus.REFUNDED,
          BookingStatus.EXPIRED,
        ],
      });
    } else if (status === 'upcoming') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [
          BookingStatus.PENDING,
          BookingStatus.PAYMENT_PENDING,
          BookingStatus.CONFIRMED,
        ],
      });
    } else if (status === 'past') {
      qb.andWhere('b.status IN (:...statuses)', {
        statuses: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW],
      });
    }

    return qb.orderBy('b.created_at', 'DESC').getMany();
  }

  /**
   * Explicit state-machine transition (12_RESERVATION_ENGINE.md §12.3) — an
   * edge not in BOOKING_TRANSITIONS throws rather than silently applying.
   * Keeps booking_item.status in lockstep, since that denormalized copy is
   * what the exclusion constraint's WHERE clause actually reads.
   *
   * Accepts an optional `manager` so a caller that needs this transition to
   * be atomic with other writes — PaymentsService confirming a booking in
   * the SAME transaction as capturing the payment and writing ledger
   * entries, so a crash between the two can never leave a charged customer
   * with a still-PENDING booking or vice versa — can pass its own
   * QueryRunner's EntityManager instead of this service's own repositories.
   */
  async transition(
    bookingId: string,
    to: BookingStatus,
    manager?: EntityManager,
  ): Promise<BookingEntity> {
    const bookingRepo = manager
      ? manager.getRepository(BookingEntity)
      : this.bookingRepo;
    const bookingItemRepo = manager
      ? manager.getRepository(BookingItemEntity)
      : this.bookingItemRepo;

    const booking = await bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['items'],
    });
    if (!booking || booking.deletedAt)
      throw new ResourceNotFoundException('Booking');

    const allowed = BOOKING_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidBookingStateTransitionException(booking.status, to);
    }

    booking.status = to;
    booking.updatedAt = new Date();
    if (to === BookingStatus.CONFIRMED) booking.confirmedAt = new Date();
    if (to === BookingStatus.CANCELLED) booking.cancelledAt = new Date();
    if (to === BookingStatus.COMPLETED) booking.completedAt = new Date();

    await bookingItemRepo.update({ bookingId }, { status: to });
    return bookingRepo.save(booking);
  }

  /** 12_RESERVATION_ENGINE.md §12.4 — hold-expiry sweep, invoked by the scheduled task in bookings.tasks.ts. */
  async expireStaleHolds(): Promise<number> {
    const now = new Date();
    const stale = await this.bookingRepo.find({
      where: [
        { status: BookingStatus.PENDING },
        { status: BookingStatus.PAYMENT_PENDING },
      ],
    });
    let expired = 0;
    for (const booking of stale) {
      if (booking.holdExpiresAt && booking.holdExpiresAt < now) {
        await this.transition(booking.id, BookingStatus.EXPIRED);
        expired += 1;
      }
    }
    if (expired > 0)
      this.logger.log(
        `Hold-expiry sweep: expired ${expired} stale booking(s).`,
      );
    return expired;
  }
}
