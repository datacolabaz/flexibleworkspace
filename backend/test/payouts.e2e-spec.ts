import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { PayoutsModule } from '../src/modules/payouts/payouts.module';
import { PayoutsService } from '../src/modules/payouts/payouts.service';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { PayoutStatus } from '../src/common/constants/payout.enum';
import { DomainException } from '../src/common/exceptions/domain.exception';

/**
 * Exercises the full payout lifecycle (14_PAYOUT_LEDGER.md) against the
 * REAL database, same discipline as payments.e2e-spec.ts: batching math,
 * the cancellation-window eligibility gate, and state-machine transitions
 * all live in SQL/transactions a mocked repository can't meaningfully
 * verify.
 *
 * Bookings can't be created with a past startAt via BookingsService (the
 * advance-booking-window check rejects it), so bookings are created with a
 * near-future start and confirmed normally, then their booking_item.start_at
 * is moved into the past via raw SQL to simulate "the meeting already
 * happened" for the eligibility gate — spaced far enough apart that the
 * `no_overlapping_bookings` EXCLUDE constraint (re-checked on this UPDATE
 * too, since it's enforced at the DB level on every write) never collides.
 *
 * Uses the PAYRIFF dev-simulation path to reach CONFIRMED bookings with real
 * ledger entries, exactly like payments.e2e-spec.ts.
 */
const TestAppModule = Test.createTestingModule({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('db.host'),
        port: config.get('db.port'),
        username: config.get('db.username'),
        password: config.get('db.password'),
        database: config.get('db.database'),
        ssl: config.get('db.ssl'),
        autoLoadEntities: true,
        synchronize: false,
        logging: ['error'],
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.accessSecret'),
        signOptions: { expiresIn: config.get('jwt.accessExpiresIn') },
      }),
    }),
    BookingsModule,
    PaymentsModule,
    PayoutsModule,
  ],
});

