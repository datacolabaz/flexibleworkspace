import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { SlotUnavailableException } from '../src/common/exceptions/domain.exception';

/**
 * NOTE: this deliberately bootstraps a minimal module tree (config + a real
 * TypeORM connection + JwtModule + BookingsModule, which transitively pulls
 * in Rooms/Locations/Providers/Storage/Auth/Notifications) instead of the
 * full AppModule. AppModule (src/app.module.ts) already references sibling
 * modules — Search/Payments/Payouts/Reviews/Favorites/Admin — that are not
 * built yet (P4-4 onward) and so does not compile in isolation.
 *
 * JwtModule is included because AuthService injects JwtService directly
 * without AuthModule importing JwtModule itself — it relies on AppModule
 * registering JwtModule with `global: true`. That's a deliberate pattern
 * (one JWT config for the whole app), not a bug, so this test replicates
 * the same global registration AppModule provides in production, rather
 * than switching guards/HTTP infra on (this test calls BookingsService
 * directly and never goes through HTTP, so guards/Throttler stay out).
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
  ],
});

/**
 * THE most safety-critical test in this codebase (12_RESERVATION_ENGINE.md
 * §12.2): two simultaneous requests for the exact same room/time must
 * resolve to exactly one CONFIRMED-eligible booking and one clean 409 —
 * never two overlapping active bookings. This runs against the REAL
 * Postgres database (not a mock), because the guarantee being tested is
 * the `no_overlapping_bookings` EXCLUDE constraint itself, not application
 * logic that could pass against an in-memory double while still being
 * wrong against real Postgres concurrency semantics.
 *
 * Requires the dev database (docker-compose or local Postgres) to be up
 * and migrated — same connection the app itself uses (.env).
 */
describe('Booking concurrency (real Postgres, real exclusion constraint)', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let bookingsService: BookingsService;

  let providerId: string;
  let locationId: string;
  let roomId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    bookingsService = app.get(BookingsService);

    // Seed a minimal, real, VERIFIED provider + ACTIVE room via raw SQL —
    // deliberately not going through the HTTP/service layer here, so this
    // test's fixture setup doesn't depend on the very features it's testing.
    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`concurrency-test-${Date.now()}@example.com`],
    );
    ownerUserId = user.id;

    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Concurrency Test MMC', 'Concurrency Test', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [`concurrency-test-${Date.now()}`, ownerUserId],
    );
    providerId = provider.id;

    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Test Location', 'Test Address 1', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.89, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [providerId],
    );
    locationId = location.id;

    const [roomType] = await dataSource.query(
      `SELECT id FROM room_type LIMIT 1`,
    );

    const [room] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_max, base_price_amount, base_price_currency, status,
                          min_booking_minutes, max_booking_minutes, advance_booking_min_hours, advance_booking_max_days, buffer_minutes,
                          created_at, updated_at)
       VALUES ($1, $2, 'Concurrency Test Room', $3, 10, 5000, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `concurrency-test-room-${Date.now()}`],
    );
    roomId = room.id;

    // A wide-open weekly availability rule (all week, 00:00-23:59) so the
    // race is decided by the exclusion constraint, not by availability rules.
    for (let day = 0; day <= 6; day++) {
      await dataSource.query(
        `INSERT INTO availability_rule (room_id, recurrence_type, day_of_week, start_time, end_time, is_open, created_at)
         VALUES ($1, 'WEEKLY', $2, '00:00', '23:59', true, now())`,
        [roomId, day],
      );
    }
  }, 30_000);

  afterAll(async () => {
    // Clean up in dependency order — this is test fixture data, not
    // production data, so a direct delete is appropriate here (unlike the
    // application's own soft-delete discipline).
    await dataSource.query(`DELETE FROM booking_item WHERE room_id = $1`, [
      roomId,
    ]);
    await dataSource.query(
      `DELETE FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE 'concurrency-test-guest-%')`,
    );
    await dataSource.query(
      `DELETE FROM app_user WHERE email LIKE 'concurrency-test-guest-%'`,
    );
    await dataSource.query(`DELETE FROM availability_rule WHERE room_id = $1`, [
      roomId,
    ]);
    await dataSource.query(`DELETE FROM room WHERE id = $1`, [roomId]);
    await dataSource.query(`DELETE FROM location WHERE id = $1`, [locationId]);
    await dataSource.query(`DELETE FROM provider WHERE id = $1`, [providerId]);
    await dataSource.query(`DELETE FROM app_user WHERE id = $1`, [ownerUserId]);
    await app.close();
  });

  it('allows exactly one of two simultaneous overlapping booking attempts to succeed', async () => {
    const startAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const endAt = new Date(Date.now() + 50 * 3_600_000).toISOString();

    const attempt = (n: number) =>
      bookingsService.create(null, {
        roomId,
        startAt,
        endAt,
        customer: {
          email: `concurrency-test-guest-${Date.now()}-${n}@example.com`,
        },
      });

    const results = await Promise.allSettled([attempt(1), attempt(2)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SlotUnavailableException,
    );

    // Confirm at the database level: exactly one active booking_item exists
    // for this room/range — the exclusion constraint's own guarantee, not
    // just "the application only tried to create one."
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM booking_item
       WHERE room_id = $1 AND status IN ('PENDING','PAYMENT_PENDING','CONFIRMED')
         AND tstzrange(start_at, end_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [roomId, startAt, endAt],
    );
    expect(count).toBe(1);
  }, 30_000);

  it('rejects a second booking that only partially overlaps an existing one', async () => {
    const baseStart = Date.now() + 96 * 3_600_000;
    const firstStart = new Date(baseStart).toISOString();
    const firstEnd = new Date(baseStart + 2 * 3_600_000).toISOString();
    // Overlaps the last hour of the first booking.
    const secondStart = new Date(baseStart + 1 * 3_600_000).toISOString();
    const secondEnd = new Date(baseStart + 3 * 3_600_000).toISOString();

    await bookingsService.create(null, {
      roomId,
      startAt: firstStart,
      endAt: firstEnd,
      customer: {
        email: `concurrency-test-guest-${Date.now()}-partial-a@example.com`,
      },
    });

    await expect(
      bookingsService.create(null, {
        roomId,
        startAt: secondStart,
        endAt: secondEnd,
        customer: {
          email: `concurrency-test-guest-${Date.now()}-partial-b@example.com`,
        },
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableException);
  }, 30_000);

  it('allows a back-to-back, non-overlapping booking on the same room', async () => {
    const baseStart = Date.now() + 144 * 3_600_000;
    const firstStart = new Date(baseStart).toISOString();
    const firstEnd = new Date(baseStart + 2 * 3_600_000).toISOString();
    // Starts exactly when the first ends — the range is half-open '[)', so this must be allowed.
    const secondStart = firstEnd;
    const secondEnd = new Date(baseStart + 4 * 3_600_000).toISOString();

    await bookingsService.create(null, {
      roomId,
      startAt: firstStart,
      endAt: firstEnd,
      customer: {
        email: `concurrency-test-guest-${Date.now()}-adjacent-a@example.com`,
      },
    });

    await expect(
      bookingsService.create(null, {
        roomId,
        startAt: secondStart,
        endAt: secondEnd,
        customer: {
          email: `concurrency-test-guest-${Date.now()}-adjacent-b@example.com`,
        },
      }),
    ).resolves.toBeDefined();
  }, 30_000);
});
