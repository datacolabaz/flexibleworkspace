import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { ReviewsModule } from '../src/modules/reviews/reviews.module';
import { ReviewsService } from '../src/modules/reviews/reviews.service';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { BookingStatus } from '../src/common/constants/booking.enum';
import { RoleName } from '../src/common/constants/roles.enum';
import { ModerationStatus } from '../src/modules/rooms/entities/photo.entity';
import { DomainException } from '../src/common/exceptions/domain.exception';

/**
 * 18_SECURITY.md §18.6 fake-review prevention + 09_DOMAIN_MODEL.md §9.2 —
 * exercised against the real DB (the review<->booking uniqueness
 * constraint, the self-review cross-reference query, and the room rating
 * aggregate recompute are all SQL-level correctness, same discipline as
 * every other financial/business-critical e2e spec in this suite).
 *
 * PaymentsModule/BookingsModule are included only to reach a real
 * CONFIRMED->COMPLETED booking through the actual state machine (PAYRIFF
 * dev-simulation, same pattern as payments.e2e-spec.ts) rather than
 * fabricating one by hand.
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
    ReviewsModule,
  ],
});

describe('Reviews (real Postgres — fake-review prevention, rating aggregate, moderation)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let bookingsService: BookingsService;
  let paymentsService: PaymentsService;
  let reviewsService: ReviewsService;

  const suffix = `reviews-test-${Date.now()}`;
  let ownerUserId: string;
  let providerId: string;
  let locationId: string;
  let roomId: string;
  let adminUserId: string;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    bookingsService = app.get(BookingsService);
    paymentsService = app.get(PaymentsService);
    reviewsService = app.get(ReviewsService);

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    ownerUserId = user.id;

    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Reviews Test MMC', 'Reviews Test', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, ownerUserId],
    );
    providerId = provider.id;

    await dataSource.query(
      `INSERT INTO user_role (user_id, role, provider_id, created_at) VALUES ($1, $2, $3, now())`,
      [ownerUserId, RoleName.PROVIDER_OWNER, providerId],
    );

    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Reviews Test Location', 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
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
                          average_rating, review_count, created_at, updated_at)
       VALUES ($1, $2, 'Reviews Test Room', $3, 10, 5000, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, 0, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `${suffix}-room`],
    );
    roomId = room.id;

    for (let day = 0; day <= 6; day++) {
      await dataSource.query(
        `INSERT INTO availability_rule (room_id, recurrence_type, day_of_week, start_time, end_time, is_open, created_at)
         VALUES ($1, 'WEEKLY', $2, '00:00', '23:59', true, now())`,
        [roomId, day],
      );
    }

    const [admin] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-admin@example.com`],
    );
    adminUserId = admin.id;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM audit_log WHERE entity_type = 'Review' AND entity_id IN (SELECT id FROM review WHERE room_id = $1)`,
      [roomId],
    );
    await dataSource.query(`DELETE FROM review WHERE room_id = $1`, [roomId]);
    await dataSource.query(`DELETE FROM ledger_entry WHERE provider_id = $1`, [
      providerId,
    ]);
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
    await dataSource.query(`DELETE FROM user_role WHERE provider_id = $1`, [
      providerId,
    ]);
    await dataSource.query(`DELETE FROM provider WHERE id = $1`, [providerId]);
    await dataSource.query(
      `DELETE FROM notification WHERE user_id IN (SELECT id FROM app_user WHERE email LIKE $1)`,
      [`${suffix}%`],
    );
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  let bookingCounter = 0;

  /**
   * 08:00 UTC = comfortably mid-day in Asia/Baku (UTC+4), so this never
   * straddles the room's local-calendar-day boundary. Also skips any date
   * seeded as an AZ public holiday (12_RESERVATION_ENGINE.md §12.1 —
   * AvailabilityService closes the whole day for one) rather than
   * hardcoding "safe" offsets that would silently break whenever the
   * holiday calendar changes or the suite runs on a different day.
   */
  async function daySlot(
    startOffset: number,
  ): Promise<{ startAt: string; endAt: string }> {
    for (let offset = startOffset; offset < startOffset + 60; offset++) {
      const base = new Date();
      base.setUTCHours(8, 0, 0, 0);
      const startAt = new Date(base.getTime() + offset * 86_400_000);
      const isoDate = startAt.toISOString().slice(0, 10);
      const [holiday] = await dataSource.query(
        `SELECT 1 FROM holiday WHERE country_code = 'AZ' AND observed_date = $1`,
        [isoDate],
      );
      if (!holiday) {
        const endAt = new Date(startAt.getTime() + 2 * 3_600_000);
        return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
      }
    }
    throw new Error('Could not find a non-holiday slot within 60 days.');
  }

  /** Creates, PAYRIFF-confirms, and (unless left CONFIRMED) marks a booking COMPLETED — this is the only status a review may be created against. */
  async function makeBooking(
    customerEmailPrefix: string,
    opts: { complete?: boolean } = { complete: true },
  ) {
    bookingCounter += 1;
    const { startAt, endAt } = await daySlot(30 + bookingCounter * 5);
    const booking = await bookingsService.create(null, {
      roomId,
      startAt,
      endAt,
      customer: {
        email: `${suffix}-${customerEmailPrefix}-${bookingCounter}@example.com`,
      },
    } as any);
    const session = await paymentsService.createCheckoutSession(null, {
      bookingId: booking.id,
      provider: 'PAYRIFF' as any,
    });
    await paymentsService.handleWebhook(
      'PAYRIFF' as any,
      Buffer.from(
        JSON.stringify({
          status: 'approved',
          orderId: session.paymentId,
          transactionId: `payriff-ext-rev-${bookingCounter}`,
          amount: Number(booking.totalAmount) / 100,
          currency: 'AZN',
        }),
      ),
      undefined,
    );
    if (opts.complete !== false) {
      await bookingsService.transition(booking.id, BookingStatus.COMPLETED);
    }
    const [{ customer_user_id: customerUserId }] = await dataSource.query(
      `SELECT customer_user_id FROM booking WHERE id = $1`,
      [booking.id],
    );
    return { bookingId: booking.id, customerUserId };
  }

  it('rejects a review for a booking that is not COMPLETED', async () => {
    const { bookingId, customerUserId } = await makeBooking('notdone', {
      complete: false,
    });
    await expect(
      reviewsService.create(customerUserId, { bookingId, rating: 5 }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it('creates a review for a completed booking and recomputes the room rating aggregate', async () => {
    const { bookingId, customerUserId } = await makeBooking('good');
    const review = await reviewsService.create(customerUserId, {
      bookingId,
      rating: 4,
      text: 'Solid room.',
    });
    expect(review.moderationStatus).toBe(ModerationStatus.APPROVED);

    const [room] = await dataSource.query(
      `SELECT average_rating::float, review_count FROM room WHERE id = $1`,
      [roomId],
    );
    expect(room.review_count).toBe(1);
    expect(room.average_rating).toBe(4);

    const publicList = await reviewsService.listForRoom(roomId);
    expect(publicList.map((r) => r.id)).toContain(review.id);
  });

  it('rejects a second review for the same booking (one review per booking)', async () => {
    const { bookingId, customerUserId } = await makeBooking('dup');
    await reviewsService.create(customerUserId, { bookingId, rating: 3 });
    await expect(
      reviewsService.create(customerUserId, { bookingId, rating: 5 }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it('rejects a review from another customer than the one who booked', async () => {
    const { bookingId } = await makeBooking('owned-by-someone-else');
    const [otherUser] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-impersonator@example.com`],
    );
    await expect(
      reviewsService.create(otherUser.id, { bookingId, rating: 1 }),
    ).rejects.toBeInstanceOf(DomainException);
    await dataSource.query(`DELETE FROM app_user WHERE id = $1`, [
      otherUser.id,
    ]);
  });

  it('prevents a provider account from reviewing its own room', async () => {
    const { bookingId } = await makeBooking('self-review-attempt');
    // ownerUserId holds a PROVIDER_OWNER role for this room's provider, but
    // isn't the booking's actual customer — reassign the booking to them to
    // isolate the self-review check specifically.
    await dataSource.query(
      `UPDATE booking SET customer_user_id = $1 WHERE id = $2`,
      [ownerUserId, bookingId],
    );
    await expect(
      reviewsService.create(ownerUserId, { bookingId, rating: 5 }),
    ).rejects.toMatchObject({ code: 'SELF_REVIEW_NOT_ALLOWED' });
  });

  it("lists the customer's own review via listForCustomer (the /reviews/me source)", async () => {
    const { bookingId, customerUserId } = await makeBooking('my-reviews');
    const review = await reviewsService.create(customerUserId, {
      bookingId,
      rating: 5,
      text: 'My own review.',
    });

    const mine = await reviewsService.listForCustomer(customerUserId);
    expect(mine.map((r) => r.id)).toContain(review.id);
  });

  it('includes a REJECTED review in listForCustomer even though it is hidden from the public listForRoom — a customer can still see their own moderated-away content', async () => {
    const { bookingId, customerUserId } = await makeBooking('my-rejected');
    const review = await reviewsService.create(customerUserId, {
      bookingId,
      rating: 1,
      text: 'This will get rejected.',
    });
    await reviewsService.moderate(
      review.id,
      adminUserId,
      ModerationStatus.REJECTED,
      'Policy violation.',
    );

    const mine = await reviewsService.listForCustomer(customerUserId);
    const mineEntry = mine.find((r) => r.id === review.id);
    expect(mineEntry).toBeDefined();
    expect(mineEntry?.moderationStatus).toBe(ModerationStatus.REJECTED);

    const publicList = await reviewsService.listForRoom(roomId);
    expect(publicList.map((r) => r.id)).not.toContain(review.id);
  });

  it("does not leak another customer's reviews into listForCustomer", async () => {
    const { bookingId: bookingA, customerUserId: customerA } =
      await makeBooking('isolation-a');
    const { bookingId: bookingB, customerUserId: customerB } =
      await makeBooking('isolation-b');
    const reviewA = await reviewsService.create(customerA, {
      bookingId: bookingA,
      rating: 3,
    });
    await reviewsService.create(customerB, { bookingId: bookingB, rating: 4 });

    const mineA = await reviewsService.listForCustomer(customerA);
    expect(mineA.map((r) => r.id)).toEqual([reviewA.id]);
  });

  it('lets the provider reply, and lets a flag be recorded without hiding the review — only an admin moderation decision changes visibility and recomputes the aggregate', async () => {
    const { bookingId, customerUserId } = await makeBooking('flagged');
    const review = await reviewsService.create(customerUserId, {
      bookingId,
      rating: 2,
      text: 'Not great.',
    });

    const replied = await reviewsService.reply(
      review.id,
      providerId,
      'Sorry to hear that — we will follow up.',
    );
    expect(replied.providerReplyText).toContain('follow up');

    await reviewsService.flag(
      review.id,
      providerId,
      ownerUserId,
      'Suspect this is a competitor.',
    );
    const stillPublic = await reviewsService.listForRoom(roomId);
    expect(stillPublic.map((r) => r.id)).toContain(review.id); // flag alone must not hide it

    const flaggedQueue = await reviewsService.listFlaggedForAdmin();
    expect(flaggedQueue.map((r: any) => r.id)).toContain(review.id);

    const [roomBefore] = await dataSource.query(
      `SELECT review_count FROM room WHERE id = $1`,
      [roomId],
    );

    const moderated = await reviewsService.moderate(
      review.id,
      adminUserId,
      ModerationStatus.REJECTED,
      'Confirmed policy violation.',
    );
    expect(moderated.moderationStatus).toBe(ModerationStatus.REJECTED);

    const publicAfter = await reviewsService.listForRoom(roomId);
    expect(publicAfter.map((r) => r.id)).not.toContain(review.id); // now actually hidden

    const [roomAfter] = await dataSource.query(
      `SELECT review_count FROM room WHERE id = $1`,
      [roomId],
    );
    expect(roomAfter.review_count).toBe(roomBefore.review_count - 1); // aggregate recomputed from APPROVED only
  });
});