describe('Payouts (real Postgres — batching, eligibility, lifecycle, clawback)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let paymentsService: PaymentsService;
  let bookingsService: BookingsService;
  let payoutsService: PayoutsService;

  const suffix = `payouts-test-${Date.now()}`;
  let ownerUserId: string;
  let providerId: string;
  let locationId: string;
  let roomId: string;
  let financeAdminUserId: string;
  const roomBasePriceAmount = 5000; // 50.00 AZN/hour, minor units

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    paymentsService = app.get(PaymentsService);
    bookingsService = app.get(BookingsService);
    payoutsService = app.get(PayoutsService);

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    ownerUserId = user.id;

    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Payouts Test MMC', 'Payouts Test', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, ownerUserId],
    );
    providerId = provider.id;

    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Payouts Test Location', 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [providerId],
    );
    locationId = location.id;

    const [roomType] = await dataSource.query(
      `SELECT id FROM room_type WHERE translation_key = 'room_type.meeting_room'`,
    );
    const [room] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_max, base_price_amount, base_price_currency, status,
                          min_booking_minutes, max_booking_minutes, advance_booking_min_hours, advance_booking_max_days, buffer_minutes,
                          created_at, updated_at)
       VALUES ($1, $2, 'Payouts Test Room', $3, 10, $4, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `${suffix}-room`, roomBasePriceAmount],
    );
    roomId = room.id;

    for (let day = 0; day <= 6; day++) {
      await dataSource.query(
        `INSERT INTO availability_rule (room_id, recurrence_type, day_of_week, start_time, end_time, is_open, created_at)
         VALUES ($1, 'WEEKLY', $2, '00:00', '23:59', true, now())`,
        [roomId, day],
      );
    }

    const [financeAdmin] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-finance-admin@example.com`],
    );
    financeAdminUserId = financeAdmin.id;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ledger_entry WHERE provider_id = $1`, [
      providerId,
    ]);
    await dataSource.query(`DELETE FROM payout WHERE provider_id = $1`, [
      providerId,
    ]);
    await dataSource.query(
      `DELETE FROM refund WHERE booking_id IN (SELECT id FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1))`,
      [`${suffix}%`],
    );
    await dataSource.query(
      `DELETE FROM payment_transaction WHERE payment_id IN (SELECT id FROM payment WHERE booking_id IN (SELECT id FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1)))`,
      [`${suffix}%`],
    );
    await dataSource.query(
      `DELETE FROM payment WHERE booking_id IN (SELECT id FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1))`,
      [`${suffix}%`],
    );
    await dataSource.query(`DELETE FROM booking_item WHERE room_id = $1`, [
      roomId,
    ]);
    await dataSource.query(
      `DELETE FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1)`,
      [`${suffix}%`],
    );
    await dataSource.query(`DELETE FROM availability_rule WHERE room_id = $1`, [
      roomId,
    ]);
    await dataSource.query(`DELETE FROM room WHERE id = $1`, [roomId]);
    await dataSource.query(`DELETE FROM location WHERE id = $1`, [locationId]);
    await dataSource.query(`DELETE FROM provider WHERE id = $1`, [providerId]);
    await dataSource.query(
      `DELETE FROM notification WHERE user_id IN (SELECT id FROM app_user WHERE email LIKE $1)`,
      [`${suffix}%`],
    );
    await dataSource.query(
      `DELETE FROM audit_log WHERE actor_user_id IN (SELECT id FROM app_user WHERE email LIKE $1)`,
      [`${suffix}%`],
    );
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  let bookingCounter = 0;

  /**
   * Anchors every slot at 08:00 UTC on a given day offset (comfortably
   * midday in Asia/Baku, UTC+4) rather than raw "now + N hours" — the
   * latter can straddle the room's local-calendar-day boundary
   * (AvailabilityService.isRangeAvailable's documented V1 simplification:
   * "a requested range may span at most the local calendar date it starts
   * in"), which isn't an overlap at all but still correctly gets rejected
   * as SLOT_UNAVAILABLE. Each test gets its own dayOffset (via
   * bookingCounter), spaced days apart, so slots never collide regardless
   * of exact wall-clock "now".
   */
  function daySlot(dayOffset: number): { startAt: string; endAt: string } {
    const base = new Date();
    base.setUTCHours(8, 0, 0, 0);
    const startAt = new Date(base.getTime() + dayOffset * 86_400_000);
    const endAt = new Date(startAt.getTime() + 2 * 3_600_000);
    return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
  }

  /** Creates + PAYRIFF-confirms a booking at a near-future slot (passes the advance-booking check), then backdates booking_item.start_at so each test's booking lands in its own, non-overlapping window of the past. */
  async function makeConfirmedBookingInThePast(
    pastDaysAgo: number,
  ): Promise<{ bookingId: string; providerNetAmount: number }> {
    bookingCounter += 1;
    const { startAt, endAt } = daySlot(30 + bookingCounter * 5); // far enough out, and spaced, to never overlap another test's slot
    const booking = await bookingsService.create(null, {
      roomId,
      startAt,
      endAt,
      customer: { email: `${suffix}-guest-${bookingCounter}@example.com` },
    } as any);

    const session = await paymentsService.createCheckoutSession(null, {
      bookingId: booking.id,
      provider: 'PAYRIFF' as any,
    });
    const totalAmount = Number(booking.totalAmount);
    await paymentsService.handleWebhook(
      'PAYRIFF' as any,
      Buffer.from(
        JSON.stringify({
          status: 'approved',
          orderId: session.paymentId,
          transactionId: `payriff-ext-${bookingCounter}`,
          amount: totalAmount / 100,
          currency: 'AZN',
        }),
      ),
      undefined,
    );

    // Move the booking into the past, at a slot far from every other test
    // booking's (real or backdated) window, to avoid the EXCLUDE constraint.
    const { startAt: newStartIso, endAt: newEndIso } = daySlot(
      -pastDaysAgo - bookingCounter,
    );
    await dataSource.query(
      `UPDATE booking_item SET start_at = $1, end_at = $2 WHERE booking_id = $3`,
      [newStartIso, newEndIso, booking.id],
    );

    const [{ amount: providerNetAmount }] = await dataSource.query(
      `SELECT amount FROM ledger_entry WHERE booking_id = $1 AND entry_type = 'PROVIDER_NET'`,
      [booking.id],
    );
    return {
      bookingId: booking.id,
      providerNetAmount: Number(providerNetAmount),
    };
  }

  /** Same as above but leaves the booking in the near future (still inside its free-cancellation window) — used to prove ineligible entries are excluded. */
  async function makeConfirmedBookingStillInWindow(): Promise<{
    bookingId: string;
    providerNetAmount: number;
  }> {
    bookingCounter += 1;
    const { startAt, endAt } = daySlot(30 + bookingCounter * 5);
    const booking = await bookingsService.create(null, {
      roomId,
      startAt,
      endAt,
      customer: { email: `${suffix}-guest-${bookingCounter}@example.com` },
    } as any);
    const session = await paymentsService.createCheckoutSession(null, {
      bookingId: booking.id,
      provider: 'PAYRIFF' as any,
    });
    const totalAmount = Number(booking.totalAmount);
    await paymentsService.handleWebhook(
      'PAYRIFF' as any,
      Buffer.from(
        JSON.stringify({
          status: 'approved',
          orderId: session.paymentId,
          transactionId: `payriff-ext-${bookingCounter}`,
          amount: totalAmount / 100,
          currency: 'AZN',
        }),
      ),
      undefined,
    );
    const [{ amount: providerNetAmount }] = await dataSource.query(
      `SELECT amount FROM ledger_entry WHERE booking_id = $1 AND entry_type = 'PROVIDER_NET'`,
      [booking.id],
    );
    return {
      bookingId: booking.id,
      providerNetAmount: Number(providerNetAmount),
    };
  }

  it('excludes a CONFIRMED booking still inside its free-cancellation window from both the batch and the "available" balance', async () => {
    const { providerNetAmount } = await makeConfirmedBookingStillInWindow();

    const balanceBefore = await payoutsService.getBalance(
      'provider_id',
      providerId,
    );
    expect(balanceBefore.pending).toBeGreaterThanOrEqual(providerNetAmount);

    const created = await payoutsService.runPayoutBatch(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(),
      null,
    );
    const forThisProvider = created.filter((p) => p.providerId === providerId);
    expect(forThisProvider).toHaveLength(0); // nothing eligible yet for this provider

    const balanceAfter = await payoutsService.getBalance(
      'provider_id',
      providerId,
    );
    expect(balanceAfter.available).toBe(0);
  });

  it('batches an eligible (past-cancellation-window) booking into a new AVAILABLE payout with the correct amount, and carries it through PROCESSING -> PAID', async () => {
    const { bookingId, providerNetAmount } =
      await makeConfirmedBookingInThePast(10);

    const created = await payoutsService.runPayoutBatch(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(),
      financeAdminUserId,
    );
    const payout = created.find((p) => p.providerId === providerId);
    expect(payout).toBeDefined();
    expect(payout!.status).toBe(PayoutStatus.AVAILABLE);
    expect(Number(payout!.amount)).toBe(providerNetAmount);

    const [entry] = await dataSource.query(
      `SELECT payout_id FROM ledger_entry WHERE booking_id = $1 AND entry_type = 'PROVIDER_NET'`,
      [bookingId],
    );
    expect(entry.payout_id).toBe(payout!.id);

    // Can't skip straight to PAID from AVAILABLE.
    await expect(
      payoutsService.markPaid(payout!.id, financeAdminUserId, 'REF-SKIP'),
    ).rejects.toBeInstanceOf(DomainException);

    const processing = await payoutsService.markProcessing(
      payout!.id,
      financeAdminUserId,
    );
    expect(processing.status).toBe(PayoutStatus.PROCESSING);

    const paid = await payoutsService.markPaid(
      payout!.id,
      financeAdminUserId,
      'REF-12345',
    );
    expect(paid.status).toBe(PayoutStatus.PAID);
    expect(paid.bankReference).toBe('REF-12345');
    expect(paid.paidAt).toBeTruthy();

    const balance = await payoutsService.getBalance('provider_id', providerId);
    expect(balance.paid).toBeGreaterThanOrEqual(providerNetAmount);

    const { entries } = await payoutsService.getStatement(payout!.id);
    expect(entries.map((e) => e.bookingId)).toContain(bookingId);
  });

  it('does not batch the same ledger entries twice on a second run', async () => {
    const before = await payoutsService.runPayoutBatch(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(),
      financeAdminUserId,
    );
    const forThisProvider = before.filter((p) => p.providerId === providerId);
    expect(forThisProvider).toHaveLength(0); // the earlier booking's entries are already linked to a payout; nothing new is eligible
  });

  it('supports the FAILED -> retry -> PAID path', async () => {
    await makeConfirmedBookingInThePast(15);
    const created = await payoutsService.runPayoutBatch(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(),
      financeAdminUserId,
    );
    const payout = created.find((p) => p.providerId === providerId);
    expect(payout).toBeDefined();

    await payoutsService.markProcessing(payout!.id, financeAdminUserId);
    const failed = await payoutsService.markFailed(
      payout!.id,
      financeAdminUserId,
      'Wrong IBAN on file',
    );
    expect(failed.status).toBe(PayoutStatus.FAILED);

    const retried = await payoutsService.retry(payout!.id, financeAdminUserId);
    expect(retried.status).toBe(PayoutStatus.PROCESSING);

    const paid = await payoutsService.markPaid(
      payout!.id,
      financeAdminUserId,
      'REF-RETRY-1',
    );
    expect(paid.status).toBe(PayoutStatus.PAID);
  });

  it('reverses a PAID payout with a proportional per-booking clawback that nets to zero and rolls into the next batch', async () => {
    const { bookingId, providerNetAmount } =
      await makeConfirmedBookingInThePast(20);
    const created = await payoutsService.runPayoutBatch(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(),
      financeAdminUserId,
    );
    const payout = created.find((p) => p.providerId === providerId);
    expect(payout).toBeDefined();
    await payoutsService.markProcessing(payout!.id, financeAdminUserId);
    await payoutsService.markPaid(
      payout!.id,
      financeAdminUserId,
      'REF-TO-REVERSE',
    );

    const reversed = await payoutsService.reverse(
      payout!.id,
      financeAdminUserId,
      'Late chargeback from card network',
    );
    expect(reversed.status).toBe(PayoutStatus.REVERSED);

    const clawbackEntries = await dataSource.query(
      `SELECT amount, booking_id, payout_id FROM ledger_entry WHERE booking_id = $1 AND entry_type = 'ADJUSTMENT'`,
      [bookingId],
    );
    expect(clawbackEntries).toHaveLength(1);
    expect(Number(clawbackEntries[0].amount)).toBe(-providerNetAmount);
    expect(clawbackEntries[0].payout_id).toBeNull(); // unbatched — rolls into the next run

    // The only unbatched entry for this provider now is the negative
    // clawback itself — a fresh batch run must not create a new (negative)
    // payout for it; it stays unbatched and would only turn payable again
    // once offset by a future positive entry (§14.4.2's carry-forward).
    const nextRun = await payoutsService.runPayoutBatch(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(),
      financeAdminUserId,
    );
    expect(nextRun.filter((p) => p.providerId === providerId)).toHaveLength(0);

    // Cannot reverse an already-REVERSED payout.
    await expect(
      payoutsService.reverse(payout!.id, financeAdminUserId, 'again'),
    ).rejects.toBeInstanceOf(DomainException);
  });
});
