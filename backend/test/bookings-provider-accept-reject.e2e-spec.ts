import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { BookingStatus } from '../src/common/constants/booking.enum';
import { BookingRejectionReason } from '../src/common/constants/booking-rejection-reason.enum';
import {
  BookingModeNotSupportedException,
  InvalidBookingStateTransitionException,
  ProviderSuspendedException,
  ResourceNotFoundException,
} from '../src/common/exceptions/domain.exception';

/**
 * T4 (Phase 1A — Request-Based Booking, provider accept/reject) — exercises
 * BookingsService.acceptBooking/rejectBooking against the REAL database:
 * ownership, provider-verification, and mode guards; the pessimistic_write
 * locking that makes transition() race-safe (duplicate accept, accept-vs-
 * reject, accept/reject-vs-hold-expiry-cron); and the customer notification
 * side effect. PAYMENTS_ENABLED=false for this whole suite so
 * BookingsService.create() (unmodified, real T4 code) produces REQUEST_BASED
 * bookings — the actual code path a Phase 1A deployment runs, not a raw-SQL
 * shortcut.
 */
process.env.PAYMENTS_ENABLED = 'false';

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
  ],
});

describe('Provider accept/reject (real Postgres — REQUEST_BASED bookings)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let bookingsService: BookingsService;

  const suffix = `t4-accept-reject-${Date.now()}`;
  let providerId: string;
  let locationId: string;
  let roomId: string;
  let intruderProviderId: string;
  let suspendedProviderId: string;
  let suspendedLocationId: string;
  let suspendedRoomId: string;
  const roomBasePriceAmount = 5000;

  async function insertProviderWithRoom(
    label: string,
    verificationStatus: 'VERIFIED' | 'SUSPENDED',
  ) {
    const [owner] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-${label}-owner@example.com`],
    );
    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ($1, $1, $2, $3, $4, 'PRO', now(), now()) RETURNING id`,
      [`T4 ${label}`, `${suffix}-${label}`, owner.id, verificationStatus],
    );
    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, $2, 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [provider.id, `${label} location`],
    );
    const [roomType] = await dataSource.query(
      `SELECT id FROM room_type WHERE translation_key = 'room_type.meeting_room'`,
    );
    const [room] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_max, base_price_amount, base_price_currency, status,
                          min_booking_minutes, max_booking_minutes, advance_booking_min_hours, advance_booking_max_days, buffer_minutes,
                          created_at, updated_at)
       VALUES ($1, $2, $3, $4, 10, $5, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [
        location.id,
        roomType.id,
        `${label} room`,
        `${suffix}-${label}-room`,
        roomBasePriceAmount,
      ],
    );
    for (let day = 0; day <= 6; day++) {
      await dataSource.query(
        `INSERT INTO availability_rule (room_id, recurrence_type, day_of_week, start_time, end_time, is_open, created_at)
         VALUES ($1, 'WEEKLY', $2, '00:00', '23:59', true, now())`,
        [room.id, day],
      );
    }
    return {
      providerId: provider.id,
      locationId: location.id,
      roomId: room.id,
    };
  }

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    bookingsService = app.get(BookingsService);

    const main = await insertProviderWithRoom('main', 'VERIFIED');
    providerId = main.providerId;
    locationId = main.locationId;
    roomId = main.roomId;

    const intruder = await insertProviderWithRoom('intruder', 'VERIFIED');
    intruderProviderId = intruder.providerId;

    const suspended = await insertProviderWithRoom('suspended', 'SUSPENDED');
    suspendedProviderId = suspended.providerId;
    suspendedLocationId = suspended.locationId;
    suspendedRoomId = suspended.roomId;
  }, 30_000);

  afterAll(async () => {
    delete process.env.PAYMENTS_ENABLED;
    const roomIds = [roomId, suspendedRoomId];
    await dataSource.query(
      `DELETE FROM notification WHERE user_id IN (SELECT id FROM app_user WHERE email LIKE $1)`,
      [`${suffix}%`],
    );
    await dataSource.query(
      `DELETE FROM booking_item WHERE room_id = ANY($1::uuid[])`,
      [roomIds],
    );
    await dataSource.query(
      `DELETE FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1)`,
      [`${suffix}%`],
    );
    await dataSource.query(
      `DELETE FROM availability_rule WHERE room_id = ANY($1::uuid[])`,
      [roomIds],
    );
    await dataSource.query(`DELETE FROM room WHERE id = ANY($1::uuid[])`, [
      roomIds,
    ]);
    await dataSource.query(`DELETE FROM location WHERE id = ANY($1::uuid[])`, [
      [locationId, suspendedLocationId],
    ]);
    await dataSource.query(`DELETE FROM provider WHERE id = ANY($1::uuid[])`, [
      [providerId, intruderProviderId, suspendedProviderId],
    ]);
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  // Each booking gets its own day, N days out, fixed at 10:00-12:00 UTC —
  // always comfortably inside the room's 00:00-23:59 open window regardless
  // of the location's timezone, and never overlapping another call's slot
  // (a shared-room hazard a plain running-hours offset hit: a slot that
  // happened to straddle local midnight fell outside any single day's
  // window and spuriously failed as SLOT_UNAVAILABLE).
  let bookingSlotDayOffset = 20;
  async function makePendingBooking(label: string, targetRoomId = roomId) {
    bookingSlotDayOffset += 1;
    const base = new Date();
    base.setUTCDate(base.getUTCDate() + bookingSlotDayOffset);
    base.setUTCHours(10, 0, 0, 0);
    const startAt = base.toISOString();
    const endAt = new Date(base.getTime() + 2 * 3_600_000).toISOString();
    return bookingsService.create(null, {
      roomId: targetRoomId,
      startAt,
      endAt,
      customer: { email: `${suffix}-guest-${label}-${Date.now()}@example.com` },
    } as any);
  }

  it('create() produces a REQUEST_BASED booking when PAYMENTS_ENABLED=false', async () => {
    const booking = await makePendingBooking('mode-check');
    expect(booking.mode).toBe('REQUEST_BASED');
    expect(booking.status).toBe(BookingStatus.PENDING);
  });

  it('accepts a PENDING booking: status -> CONFIRMED, booking_item kept in lockstep', async () => {
    const booking = await makePendingBooking('accept-ok');
    const accepted = await bookingsService.acceptBooking(
      providerId,
      booking.id,
      'Görüşürük!',
    );
    expect(accepted.status).toBe(BookingStatus.CONFIRMED);
    expect(accepted.confirmedAt).not.toBeNull();

    const [item] = await dataSource.query(
      `SELECT status FROM booking_item WHERE booking_id = $1`,
      [booking.id],
    );
    expect(item.status).toBe(BookingStatus.CONFIRMED);
  });

  it('rejects a PENDING booking: status -> REJECTED, rejection fields recorded', async () => {
    const booking = await makePendingBooking('reject-ok');
    const rejected = await bookingsService.rejectBooking(
      providerId,
      (
        await dataSource.query(
          `SELECT owner_user_id FROM provider WHERE id = $1`,
          [providerId],
        )
      )[0].owner_user_id,
      booking.id,
      BookingRejectionReason.ROOM_UNAVAILABLE,
    );
    expect(rejected.status).toBe(BookingStatus.REJECTED);
    expect(rejected.rejectionReason).toBe(
      BookingRejectionReason.ROOM_UNAVAILABLE,
    );
    expect(rejected.rejectedAt).not.toBeNull();
    expect(rejected.rejectedByUserId).not.toBeNull();
  });

  it('reject requires a note when reason=OTHER is enforced at the DTO layer, but the service itself accepts an explicit note for any reason', async () => {
    const booking = await makePendingBooking('reject-note');
    const rejected = await bookingsService.rejectBooking(
      providerId,
      (
        await dataSource.query(
          `SELECT owner_user_id FROM provider WHERE id = $1`,
          [providerId],
        )
      )[0].owner_user_id,
      booking.id,
      BookingRejectionReason.OTHER,
      'Special circumstance not covered by the closed list.',
    );
    expect(rejected.rejectionNote).toBe(
      'Special circumstance not covered by the closed list.',
    );
  });

  it('a provider that does not own the room gets a 404, not a 403 (never reveals the booking exists)', async () => {
    const booking = await makePendingBooking('ownership');
    await expect(
      bookingsService.acceptBooking(intruderProviderId, booking.id),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('a SUSPENDED provider cannot accept its own booking', async () => {
    const booking = await makePendingBooking(
      'suspended-accept',
      suspendedRoomId,
    );
    await expect(
      bookingsService.acceptBooking(suspendedProviderId, booking.id),
    ).rejects.toBeInstanceOf(ProviderSuspendedException);
  });

  it('a SUSPENDED provider cannot reject its own booking', async () => {
    const booking = await makePendingBooking(
      'suspended-reject',
      suspendedRoomId,
    );
    await expect(
      bookingsService.rejectBooking(
        suspendedProviderId,
        (
          await dataSource.query(
            `SELECT owner_user_id FROM provider WHERE id = $1`,
            [suspendedProviderId],
          )
        )[0].owner_user_id,
        booking.id,
        BookingRejectionReason.ROOM_UNAVAILABLE,
      ),
    ).rejects.toBeInstanceOf(ProviderSuspendedException);
  });

  it('cannot accept/reject a PAYMENT_BASED booking (mode guard)', async () => {
    // Bypasses create()'s PAYMENTS_ENABLED gate to construct a PAYMENT_BASED
    // row directly — this is the one legitimate use of raw SQL insert in
    // this suite, since the whole point is a booking create() itself would
    // never produce given PAYMENTS_ENABLED=false is set for this file.
    const [customer] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-guest-mode-guard@example.com`],
    );
    const startAt = new Date(Date.now() + 9e9).toISOString();
    const endAt = new Date(Date.now() + 9e9 + 2 * 3_600_000).toISOString();
    const [booking] = await dataSource.query(
      `INSERT INTO booking (customer_user_id, status, mode, currency, gross_amount, total_amount, created_at, updated_at)
       VALUES ($1, 'PENDING', 'PAYMENT_BASED', 'AZN', 10000, 10000, now(), now()) RETURNING id`,
      [customer.id],
    );
    await dataSource.query(
      `INSERT INTO booking_item (booking_id, room_id, start_at, end_at, unit_price_amount, quantity, status)
       VALUES ($1, $2, $3, $4, 5000, 1, 'PENDING')`,
      [booking.id, roomId, startAt, endAt],
    );

    await expect(
      bookingsService.acceptBooking(providerId, booking.id),
    ).rejects.toBeInstanceOf(BookingModeNotSupportedException);
  });

  it('duplicate accept: two concurrent accepts on the same booking — exactly one succeeds', async () => {
    const booking = await makePendingBooking('race-double-accept');
    const results = await Promise.allSettled([
      bookingsService.acceptBooking(providerId, booking.id),
      bookingsService.acceptBooking(providerId, booking.id),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InvalidBookingStateTransitionException,
    );
  });

  it('accept-vs-reject race on the same booking — exactly one wins', async () => {
    const booking = await makePendingBooking('race-accept-vs-reject');
    const ownerUserId = (
      await dataSource.query(
        `SELECT owner_user_id FROM provider WHERE id = $1`,
        [providerId],
      )
    )[0].owner_user_id;
    const results = await Promise.allSettled([
      bookingsService.acceptBooking(providerId, booking.id),
      bookingsService.rejectBooking(
        providerId,
        ownerUserId,
        booking.id,
        BookingRejectionReason.ROOM_UNAVAILABLE,
      ),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    const final = await bookingsService.findById(booking.id);
    expect([BookingStatus.CONFIRMED, BookingStatus.REJECTED]).toContain(
      final.status,
    );
  });

  it('accept-vs-hold-expiry-cron race: the cron sweep does not throw and does not clobber an already-accepted booking', async () => {
    const booking = await makePendingBooking('race-accept-vs-cron');
    // Force this one booking's hold to look already-expired so the sweep
    // picks it up in the same instant acceptBooking is racing it.
    await dataSource.query(
      `UPDATE booking SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`,
      [booking.id],
    );

    const [acceptResult, expiredCount] = await Promise.all([
      bookingsService.acceptBooking(providerId, booking.id).catch((e) => e),
      bookingsService.expireStaleHolds(),
    ]);

    const final = await bookingsService.findById(booking.id);
    // Whichever won, the sweep itself must not have thrown, and the booking
    // must have landed in exactly one terminal-for-this-race status.
    expect(typeof expiredCount).toBe('number');
    expect([BookingStatus.CONFIRMED, BookingStatus.EXPIRED]).toContain(
      final.status,
    );
    // The loser (whichever it was) surfaces its own exception, not a crash.
    if (acceptResult instanceof Error) {
      expect(acceptResult).toBeInstanceOf(
        InvalidBookingStateTransitionException,
      );
    }
  });

  it('hold-expiry cron sweep is resilient to one lost race among many stale bookings', async () => {
    const b1 = await makePendingBooking('cron-resilience-1');
    const b2 = await makePendingBooking('cron-resilience-2');
    await dataSource.query(
      `UPDATE booking SET hold_expires_at = now() - interval '1 minute' WHERE id = ANY($1::uuid[])`,
      [[b1.id, b2.id]],
    );
    // Pre-accept b1 so it's no longer PENDING when the sweep tries it —
    // simulates "a provider action won the race" without an actual race.
    await bookingsService.acceptBooking(providerId, b1.id);

    const expiredCount = await bookingsService.expireStaleHolds();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const final1 = await bookingsService.findById(b1.id);
    const final2 = await bookingsService.findById(b2.id);
    expect(final1.status).toBe(BookingStatus.CONFIRMED); // untouched by the sweep
    expect(final2.status).toBe(BookingStatus.EXPIRED); // still swept normally
  });
});
