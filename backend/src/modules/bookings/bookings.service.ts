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
import { BookingAttributionService } from './booking-attribution.service';
import { RlsContextService } from '../../database/rls-context.service';
import { PriceQuoteService } from '../rooms/price-quote.service';
import { ProviderVerificationStatus } from '../../common/constants/provider.enum';
import { BookingRejectionReason } from '../../common/constants/booking-rejection-reason.enum';
import {
  BOOKING_TRANSITIONS,
  BookingMode,
  BookingStatus,
  REQUEST_BASED_TRANSITIONS,
} from '../../common/constants/booking.enum';
import { PaymentStatus } from '../../common/constants/payment.enum';
import {
  buildWhatsAppDeepLink,
  formatConfirmedBookingWhatsAppText,
} from './whatsapp-deeplink';
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
    private readonly bookingAttributionService: BookingAttributionService,
    private readonly rlsContext: RlsContextService,
    private readonly priceQuoteService: PriceQuoteService,
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
    ownReferralToken?: string | null,
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

    const quote = await this.priceQuoteService.quote(dto.roomId, startAt, endAt);
    if (quote.priceType === 'NOT_AVAILABLE' || quote.amount == null) {
      throw new DomainException(
        'PRICE_NOT_AVAILABLE',
        'This duration has no published price. Request a quote from the provider.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const grossAmount = Math.round(quote.amount);
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
      const result = await this.promoService.validatePromoCode(
        dto.promoCode,
        subtotal,
      );
      promoCodeId = result.promoCodeId;
      promoDiscountAmount = result.discountAmount;
    }
    const totalAmount = Math.max(0, subtotal - promoDiscountAmount);

    // BOOKING_MODE decides new rows; PAYMENTS_ENABLED stays true so
    // REQUEST_BASED still charges after provider accept. Legacy pay-first
    // is BOOKING_MODE=PAYMENT_BASED or AUTO_CONFIRM.
    const configuredMode =
      this.configService.get<
        'REQUEST_BASED' | 'PAYMENT_BASED' | 'AUTO_CONFIRM'
      >('booking.mode') ?? 'REQUEST_BASED';
    const mode =
      configuredMode === 'PAYMENT_BASED' || configuredMode === 'AUTO_CONFIRM'
        ? BookingMode.PAYMENT_BASED
        : BookingMode.REQUEST_BASED;
    const holdMinutes =
      mode === BookingMode.REQUEST_BASED
        ? (this.configService.get<number>('booking.requestBasedHoldMinutes') ??
          120)
        : (this.configService.get<number>('booking.holdMinutes') ?? 15);

    // Feature 5 — validate attribution event ID before opening the transaction.
    // We accept referralSource='spotva_event' as attributionSource.
    // Invalid event UUIDs are silently dropped (never fail the booking itself).
    let resolvedAttributionSource: string | null = dto.referralSource ?? null;
    let resolvedAttributionEventId: string | null = null;
    if (dto.attributionEventId) {
      const eventCount = await this.dataSource.query<{ count: string }[]>(
        `SELECT count(*)::int AS count FROM events WHERE id = $1 AND deleted_at IS NULL`,
        [dto.attributionEventId],
      );
      if (Number(eventCount[0]?.count) > 0) {
        resolvedAttributionEventId = dto.attributionEventId;
        // Default attribution source when coming from an event page
        if (!resolvedAttributionSource)
          resolvedAttributionSource = 'spotva_event';
      }
    }

    const locationRows = await this.dataSource.query(
      `SELECT id, provider_id AS "providerId" FROM location WHERE id = $1`,
      [room.locationId],
    );
    const locationId: string = locationRows[0]?.id ?? room.locationId;
    const providerId: string | null = locationRows[0]?.providerId ?? null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Guest checkout has no JWT; RLS booking_insert requires current_user_id.
      await this.rlsContext.applyToQueryRunner(queryRunner, {
        userId: resolvedCustomerId,
      });
      const now = new Date();
      const booking = queryRunner.manager.create(BookingEntity, {
        customerUserId: resolvedCustomerId,
        status: BookingStatus.PENDING,
        mode,
        currency: quote.currency || room.basePriceCurrency || 'AZN',
        grossAmount: String(grossAmount),
        serviceFeeAmount: String(serviceFeeAmount),
        totalAmount: String(totalAmount),
        purpose: dto.purpose ?? null,
        participantsCount: dto.participants ?? null,
        holdExpiresAt: new Date(now.getTime() + holdMinutes * 60_000),
        attributionSource: resolvedAttributionSource,
        attributionEventId: resolvedAttributionEventId,
        createdAt: now,
        updatedAt: now,
      });
      const savedBooking = await queryRunner.manager.save(booking);

      const item = queryRunner.manager.create(BookingItemEntity, {
        bookingId: savedBooking.id,
        roomId: dto.roomId,
        startAt,
        endAt,
        unitPriceAmount: String(
          quote.quantity > 0
            ? Math.round(grossAmount / quote.quantity)
            : grossAmount,
        ),
        quantity: 1,
        status: BookingStatus.PENDING,
        billingUnit: quote.unitType,
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

      if (providerId) {
        await this.bookingAttributionService.snapshot(queryRunner.manager, {
          bookingId: savedBooking.id,
          locationId,
          providerId,
          partnerAttributionToken: attributionToken,
          ownReferralToken,
          claimedEventId: resolvedAttributionEventId,
          claimedReferralSource: resolvedAttributionSource,
        });
      }

      await queryRunner.commitTransaction();
      savedBooking.items = [item];

      // Task 4 — increment uses_count after successful commit (best-effort;
      // a failure here does not roll back the booking).
      if (promoCodeId) {
        await this.promoService
          .applyPromoToBooking(promoCodeId)
          .catch((err) =>
            this.logger.warn(
              `Failed to increment promo uses_count for ${promoCodeId}: ${err}`,
            ),
          );
      }

      // Task 4 — auto-qualify any pending referral for this customer on their
      // first confirmed booking (best-effort; never throws).
      if (resolvedCustomerId) {
        const pendingReferral = await this.promoService
          .findPendingReferral(resolvedCustomerId)
          .catch(() => null);
        if (pendingReferral) {
          await this.promoService
            .qualifyReferral(pendingReferral.id, savedBooking.id)
            .catch((err) =>
              this.logger.warn(
                `Failed to qualify referral ${pendingReferral.id}: ${err}`,
              ),
            );
        }
      }

      void this.notifyAfterCreate(savedBooking, providerId).catch((err) =>
        this.logger.warn(
          `Create-booking notification failed for ${savedBooking.id}: ${(err as Error).message}`,
        ),
      );

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
    await this.attachCustomerViewFields(booking);
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

    const bookings = await qb.orderBy('b.created_at', 'DESC').getMany();
    for (const booking of bookings) {
      await this.attachCustomerViewFields(booking);
    }
    return bookings;
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
        | 'rejectionReason'
        | 'rejectionNote'
        | 'rejectedAt'
        | 'rejectedByUserId'
        | 'holdExpiresAt'
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
        | 'rejectionReason'
        | 'rejectionNote'
        | 'rejectedAt'
        | 'rejectedByUserId'
        | 'holdExpiresAt'
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
          void this.notifyHoldExpired(booking).catch((err) =>
            this.logger.warn(
              `Hold-expiry notification failed for ${booking.id}: ${(err as Error).message}`,
            ),
          );
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
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((b): b is BookingEntity => !!b);

    const ledgerRows: {
      bookingId: string;
      gross: string;
      fee: string;
      net: string;
    }[] = await this.dataSource.query(
      `SELECT booking_id AS "bookingId",
              COALESCE(SUM(amount) FILTER (WHERE entry_type = 'GROSS'), 0)::text AS gross,
              COALESCE(SUM(amount) FILTER (WHERE entry_type = 'PLATFORM_FEE'), 0)::text AS fee,
              COALESCE(SUM(amount) FILTER (WHERE entry_type = 'PROVIDER_NET'), 0)::text AS net
       FROM ledger_entry
       WHERE booking_id = ANY($1::uuid[])
         AND provider_id = $2
       GROUP BY booking_id`,
      [ids, providerId],
    );
    const ledgerByBooking = new Map(ledgerRows.map((r) => [r.bookingId, r]));
    for (const booking of ordered) {
      const ledger = ledgerByBooking.get(booking.id);
      Object.assign(booking, {
        ledgerGrossAmount: ledger?.gross ?? null,
        ledgerPlatformFeeAmount: ledger?.fee ?? null,
        ledgerProviderNetAmount: ledger?.net ?? null,
      });
    }
    await this.attachProviderViewFields(ordered);
    return ordered;
  }

  /**
   * T4 — PATCH provider/bookings/:bookingId/accept. PENDING -> PAYMENT_PENDING
   * (awaiting_payment). Confirm happens only after payment webhook.
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
    await this.assertSlotStillAvailableForBooking(booking);

    const paymentHoldMinutes =
      this.configService.get<number>('booking.holdMinutes') ?? 15;
    const accepted = await this.transition(
      bookingId,
      BookingStatus.PAYMENT_PENDING,
      undefined,
      {
        holdExpiresAt: new Date(Date.now() + paymentHoldMinutes * 60_000),
      },
    );
    void this.notifyCustomer(accepted, 'accepted', { providerNote }).catch(
      (err) =>
        this.logger.warn(
          `Accept notification failed for ${bookingId}: ${(err as Error).message}`,
        ),
    );
    return accepted;
  }

  /**
   * T4 — PATCH provider/bookings/:bookingId/reject. PENDING -> REJECTED.
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
    void this.notifyCustomer(rejected, 'rejected', {
      rejectionReason: reason,
    }).catch((err) =>
      this.logger.warn(
        `Reject notification failed for ${bookingId}: ${(err as Error).message}`,
      ),
    );
    return rejected;
  }

  async notifyPaymentSucceeded(booking: BookingEntity): Promise<void> {
    await this.notifyParty(booking.customerUserId, {
      templateKey: 'booking.payment_succeeded',
      subject: 'Spotva — Ödəniş uğurlu oldu',
      body: `<p>Ödənişiniz qəbul olundu. Rezervasiyanız (#${booking.id.slice(0, 8).toUpperCase()}) təsdiqləndi.</p>`,
    });
    const ownerId = await this.resolveOwningProviderOwnerUserId(booking.id);
    if (ownerId) {
      await this.notifyParty(ownerId, {
        templateKey: 'booking.customer_paid',
        subject: 'Spotva — Müştəri ödəniş etdi',
        body: `<p>Rezervasiya #${booking.id.slice(0, 8).toUpperCase()} üçün ödəniş tamamlandı.</p>`,
      });
    }
  }

  async notifyBookingCancelled(booking: BookingEntity): Promise<void> {
    const ownerId = await this.resolveOwningProviderOwnerUserId(booking.id);
    if (ownerId) {
      await this.notifyParty(ownerId, {
        templateKey: 'booking.cancelled',
        subject: 'Spotva — Rezervasiya ləğv edildi',
        body: `<p>Rezervasiya #${booking.id.slice(0, 8).toUpperCase()} ləğv edildi.</p>`,
      });
    }
  }

  private async assertSlotStillAvailableForBooking(
    booking: BookingEntity,
  ): Promise<void> {
    const items = booking.items?.length
      ? booking.items
      : await this.bookingItemRepo.find({ where: { bookingId: booking.id } });
    for (const item of items) {
      const [room] = await this.dataSource.query(
        `SELECT status FROM room WHERE id = $1 AND deleted_at IS NULL`,
        [item.roomId],
      );
      if (!room || room.status !== RoomStatus.ACTIVE) {
        throw new SlotUnavailableException({ reason: 'ROOM_NOT_ACTIVE' });
      }
      const [overlap] = await this.dataSource.query(
        `SELECT bi.id
         FROM booking_item bi
         WHERE bi.room_id = $1
           AND bi.booking_id <> $2
           AND bi.status IN ('PENDING','PAYMENT_PENDING','CONFIRMED')
           AND bi.start_at < $4 AND bi.end_at > $3
         LIMIT 1`,
        [item.roomId, booking.id, item.startAt, item.endAt],
      );
      if (overlap) {
        throw new SlotUnavailableException({ reason: 'SLOT_UNAVAILABLE' });
      }
      const [blocked] = await this.dataSource.query(
        `SELECT id FROM blocked_period
         WHERE room_id = $1 AND start_at < $3 AND end_at > $2
         LIMIT 1`,
        [item.roomId, item.startAt, item.endAt],
      );
      if (blocked) {
        throw new SlotUnavailableException({ reason: 'SLOT_UNAVAILABLE' });
      }
    }
  }

  private async attachCustomerViewFields(
    booking: BookingEntity,
  ): Promise<void> {
    const [payment] = await this.dataSource.query(
      `SELECT status FROM payment
       WHERE booking_id = $1
       ORDER BY CASE status WHEN 'CAPTURED' THEN 0 WHEN 'FAILED' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 1`,
      [booking.id],
    );
    const lastPaymentStatus: string | null = payment?.status ?? null;
    Object.assign(booking, { lastPaymentStatus });

    const paid =
      booking.status === BookingStatus.CONFIRMED &&
      lastPaymentStatus === PaymentStatus.CAPTURED;
    if (!paid) {
      Object.assign(booking, { whatsappUrl: null });
      return;
    }

    try {
      const [meta] = await this.dataSource.query(
        `SELECT COALESCE(p.whatsapp_phone, owner.phone) AS "whatsappPhone",
                l.name AS "locationName",
                bi.start_at AS "startAt"
         FROM booking_item bi
         JOIN room r ON r.id = bi.room_id
         JOIN location l ON l.id = r.location_id
         JOIN provider p ON p.id = l.provider_id
         JOIN app_user owner ON owner.id = p.owner_user_id
         WHERE bi.booking_id = $1
         LIMIT 1`,
        [booking.id],
      );
      if (!meta?.whatsappPhone) {
        Object.assign(booking, { whatsappUrl: null });
        return;
      }
      const code = booking.id.slice(0, 8).toUpperCase();
      const text = formatConfirmedBookingWhatsAppText({
        locationName: meta.locationName ?? 'məkan',
        startAt: new Date(meta.startAt),
        bookingCode: code,
      });
      Object.assign(booking, {
        whatsappUrl: buildWhatsAppDeepLink(meta.whatsappPhone, text),
      });
    } catch (err) {
      this.logger.warn(
        `WhatsApp lookup skipped for ${booking.id}: ${(err as Error).message}`,
      );
      Object.assign(booking, { whatsappUrl: null });
    }
  }

  private async attachProviderViewFields(
    bookings: BookingEntity[],
  ): Promise<void> {
    if (bookings.length === 0) return;
    const ids = bookings.map((b) => b.id);
    const rows: {
      bookingId: string;
      displayName: string | null;
      email: string | null;
      phone: string | null;
      roomName: string;
      locationName: string;
    }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (b.id)
              b.id AS "bookingId",
              u.display_name AS "displayName",
              u.email,
              u.phone,
              r.name AS "roomName",
              l.name AS "locationName"
       FROM booking b
       JOIN app_user u ON u.id = b.customer_user_id
       JOIN booking_item bi ON bi.booking_id = b.id
       JOIN room r ON r.id = bi.room_id
       JOIN location l ON l.id = r.location_id
       WHERE b.id = ANY($1::uuid[])
       ORDER BY b.id, bi.start_at`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.bookingId, r]));
    for (const booking of bookings) {
      const row = byId.get(booking.id);
      const showPhone = booking.status !== BookingStatus.PENDING;
      Object.assign(booking, {
        customerDisplayName: row?.displayName ?? null,
        customerEmail: row?.email ?? null,
        customerPhone: showPhone ? (row?.phone ?? null) : null,
        roomName: row?.roomName ?? null,
        locationName: row?.locationName ?? null,
      });
    }
  }

  private async notifyAfterCreate(
    booking: BookingEntity,
    providerId: string | null,
  ): Promise<void> {
    await this.notifyParty(booking.customerUserId, {
      templateKey: 'booking.request_submitted',
      subject: 'Spotva — Sorğunuz göndərildi',
      body: `<p>Rezervasiya sorğunuz (#${booking.id.slice(0, 8).toUpperCase()}) göndərildi. Məkan sahibinin cavabı gözlənilir.</p>`,
    });
    if (!providerId) return;
    const [owner] = await this.dataSource.query(
      `SELECT owner_user_id AS "ownerUserId" FROM provider WHERE id = $1`,
      [providerId],
    );
    if (owner?.ownerUserId) {
      await this.notifyParty(owner.ownerUserId, {
        templateKey: 'booking.new_request',
        subject: 'Spotva — Yeni rezervasiya sorğusu',
        body: `<p>Yeni rezervasiya sorğusu gəldi (#${booking.id.slice(0, 8).toUpperCase()}).</p>`,
      });
    }
  }

  private async notifyHoldExpired(booking: BookingEntity): Promise<void> {
    await this.notifyParty(booking.customerUserId, {
      templateKey: 'booking.hold_expired',
      subject: 'Spotva — Sorğunun vaxtı bitdi',
      body: `<p>Rezervasiya sorğunuzun (#${booking.id.slice(0, 8).toUpperCase()}) gözləmə müddəti bitdi.</p>`,
    });
  }

  private async notifyCustomer(
    booking: BookingEntity,
    kind: 'accepted' | 'rejected',
    extra?: { rejectionReason?: BookingRejectionReason; providerNote?: string },
  ): Promise<void> {
    const noteHtml = extra?.providerNote ? `<p>${extra.providerNote}</p>` : '';
    const reasonHtml = extra?.rejectionReason
      ? `<p>Səbəb: ${extra.rejectionReason}</p>`
      : '';
    if (kind === 'accepted') {
      await this.notifyParty(booking.customerUserId, {
        templateKey: 'booking.accepted',
        subject: 'Spotva — Sorğunuz qəbul edildi',
        body: `<p>Rezervasiya sorğunuz qəbul edildi. Ödənişi tamamlayaraq rezervasiyanı təsdiqləyin. (#${booking.id.slice(0, 8).toUpperCase()})</p>${noteHtml}`,
      });
      await this.notifyParty(booking.customerUserId, {
        templateKey: 'booking.payment_pending',
        subject: 'Spotva — Ödəniş gözlənilir',
        body: `<p>Rezervasiyanızı təsdiqləmək üçün ödənişi tamamlayın.</p>`,
      });
      return;
    }
    await this.notifyParty(booking.customerUserId, {
      templateKey: 'booking.rejected',
      subject: 'Spotva — Sorğu rədd edildi',
      body: `<p>Rezervasiya sorğunuz rədd edildi. (#${booking.id.slice(0, 8).toUpperCase()})</p>${reasonHtml}`,
    });
  }

  private async notifyParty(
    userId: string,
    content: { templateKey: string; subject: string; body: string },
  ): Promise<void> {
    const user = await this.appUserRepo.findOne({ where: { id: userId } });
    if (!user) return;
    const identifier = user.email || user.phone;
    if (!identifier) return;
    const isEmail = NotificationsService.isEmail(identifier);
    await this.notificationsService.send({
      userId: user.id,
      channel: isEmail ? 'EMAIL' : 'SMS',
      templateKey: content.templateKey,
      locale: user.locale || 'az',
      recipient: identifier,
      subject: isEmail ? content.subject : null,
      body: content.body,
      payload: {},
    });
  }

  private async resolveOwningProviderOwnerUserId(
    bookingId: string,
  ): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT p.owner_user_id AS "ownerUserId"
       FROM booking_item bi
       JOIN room r ON r.id = bi.room_id
       JOIN location l ON l.id = r.location_id
       JOIN provider p ON p.id = l.provider_id
       WHERE bi.booking_id = $1
       LIMIT 1`,
      [bookingId],
    );
    return row?.ownerUserId ?? null;
  }
}
