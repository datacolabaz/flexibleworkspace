process.env.BOOKING_MODE = 'REQUEST_BASED';
process.env.PAYMENTS_ENABLED = 'true';

import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { BookingEntity } from '../src/modules/bookings/entities/booking.entity';
import { BookingStatus } from '../src/common/constants/booking.enum';
import { DomainException } from '../src/common/exceptions/domain.exception';

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
  ],
});

describe('Request-first booking (accept then payment)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let paymentsService: PaymentsService;
  let bookingsService: BookingsService;

  const suffix = `request-first-${Date.now()}`;
  let providerId: string;
  let locationId: string;
  let roomId: string;
  let bookingSlotDayOffset = 40;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    paymentsService = app.get(PaymentsService);
    bookingsService = app.get(BookingsService);
    await dataSource.query(
      `ALTER TABLE provider ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(32)`,
    );

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('RF Test', 'RF Test', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, user.id],
    );
    providerId = provider.id;
    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'RF Location', 'Addr', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
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
       VALUES ($1, $2, 'RF Room', $3, 10, 5000, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
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
  }, 30_000);

  afterAll(async () => {
    delete process.env.BOOKING_MODE;
    if (!dataSource) return;
    await dataSource.query(
      `DELETE FROM ledger_entry WHERE booking_id IN (SELECT id FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1))`,
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
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  async function makePendingBooking(label: string) {
    bookingSlotDayOffset += 1;
    const base = new Date();
    base.setUTCDate(base.getUTCDate() + bookingSlotDayOffset);
    base.setUTCHours(10, 0, 0, 0);
    return bookingsService.create(null, {
      roomId,
      startAt: base.toISOString(),
      endAt: new Date(base.getTime() + 2 * 3_600_000).toISOString(),
      customer: { email: `${suffix}-guest-${label}@example.com` },
    } as any);
  }

  function payriffWebhookPayload(
    paymentId: string,
    transactionId: string,
    totalAmountMinorUnits: number,
  ) {
    return Buffer.from(
      JSON.stringify({
        status: 'approved',
        orderId: paymentId,
        transactionId,
        amount: totalAmountMinorUnits / 100,
        currency: 'AZN',
      }),
    );
  }

  it('does not allow checkout before provider accept', async () => {
    const booking = await makePendingBooking('no-pay-before-accept');
    expect(booking.mode).toBe('REQUEST_BASED');
    expect(booking.status).toBe(BookingStatus.PENDING);
    await expect(
      paymentsService.createCheckoutSession(null, {
        bookingId: booking.id,
        provider: 'PAYRIFF' as any,
      }),
    ).rejects.toBeInstanceOf(DomainException);
    const still = await bookingsService.findById(booking.id);
    expect(still.status).toBe(BookingStatus.PENDING);
    expect(
      (still as BookingEntity & { whatsappUrl?: string | null }).whatsappUrl,
    ).toBeNull();
  });

  it('accept then pay confirms and writes ledger; WhatsApp appears only after capture', async () => {
    await dataSource.query(
      `UPDATE provider SET whatsapp_phone = '+994501112233' WHERE id = $1`,
      [providerId],
    );
    const booking = await makePendingBooking('pay-after-accept');
    const accepted = await bookingsService.acceptBooking(
      providerId,
      booking.id,
    );
    expect(accepted.status).toBe(BookingStatus.PAYMENT_PENDING);
    expect(accepted.confirmedAt).toBeNull();

    const session = await paymentsService.createCheckoutSession(null, {
      bookingId: booking.id,
      provider: 'PAYRIFF' as any,
    });
    await paymentsService.handleWebhook(
      'PAYRIFF' as any,
      payriffWebhookPayload(
        session.paymentId,
        `rf-ext-${booking.id.slice(0, 8)}`,
        Number(booking.totalAmount),
      ),
      undefined,
    );

    const confirmed = await bookingsService.findById(booking.id);
    expect(confirmed.status).toBe(BookingStatus.CONFIRMED);
    expect(
      (confirmed as BookingEntity & { whatsappUrl?: string | null })
        .whatsappUrl,
    ).toMatch(/^https:\/\/wa\.me\/994501112233/);

    const entries = await dataSource.query(
      `SELECT entry_type FROM ledger_entry WHERE booking_id = $1`,
      [booking.id],
    );
    expect(entries.map((e: { entry_type: string }) => e.entry_type)).toEqual(
      expect.arrayContaining(['GROSS', 'PLATFORM_FEE', 'PROVIDER_NET']),
    );
  });

  it('rejects checkout after hold expiry', async () => {
    const booking = await makePendingBooking('expired-no-pay');
    await bookingsService.acceptBooking(providerId, booking.id);
    await dataSource.query(
      `UPDATE booking SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`,
      [booking.id],
    );
    await bookingsService.expireStaleHolds();
    const expired = await bookingsService.findById(booking.id);
    expect(expired.status).toBe(BookingStatus.EXPIRED);
    await expect(
      paymentsService.createCheckoutSession(null, {
        bookingId: booking.id,
        provider: 'PAYRIFF' as any,
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });
});
