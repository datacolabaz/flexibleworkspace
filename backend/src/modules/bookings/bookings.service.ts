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
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProvidersService } from '../providers/providers.service';
import { PromoService } from '../promo/promo.service';
import { ProviderVerificationStatus } from '../../common/constants/provider.enum';
import { BookingRejectionReason } from '../../common/constants/booking-rejection-reason.enum';
import {
  BOOKING_TRANSITIONS,
  BookingMode,
  BookingStatus,
  REQUEST_BASED_TRANSITIONS,
} from '../../common/constants/booking.enum';
import { RoomStatus } from '../../common/constants/provider.enum';
import {
  BookingModeNotSupportedException,
  DomainException,
  InvalidBookingStateTransitionException,
  ProviderSuspendedException,
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
    @InjectRepository(AppUserEntity)
    private readonly appUserRepo: Repository<AppUserEntity>,
    private readonly availabilityService: AvailabilityService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly referralTrackingService: ReferralTrackingService,
    private readonly notificationsService: NotificationsService,
    private readonly providersService: ProvidersService,
    private readonly promoService: PromoService,
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
    const subtotal = grossAmount + serviceFeeAmount;

    // Task 4 — validate promo code before opening the DB transaction.
    // Discount reduces the final totalAmount; gross and service fee are unchanged.
    let promoCodeId: string | null = null;
    let promoDiscountAmount = 0;
    if (dto.promoCode) {
      const result = await this.promoService.validatePromoCode(dto.promoCode, subtotal);
      promoCodeId = result.promoCodeId;
      promoDiscountAmount = result.discountAmount;
    }
    const totalAmount = Math.max(0, subtotal - promoDiscountAmount);

    // T4 — which mode this NEW booking gets, and thus which hold window it
    // gets (see configuration.ts's `booking.paymentsEnabled` doc comment for
    // why this must be set explicitly rather than left to the DB column
    // default). Never reinterprets an existing booking's mode.
    const paymentsEnabled =
      this.configService.get<boolean>('booking.paymentsEnabled') ?? true;
    const mode = paymentsEnabled
      ? BookingMode.PAYMENT_BASED
      : BookingMode.REQUEST_BASED;
    const holdMinutes =
      mode === BookingMode.REQUEST_BASED
        ? (this.configService.get<number>('booking.requestBasedHoldMinutes') ??
          120)
        : (this.configService.get<number>('booking.holdMinutes') ?? 15);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const now = new Date();
      const booking = queryRunner.manager.create(BookingEntity, {
        customerUserId: resolvedCustomerId,
        status: BookingStatus.PENDING,
        mode,
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

      // Task 4 — increment uses_count after successful commit (best-effort;
      // a failure here does not roll back the booking).
      if (promoCodeId) {
        await this.promoService.applyPromoToBooking(promoCodeId).catch((err) =>
          this.logger.warn(`Failed to increment promo uses_count for ${promoCodeId}: ${err}`),
        );
      }

      // Task 4 — auto-qualify any pending referral for this customer on their
      // first confirmed booking (best-effort; never throws).
      if (resolvedCustomerId) {
        const pendingReferral = await this.promoService.findPendingReferral(resolvedCustomerId).catch(() => null);
        if (pendingReferral) {
          await this.promoService.qualifyReferral(pendingReferral.id, savedBooking.id).catch((err) =>
            this.logger.warn(`Failed to qualify referral ${pendingReferral.id}: ${err}`),
          );
        }
      }

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
          // T4 — REQUEST_BASED's own terminal "didn't happen" statuses
          // belong in the same customer-facing bucket as the existing ones.
          BookingStatus.REJECTED,
          BookingStatus.CANCELLED_BY_USER,
          BookingStatus.CANCELLED_BY_PROVIDER,
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
   * edge not in the booking's own transition table throws rather than
   * silently applying. Keeps booking_item.status in lockstep, since that
   * denormalized copy is what the exclusion constraint's WHERE clause
   * actually reads.
   *
   * Which table governs is `booking.mode`-driven (T2): PAYMENT_BASED
   * bookings — the existing flow, untouched — validate against
   * BOOKING_TRANSITIONS exactly as before; REQUEST_BASED bookings validate
   * against the separate REQUEST_BASED_TRANSITIONS state machine. The two
   * tables never merge, so a PAYMENT_BASED booking can never reach a
   * REQUEST_BASED-only status (REJECTED, CANCELLED_BY_USER,
   * CANCELLED_BY_PROVIDER) or vice versa.
   *
   * Accepts an optional `manager` so a caller that needs this transition to
   * be atomic with other writes — PaymentsService confirming a booking in
   * the SAME transaction as capturing the payment and writing ledger
   * entries, so a crash between the two can never leave a charged customer
   * with a still-PENDING booking or vice versa — can pass its own
   * QueryRunner's EntityManager instead of this service's own repositories.
   *
   * T4 — locks the booking row (`pessimistic_write`) before reading its
   * current status, so two concurrent callers racing on the same booking
   * (provider accept vs. provider reject; provider accept vs. the
   * hold-expiry cron) can never both see the pre-transition status and both
   * "win" — the second to acquire the lock re-reads the ALREADY-transitioned
   * status and correctly hits InvalidBookingStateTransitionException instead
   * of silently overwriting the first caller's result. A plain
   * `repo.findOne({ relations: [...] })` cannot take a lock together with a
   * joined relation (TypeORM/Postgres restriction), so this loads the
   * booking row alone via QueryBuilder; `items` is never read inside this
   * method (the booking_item update below goes through bookingItemRepo
   * directly), so not loading it here costs nothing.
   *
   * `extra` lets a caller (rejectBooking) set additional columns in the
   * same locked read-modify-write instead of a separate, unlocked update.
   */
  async transition(
    bookingId: string,
    to: BookingStatus,
    manager?: EntityManager,
    extra?: Partial<
      Pick<
        BookingEntity,
        'rejectionReason' | 'rejectionNote' | 'rejectedAt' | 'rejectedByUserId'
      >
    >,
  ): Promise<BookingEntity> {
    // pessimistic_write requires an open transaction (Postgres: SELECT ...
    // FOR UPDATE is only valid inside one). A caller that already has one
    // (PaymentsService's webhook handler) passes its own manager and this
    // transition becomes part of THAT transaction; a caller with no
    // transaction of its own (acceptBooking, rejectBooking, the hold-expiry
    // cron) gets one opened here, scoped to just this transition.
    if (manager) {
      return this.transitionWithManager(manager, bookingId, to, extra);
    }
    return this.dataSource.transaction((txManager) =>
      this.transitionWithManager(txManager, bookingId, to, extra),
    );
  }

  private async transitionWithManager(
    manager: EntityManager,
    bookingId: string,
    to: BookingStatus,
    extra?: Partial<
      Pick<
        BookingEntity,
        'rejectionReason' | 'rejectionNote' | 'rejectedAt' | 'rejectedByUserId'
      >
    >,
  ): Promise<BookingEntity> {
    const bookingRepo = manager.getRepository(BookingEntity);
    const bookingItemRepo = manager.getRepository(BookingItemEntity);

    const booking = await bookingRepo
      .createQueryBuilder('b')
      .setLock('pessimistic_write')
      .where('b.id = :id', { id: bookingId })
      .getOne();
    if (!booking || booking.deletedAt)
      throw new ResourceNotFoundException('Booking');

    const transitions =
      booking.mode === BookingMode.REQUEST_BASED
        ? REQUEST_BASED_TRANSITIONS
        : BOOKING_TRANSITIONS;
    const allowed = transitions[booking.status] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidBookingStateTransitionException(booking.status, to);
    }

    booking.status = to;
    booking.updatedAt = new Date();
    if (to === BookingStatus.CONFIRMED) booking.confirmedAt = new Date();
    if (
      to === BookingStatus.CANCELLED ||
      to === BookingStatus.CANCELLED_BY_USER ||
      to === BookingStatus.CANCELLED_BY_PROVIDER
    )
      booking.cancelledAt = new Date();
    if (to === BookingStatus.COMPLETED) booking.completedAt = new Date();
    if (extra) Object.assign(booking, extra);

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
        // T4 — a booking a provider just accepted/rejected in the same
        // instant this sweep reads it (now stale, PENDING no longer) throws
        // InvalidBookingStateTransitionException from transition()'s lock-
        // then-recheck above. That one lost race must never abort the sweep
        // for every OTHER genuinely-stale booking in this batch.
        try {
          await this.transition(booking.id, BookingStatus.EXPIRED);
          expired += 1;
        } catch (err) {
          if (err instanceof InvalidBookingStateTransitionException) {
            this.logger.log(
              `Hold-expiry sweep: booking ${booking.id} already left its stale status (provider action won the race) — skipping.`,
            );
          } else {
            throw err;
          }
        }
      }
    }
    if (expired > 0)
      this.logger.log(
        `Hold-expiry sweep: expired ${expired} stale booking(s).`,
      );
    return expired;
  }

  /**
   * T4 — resolves the provider that owns a booking, via its (first)
   * booking_item -> room -> location -> provider chain. Raw SQL, matching
   * this codebase's established idiom for cross-entity joins the TypeORM
   * relation graph doesn't model directly (PaymentsService.listForCustomer,
   * the webhook handler's room/location lookup).
   */
  private async resolveOwningProviderId(
    bookingId: string,
  ): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT l.provider_id AS "providerId"
       FROM booking_item bi
       JOIN room r ON r.id = bi.room_id
       JOIN location l ON l.id = r.location_id
       WHERE bi.booking_id = $1
       LIMIT 1`,
      [bookingId],
    );
    return row?.providerId ?? null;
  }

  /**
   * T4 — the shared authorization + precondition gate for both
   * acceptBooking and rejectBooking: the caller's provider must actually
   * own the room the booking is for (never trust a caller-supplied
   * providerId), must be VERIFIED (not PENDING/REJECTED/SUSPENDED — a
   * suspended provider must not be able to act on bookings while under
   * review), and the booking must be a PENDING REQUEST_BASED booking (an
   * accept/reject on a PAYMENT_BASED booking is a mode error, not an
   * authorization error, so it gets its own distinct exception).
   */
  private async assertProviderCanActOnBooking(
    callerProviderId: string,
    booking: BookingEntity,
    action: 'accept' | 'reject',
  ): Promise<void> {
    const owningProviderId = await this.resolveOwningProviderId(booking.id);
    if (!owningProviderId || owningProviderId !== callerProviderId) {
      throw new ResourceNotFoundException('Booking');
    }

    const provider = await this.providersService.findById(callerProviderId);
    if (provider.verificationStatus !== ProviderVerificationStatus.VERIFIED) {
      throw new ProviderSuspendedException();
    }

    if (booking.mode !== BookingMode.REQUEST_BASED) {
      throw new BookingModeNotSupportedException(action);
    }
  }

  /**
   * T4 — provider-facing bookings list (PATCH provider/bookings/:id/accept
   * and .../reject act on rows surfaced here). Raw SQL join (see
   * resolveOwningProviderId's doc comment for why), then hydrate full
   * BookingEntity rows via the repo so the response shape matches every
   * other booking-list endpoint. Order from the raw query is preserved
   * through the hydration step since `bookingRepo.find({ where: { id: In(ids) } })`
   * does not itself guarantee row order.
   */
  async listForProvider(
    providerId: string,
    filters: { status?: BookingStatus; roomId?: string; locationId?: string },
  ): Promise<BookingEntity[]> {
    const conditions: string[] = ['l.provider_id = $1'];
    const params: unknown[] = [providerId];

    if (filters.roomId) {
      params.push(filters.roomId);
      conditions.push(`r.id = $${params.length}`);
    }
    if (filters.locationId) {
      params.push(filters.locationId);
      conditions.push(`l.id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`b.status = $${params.length}`);
    }

    const rows = await this.dataSource.query(
      `SELECT DISTINCT b.id, b.created_at AS "createdAt"
       FROM booking b
       JOIN booking_item bi ON bi.booking_id = b.id
       JOIN room r ON r.id = bi.room_id
       JOIN location l ON l.id = r.location_id
       WHERE b.deleted_at IS NULL AND ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC`,
      params,
    );
    if (rows.length === 0) return [];

    const ids: string[] = rows.map((r: { id: string }) => r.id);
    const bookings = await this.bookingRepo.find({
      where: ids.map((id) => ({ id })),
      relations: ['items'],
    });
    const byId = new Map(bookings.map((b) => [b.id, b]));
    return ids.map((id) => byId.get(id)).filter((b): b is BookingEntity => !!b);
  }

  /**
   * T4 — fire-and-forget customer notification for an accept/reject
   * decision (17_NOTIFICATION_ARCHITECTURE.md §17.5: never allowed to fail
   * the business operation that triggered it — NotificationsService.send()
   * itself already never throws, this is just the call-site wiring). Sent
   * AFTER the transition's own DB write has already committed.
   */
  private async notifyCustomer(
    booking: BookingEntity,
    kind: 'accepted' | 'rejected',
    extra?: { rejectionReason?: BookingRejectionReason; providerNote?: string },
  ): Promise<void> {
    const customer = await this.appUserRepo.findOne({
      where: { id: booking.customerUserId },
    });
    if (!customer) return;
    const identifier = customer.email || customer.phone;
    if (!identifier) return;

    const isEmail = NotificationsService.isEmail(identifier);
    const subject =
      kind === 'accepted'
        ? 'FlexSpace — Rezervasiya təsdiqləndi'
        : 'FlexSpace — Rezervasiya rədd edildi';
    const noteHtml = extra?.providerNote ? `<p>${extra.providerNote}</p>` : '';
    const reasonHtml = extra?.rejectionReason
      ? `<p>Səbəb: ${extra.rejectionReason}</p>`
      : '';
    const body =
      kind === 'accepted'
        ? `<p>Rezervasiyanız (${booking.id}) provider tərəfindən təsdiqləndi.</p>${noteHtml}`
        : `<p>Rezervasiyanız (${booking.id}) provider tərəfindən rədd edildi.</p>${reasonHtml}`;

    await this.notificationsService.send({
      userId: customer.id,
      channel: isEmail ? 'EMAIL' : 'SMS',
      templateKey:
        kind === 'accepted' ? 'booking.accepted' : 'booking.rejected',
      locale: customer.locale || 'az',
      recipient: identifier,
      subject: isEmail ? subject : null,
      body,
      payload: { bookingId: booking.id },
    });
  }

  /**
   * T4 — PATCH provider/bookings/:bookingId/accept. PENDING -> CONFIRMED,
   * REQUEST_BASED only (assertProviderCanActOnBooking / transition()'s own
   * transition-table check both enforce this).
   */
  async acceptBooking(
    callerProviderId: string,
    bookingId: string,
    providerNote?: string,
  ): Promise<BookingEntity> {
    const booking = await this.findById(bookingId);
    await this.assertProviderCanActOnBooking(
      callerProviderId,
      booking,
      'accept',
    );

    const confirmed = await this.transition(bookingId, BookingStatus.CONFIRMED);
    await this.notifyCustomer(confirmed, 'accepted', { providerNote });
    return confirmed;
  }

  /**
   * T4 — PATCH provider/bookings/:bookingId/reject. PENDING -> REJECTED,
   * REQUEST_BASED only, recording who rejected it and why (rejection_reason/
   * rejection_note/rejected_at/rejected_by_user_id — transition()'s `extra`
   * param sets these atomically with the status change, under the same lock).
   */
  async rejectBooking(
    callerProviderId: string,
    callerUserId: string,
    bookingId: string,
    reason: BookingRejectionReason,
    note?: string,
  ): Promise<BookingEntity> {
    const booking = await this.findById(bookingId);
    await this.assertProviderCanActOnBooking(
      callerProviderId,
      booking,
      'reject',
    );

    const rejected = await this.transition(
      bookingId,
      BookingStatus.REJECTED,
      undefined,
      {
        rejectionReason: reason,
        rejectionNote: note ?? null,
        rejectedAt: new Date(),
        rejectedByUserId: callerUserId,
      },
    );
    await this.notifyCustomer(rejected, 'rejected', {
      rejectionReason: reason,
    });
    return rejected;
  }
}
