import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { PaymentEntity } from './entities/payment.entity';
import { PaymentTransactionEntity } from './entities/payment-transaction.entity';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import { CommissionService } from './commission.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { EpointPaymentProvider } from './providers/epoint.provider';
import { PayriffPaymentProvider } from './providers/payriff.provider';
import { PaymentProvider } from './providers/payment-provider.interface';
import {
  PaymentAdapterName,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '../../common/constants/payment.enum';
import { BookingsService } from '../bookings/bookings.service';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../../common/constants/booking.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

/** Postgres unique-violation error code — how a duplicate webhook delivery is detected (§10.7/§18.3). */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
    @InjectRepository(AppUserEntity)
    private readonly appUserRepo: Repository<AppUserEntity>,
    private readonly configService: ConfigService,
    private readonly commissionService: CommissionService,
    private readonly bookingsService: BookingsService,
    private readonly notificationsService: NotificationsService,
    private readonly epointProvider: EpointPaymentProvider,
    private readonly payriffProvider: PayriffPaymentProvider,
  ) {}

  private resolveProvider(name: PaymentAdapterName): PaymentProvider {
    if (name === PaymentAdapterName.EPOINT) return this.epointProvider;
    if (name === PaymentAdapterName.PAYRIFF) return this.payriffProvider;
    throw new DomainException(
      'UNSUPPORTED_PROVIDER',
      `Payment provider ${name} is not supported.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * 13_PAYMENT_ARCHITECTURE.md §13.3 step 1 — creates (or reuses) a
   * `Payment` row and asks the adapter for a hosted checkout URL. Does NOT
   * confirm the booking — only the webhook does that (§13.3 step 4).
   */
  async createCheckoutSession(
    callerUserId: string | null,
    dto: CreateCheckoutDto,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    const booking = await this.bookingRepo.findOne({
      where: { id: dto.bookingId },
    });
    if (!booking || booking.deletedAt)
      throw new ResourceNotFoundException('Booking');

    // Same 404-not-403 ownership discipline as BookingsController.getOne —
    // an authenticated caller may only pay for their own booking. A guest
    // (callerUserId === null) is allowed through, since guest checkout has
    // no session to check against; possession of the booking's opaque UUID
    // (only ever returned to the browser that created it) is the gate,
    // exactly as for the public GET /bookings/:bookingId-adjacent flows.
    if (callerUserId && booking.customerUserId !== callerUserId) {
      throw new ResourceNotFoundException('Booking');
    }

    if (
      ![BookingStatus.PENDING, BookingStatus.PAYMENT_PENDING].includes(
        booking.status,
      )
    ) {
      throw new DomainException(
        'BOOKING_NOT_PAYABLE',
        `Booking is ${booking.status} and cannot be paid for.`,
        HttpStatus.CONFLICT,
      );
    }
    if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) {
      throw new DomainException(
        'HOLD_EXPIRED',
        'This booking hold has expired. Please book again.',
        HttpStatus.CONFLICT,
      );
    }

    const provider = this.resolveProvider(dto.provider);

    // Idempotency: reuse an existing not-yet-resolved Payment for this
    // booking+adapter rather than creating a new row every time the
    // customer re-opens the checkout page within the same hold window.
    let payment = await this.paymentRepo.findOne({
      where: {
        bookingId: booking.id,
        providerAdapter: dto.provider,
        status: PaymentStatus.INITIATED,
      },
    });
    const now = new Date();
    if (!payment) {
      payment = this.paymentRepo.create({
        bookingId: booking.id,
        providerAdapter: dto.provider,
        status: PaymentStatus.INITIATED,
        createdAt: now,
        updatedAt: now,
      });
      payment = await this.paymentRepo.save(payment);
    }

    const session = await provider.createCheckoutSession({
      ourReference: payment.id,
      amount: Number(booking.totalAmount),
      currency: booking.currency,
      successUrl: this.configService
        .get<string>('payments.successUrlTemplate')!
        .replace('{bookingId}', booking.id),
      errorUrl: this.configService
        .get<string>('payments.errorUrlTemplate')!
        .replace('{bookingId}', booking.id),
    });

    payment.externalReference = session.externalReference;
    payment.updatedAt = new Date();
    await this.paymentRepo.save(payment);

    if (booking.status === BookingStatus.PENDING) {
      await this.bookingsService.transition(
        booking.id,
        BookingStatus.PAYMENT_PENDING,
      );
    }

    return { checkoutUrl: session.checkoutUrl, paymentId: payment.id };
  }

  /**
   * 13_PAYMENT_ARCHITECTURE.md §13.3 steps 4-5 / 18_SECURITY.md §18.3 —
   * the webhook, never the redirect, is the source of truth. Runs entirely
   * inside one transaction so a crash mid-way can never leave a captured
   * payment with an unconfirmed booking or a missing ledger entry.
   */
  async handleWebhook(
    providerName: PaymentAdapterName,
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): Promise<void> {
    const provider = this.resolveProvider(providerName);

    if (providerName === PaymentAdapterName.PAYRIFF) {
      // §18.3: Payriff's callback signature is unverified/undocumented, so
      // it is NEVER trusted alone — the payload is parsed only to learn
      // which order to look up, then independently re-confirmed.
      const tentativeEvent = provider.parseWebhookEvent(rawBody);
      const confirmed = await (
        provider as PayriffPaymentProvider
      ).confirmViaLookup(tentativeEvent.ourReference);
      if (!confirmed) {
        throw new DomainException(
          'WEBHOOK_UNCONFIRMED',
          'Payriff order could not be confirmed via lookup.',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      const valid = provider.verifyWebhookSignature(rawBody, signatureHeader);
      if (!valid) {
        throw new DomainException(
          'INVALID_SIGNATURE',
          'Webhook signature verification failed.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const event = provider.parseWebhookEvent(rawBody);
    const payment = await this.paymentRepo.findOne({
      where: { id: event.ourReference },
    });
    if (!payment) {
      // Don't throw 500 for an event we simply can't match (e.g. a stray
      // retry after our own retention) — 400 is the documented response
      // for anything that isn't a clean, actionable event (§10.7's OpenAPI contract).
      throw new DomainException(
        'UNKNOWN_PAYMENT',
        'No matching payment for this webhook event.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let bookingIdForNotification: string | null = null;
    try {
      const txType = event.type.startsWith('REFUND')
        ? PaymentTransactionType.REFUND
        : PaymentTransactionType.CHARGE;
      const txStatus =
        event.type === 'CHARGE_SUCCEEDED' || event.type === 'REFUND_SUCCEEDED'
          ? PaymentTransactionStatus.CAPTURED
          : PaymentTransactionStatus.FAILED;

      const transaction = queryRunner.manager.create(PaymentTransactionEntity, {
        paymentId: payment.id,
        type: txType,
        amount: String(event.amount),
        currency: event.currency,
        status: txStatus,
        gatewayResponseCode: event.gatewayResponseCode ?? null,
        externalReference: event.externalReference,
        webhookReceivedAt: new Date(),
        createdAt: new Date(),
      });
      // THE idempotency guard (§10.7/§18.3): external_reference is UNIQUE.
      // A duplicate webhook delivery for an already-processed gateway event
      // hits this constraint and is caught below as a clean no-op.
      await queryRunner.manager.save(transaction);

      if (event.type === 'CHARGE_SUCCEEDED') {
        payment.status = PaymentStatus.CAPTURED;
        payment.updatedAt = new Date();
        await queryRunner.manager.save(payment);

        const bookingBefore = await queryRunner.manager.findOne(BookingEntity, {
          where: { id: payment.bookingId },
        });
        if (!bookingBefore) throw new ResourceNotFoundException('Booking');
        bookingIdForNotification = bookingBefore.id;

        const confirmed = await this.bookingsService.transition(
          payment.bookingId,
          BookingStatus.CONFIRMED,
          queryRunner.manager,
        );

        const [roomRow] = await queryRunner.manager.query(
          `SELECT r.room_type_id, l.provider_id
           FROM booking_item bi JOIN room r ON r.id = bi.room_id JOIN location l ON l.id = r.location_id
           WHERE bi.booking_id = $1 LIMIT 1`,
          [payment.bookingId],
        );
        if (!roomRow) throw new ResourceNotFoundException('Room');

        const ledgerResult =
          await this.commissionService.buildLedgerEntriesForConfirmedBooking(
            queryRunner.manager,
            {
              bookingId: confirmed.id,
              providerId: roomRow.provider_id,
              roomTypeId: roomRow.room_type_id,
              grossAmount: Number(confirmed.totalAmount),
              currency: confirmed.currency,
              paymentAdapter: providerName,
            },
          );
        await queryRunner.manager.save(LedgerEntryEntity, ledgerResult.entries);
      } else if (event.type === 'CHARGE_FAILED') {
        payment.status = PaymentStatus.FAILED;
        payment.updatedAt = new Date();
        await queryRunner.manager.save(payment);
        // Booking deliberately stays PAYMENT_PENDING — §13.1: "a payment can
        // FAIL and be retried while the booking stays PENDING/PAYMENT_PENDING
        // the whole time." The hold-expiry sweep (bookings.tasks.ts) is what
        // eventually expires it if no successful retry occurs in time.
      }
      // REFUND_SUCCEEDED / REFUND_FAILED are handled by RefundsService,
      // which owns the Refund/booking-cancellation state machine; this
      // method's job for those event types is only to have recorded the
      // idempotent PaymentTransaction row above.

      await queryRunner.commitTransaction();
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      if (err?.code === PG_UNIQUE_VIOLATION) {
        this.logger.log(
          `Duplicate webhook delivery for external_reference ${event.externalReference} — no-op.`,
        );
        return;
      }
      throw err;
    } finally {
      await queryRunner.release();
    }

    if (bookingIdForNotification) {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingIdForNotification },
      });
      const customer = booking
        ? await this.appUserRepo.findOne({
            where: { id: booking.customerUserId },
          })
        : null;
      const recipient = customer?.email || customer?.phone;
      if (booking && customer && recipient) {
        // Fire-and-forget from the DB transaction's point of view —
        // NotificationsService never throws (§17.5) and a delivery failure
        // must never undo a financial state change already committed.
        await this.notificationsService.send({
          userId: booking.customerUserId,
          channel: NotificationsService.isEmail(recipient) ? 'EMAIL' : 'SMS',
          templateKey: 'booking.confirmed',
          locale: customer.locale || 'az',
          recipient,
          subject: 'FlexSpace — Rezervasiyanız təsdiqləndi',
          body: `<p>Rezervasiyanız (#${booking.id}) təsdiqləndi.</p>`,
          payload: { bookingId: booking.id },
        });
      }
    }
  }

  /**
   * The caller's own payment history, for `/account/payment-history`. Each
   * row is a `payment` (one per checkout attempt — `createCheckoutSession`
   * creates a new row on every retry, so a booking with a failed-then-
   * retried payment shows both attempts, same as a real gateway statement
   * would), joined through `booking` for ownership and the charged amount,
   * with its `payment_transaction` history and any `refund` against that
   * booking nested in. Raw SQL rather than TypeORM relations — the nested
   * `transactions`/`refunds` arrays are cheaper as one query with
   * `json_agg` than N+1 relation loads, same reasoning as
   * `ReviewsService.listFlaggedForAdmin`'s own raw-query use elsewhere in
   * this codebase.
   */
  async listForCustomer(customerUserId: string): Promise<
    {
      id: string;
      bookingId: string;
      providerAdapter: PaymentAdapterName;
      status: PaymentStatus;
      bookingTotalAmount: string;
      bookingCurrency: string;
      bookingStatus: BookingStatus;
      /** The booking's first `booking_item.room_id`, same "one room for
       * display purposes" simplification `ReviewsService.create` already
       * uses — `null` for a multi-room booking with no items row found
       * (shouldn't happen for a real booking, but the frontend's existing
       * `roomId ? roomsById[roomId] : null` fallback already handles it). */
      roomId: string | null;
      createdAt: Date;
      transactions: {
        id: string;
        type: PaymentTransactionType;
        amount: string;
        currency: string;
        status: PaymentTransactionStatus;
        createdAt: Date;
      }[];
      refunds: {
        id: string;
        amount: string;
        currency: string;
        status: string;
        reason: string | null;
        createdAt: Date;
      }[];
    }[]
  > {
    return this.dataSource.query(
      `SELECT
         p.id,
         p.booking_id AS "bookingId",
         p.provider_adapter AS "providerAdapter",
         p.status,
         p.created_at AS "createdAt",
         b.total_amount AS "bookingTotalAmount",
         b.currency AS "bookingCurrency",
         b.status AS "bookingStatus",
         (SELECT bi.room_id FROM booking_item bi WHERE bi.booking_id = p.booking_id LIMIT 1) AS "roomId",
         COALESCE(
           (SELECT json_agg(json_build_object(
              'id', t.id, 'type', t.type, 'amount', t.amount,
              'currency', t.currency, 'status', t.status,
              'createdAt', t.created_at
            ) ORDER BY t.created_at ASC)
            FROM payment_transaction t WHERE t.payment_id = p.id),
           '[]'
         ) AS transactions,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'id', r.id, 'amount', r.amount, 'currency', r.currency,
              'status', r.status, 'reason', r.reason, 'createdAt', r.created_at
            ) ORDER BY r.created_at ASC)
            FROM refund r WHERE r.booking_id = p.booking_id),
           '[]'
         ) AS refunds
       FROM payment p
       JOIN booking b ON b.id = p.booking_id
       WHERE b.customer_user_id = $1
       ORDER BY p.created_at DESC`,
      [customerUserId],
    );
  }
}
