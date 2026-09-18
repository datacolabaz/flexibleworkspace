import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';

import configuration from '../src/config/configuration';
import { AppModule } from '../src/app.module';
import { PartnersModule } from '../src/modules/partners/partners.module';
import { PartnersService } from '../src/modules/partners/partners.service';
import { ReferralCampaignsService } from '../src/modules/partners/referral-campaigns.service';
import { ReferralTrackingService } from '../src/modules/partners/referral-tracking.service';
import { PartnerAnalyticsService } from '../src/modules/partners/partner-analytics.service';
import { BookingReferralAttributionEntity } from '../src/modules/partners/entities/booking-referral-attribution.entity';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { RefundsService } from '../src/modules/payments/refunds.service';
import { PayoutsService } from '../src/modules/payouts/payouts.service';
import { PayoutStatus } from '../src/common/constants/payout.enum';
import { BookingsModule } from '../src/modules/bookings/bookings.module';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { BookingStatus } from '../src/common/constants/booking.enum';
import {
  PartnerStatus,
  ReferralCampaignStatus,
} from '../src/common/constants/partner.enum';
import { PartnerCommissionType } from '../src/common/constants/payment.enum';
import { RoleName } from '../src/common/constants/roles.enum';
import {
  DomainException,
  ResourceNotFoundException,
} from '../src/common/exceptions/domain.exception';

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md — Partner/Affiliate/Referral module
 * (P4-3a). Covers the full deterministic attribution chain (§31.4) end to
 * end against real Postgres: click -> attribution -> confirmed-booking
 * commission ledger write -> refund reversal, plus the fraud/edge-case
 * matrix (invalid code, expired/inactive campaign, suspended partner,
 * duplicate click, race/duplicate attribution) and the admin HTTP guard
 * surface (authorization/unauthorized access).
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
    BookingsModule, // pulls in PartnersModule, RoomsModule, AuthModule
    PaymentsModule, // pulls in NotificationsModule, AuditModule
    PartnersModule,
  ],
});

describe('Partner/Referral (real Postgres)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let partnersService: PartnersService;
  let campaignsService: ReferralCampaignsService;
  let trackingService: ReferralTrackingService;
  let analyticsService: PartnerAnalyticsService;
  let bookingsService: BookingsService;
  let paymentsService: PaymentsService;
  let refundsService: RefundsService;
  let payoutsService: PayoutsService;

  const suffix = `partner-test-${Date.now()}`;
  let providerId: string;
  let locationId: string;
  let roomId: string;
  const roomBasePriceAmount = 5000;
  const createdPartnerIds: string[] = [];

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    partnersService = app.get(PartnersService);
    campaignsService = app.get(ReferralCampaignsService);
    trackingService = app.get(ReferralTrackingService);
    analyticsService = app.get(PartnerAnalyticsService);
    bookingsService = app.get(BookingsService);
    paymentsService = app.get(PaymentsService);
    refundsService = app.get(RefundsService);
    payoutsService = app.get(PayoutsService);

    const [owner] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-owner@example.com`],
    );
    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Partner Test MMC', 'Partner Test', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, owner.id],
    );
    providerId = provider.id;
    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Partner Test Location', 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
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
       VALUES ($1, $2, 'Partner Test Room', $3, 10, $4, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
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
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM booking_referral_attribution WHERE booking_id IN (SELECT id FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1))`,
      [`${suffix}%`],
    );
    await dataSource.query(
      `DELETE FROM ledger_entry WHERE booking_id IN (SELECT id FROM booking WHERE customer_user_id IN (SELECT id FROM app_user WHERE email LIKE $1))`,
      [`${suffix}%`],
    );
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
    if (createdPartnerIds.length > 0) {
      await dataSource.query(
        `DELETE FROM referral_click WHERE campaign_id IN (SELECT id FROM referral_campaign WHERE partner_id = ANY($1))`,
        [createdPartnerIds],
      );
      await dataSource.query(
        `DELETE FROM referral_campaign WHERE partner_id = ANY($1)`,
        [createdPartnerIds],
      );
      await dataSource.query(`DELETE FROM payout WHERE partner_id = ANY($1)`, [
        createdPartnerIds,
      ]); // the payout-batching test leaves a PAID payout row referencing partner_id
      await dataSource.query(
        `DELETE FROM audit_log WHERE entity_type = 'Partner' AND entity_id = ANY($1)`,
        [createdPartnerIds],
      );
      await dataSource.query(`DELETE FROM partner WHERE id = ANY($1)`, [
        createdPartnerIds,
      ]);
    }
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

  async function makeActivePartner(
    name: string,
    commissionType: PartnerCommissionType,
    commissionValue: number,
  ): Promise<string> {
    const partner = await partnersService.create(await adminActorId(), {
      name: `${suffix} ${name}`,
      type: 'AFFILIATE' as any,
      contactEmail: `${suffix}-${name.replace(/\s+/g, '-').toLowerCase()}@example.com`,
      defaultCommissionType: commissionType,
      defaultCommissionValue: commissionValue,
    });
    createdPartnerIds.push(partner.id);
    await partnersService.changeStatus(partner.id, await adminActorId(), {
      status: PartnerStatus.ACTIVE,
      reason: 'Test setup approval',
    });
    return partner.id;
  }

  let cachedAdminActorId: string | null = null;
  /** audit_log.actor_user_id is a real FK to app_user (established discipline elsewhere in this repo) — reuse a single seeded admin row. */
  async function adminActorId(): Promise<string> {
    if (cachedAdminActorId) return cachedAdminActorId;
    const [admin] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-admin@example.com`],
    );
    cachedAdminActorId = admin.id;
    return cachedAdminActorId;
  }

  async function makeCampaign(
    partnerId: string,
    codeSuffix: string,
    overrides: Partial<{ attributionWindowDays: number }> = {},
  ) {
    return campaignsService.create(partnerId, await adminActorId(), {
      name: `${suffix} campaign ${codeSuffix}`,
      code: `${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}${codeSuffix}`,
      attributionWindowDays: overrides.attributionWindowDays,
    } as any);
  }

  function daySlot(dayOffset: number) {
    // Anchored at 08:00 UTC (mid-day Baku) — avoids the Asia/Baku
    // local-calendar-day boundary bug documented in payouts.e2e-spec.ts.
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayOffset);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  async function makeBooking(
    emailSuffix: string,
    dayOffset: number,
    attributionToken?: string | null,
  ) {
    const { startAt, endAt } = daySlot(dayOffset);
    return bookingsService.create(
      null,
      {
        roomId,
        startAt,
        endAt,
        customer: { email: `${suffix}-guest-${emailSuffix}@example.com` },
      } as any,
      attributionToken,
    );
  }

  // ---------------------------------------------------------------------
  // Referral click tracking
  // ---------------------------------------------------------------------
  describe('ReferralTrackingService.trackClick', () => {
    it('records a valid referral click for an active campaign under an active partner', async () => {
      const partnerId = await makeActivePartner(
        'Click Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'VALID');

      const result = await trackingService.trackClick({
        code: campaign.code,
        ipHash: trackingService.hashIp('1.2.3.4'),
        userAgent: 'jest',
        landingPath: '/rooms/xyz',
      });

      expect(result).not.toBeNull();
      expect(result!.attributionToken).toHaveLength(64); // 32 random bytes, hex-encoded
      expect(result!.attributionWindowDays).toBe(30);

      const [click] = await dataSource.query(
        `SELECT * FROM referral_click WHERE attribution_token = $1`,
        [result!.attributionToken],
      );
      expect(click).toBeDefined();
      expect(click.campaign_id).toBe(campaign.id);
      expect(click.landing_path).toBe('/rooms/xyz');
    });

    it('returns null (no click recorded) for an unknown/invalid referral code', async () => {
      const result = await trackingService.trackClick({
        code: 'THIS-CODE-DOES-NOT-EXIST',
        ipHash: null,
        landingPath: '/',
      });
      expect(result).toBeNull();
    });

    it('returns null for a PAUSED (inactive) campaign', async () => {
      const partnerId = await makeActivePartner(
        'Paused Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'PAUSED');
      await campaignsService.update(campaign.id, await adminActorId(), {
        status: ReferralCampaignStatus.PAUSED,
      });

      const result = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      expect(result).toBeNull();
    });

    it('returns null when the partner is SUSPENDED, even with an ACTIVE campaign', async () => {
      const partnerId = await makeActivePartner(
        'Suspended Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'SUSP');
      await partnersService.changeStatus(partnerId, await adminActorId(), {
        status: PartnerStatus.SUSPENDED,
        reason: 'Test suspension',
      });

      const result = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      expect(result).toBeNull();
    });

    it('handles duplicate/repeated clicks on the same code gracefully — each is its own independent, valid click', async () => {
      const partnerId = await makeActivePartner(
        'Duplicate Click Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'DUP');

      const first = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      const second = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });

      expect(first!.attributionToken).not.toBe(second!.attributionToken); // last-click-wins (§31.4) requires each click to mint its own token
      const [{ count }] = await dataSource.query(
        `SELECT count(*)::int AS count FROM referral_click WHERE campaign_id = $1`,
        [campaign.id],
      );
      expect(count).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  // Booking-time attribution
  // ---------------------------------------------------------------------
  describe('ReferralTrackingService.attributeBooking', () => {
    it('attributes a booking when a valid, unexpired token is presented, and the row persists', async () => {
      const partnerId = await makeActivePartner(
        'Attribution Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'ATTR');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });

      const booking = await makeBooking('attr', 10, click!.attributionToken);

      const [row] = await dataSource.query(
        `SELECT * FROM booking_referral_attribution WHERE booking_id = $1`,
        [booking.id],
      );
      expect(row).toBeDefined();
      expect(row.partner_id).toBe(partnerId);
      expect(row.campaign_id).toBe(campaign.id);

      // Persistence: re-query independently of the write path, proving this isn't just an in-memory echo.
      const attribution = await dataSource
        .getRepository(BookingReferralAttributionEntity)
        .findOne({ where: { bookingId: booking.id } });
      expect(attribution?.partnerId).toBe(partnerId);
    });

    it('creates the booking successfully but writes NO attribution row for an unknown/garbage token', async () => {
      const booking = await makeBooking(
        'garbage-token',
        11,
        'not-a-real-token-at-all',
      );
      expect(booking.id).toBeTruthy();
      const [row] = await dataSource.query(
        `SELECT * FROM booking_referral_attribution WHERE booking_id = $1`,
        [booking.id],
      );
      expect(row).toBeUndefined();
    });

    it('does not attribute when the click has expired', async () => {
      const partnerId = await makeActivePartner(
        'Expired Click Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'EXP');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      // Force it into the past directly — trackClick always computes a future expiry, so this simulates real time passing.
      await dataSource.query(
        `UPDATE referral_click SET expires_at = now() - interval '1 hour' WHERE attribution_token = $1`,
        [click!.attributionToken],
      );

      const booking = await makeBooking('expired', 12, click!.attributionToken);
      const [row] = await dataSource.query(
        `SELECT * FROM booking_referral_attribution WHERE booking_id = $1`,
        [booking.id],
      );
      expect(row).toBeUndefined();
    });

    it('does not attribute when the campaign was paused/ended after the click but before booking', async () => {
      const partnerId = await makeActivePartner(
        'Ended Campaign Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'ENDED');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      await campaignsService.update(campaign.id, await adminActorId(), {
        status: ReferralCampaignStatus.ENDED,
      });

      const booking = await makeBooking(
        'ended-campaign',
        13,
        click!.attributionToken,
      );
      const [row] = await dataSource.query(
        `SELECT * FROM booking_referral_attribution WHERE booking_id = $1`,
        [booking.id],
      );
      expect(row).toBeUndefined();
    });

    it('does not attribute when the partner was suspended after the click but before booking', async () => {
      const partnerId = await makeActivePartner(
        'Suspended-After-Click Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'SUSPAFTER');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      await partnersService.changeStatus(partnerId, await adminActorId(), {
        status: PartnerStatus.SUSPENDED,
        reason: 'Test',
      });

      const booking = await makeBooking(
        'suspended-after',
        14,
        click!.attributionToken,
      );
      const [row] = await dataSource.query(
        `SELECT * FROM booking_referral_attribution WHERE booking_id = $1`,
        [booking.id],
      );
      expect(row).toBeUndefined();
    });

    it('is idempotent under a race/duplicate call for the same booking — exactly one attribution row survives', async () => {
      const partnerId = await makeActivePartner(
        'Race Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        1000,
      );
      const campaign = await makeCampaign(partnerId, 'RACE');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });
      const booking = await makeBooking('race', 15); // created WITHOUT attribution — we'll race the attribution write directly below

      const results = await Promise.all([
        trackingService.attributeBooking(
          dataSource.manager,
          booking.id,
          click!.attributionToken,
        ),
        trackingService.attributeBooking(
          dataSource.manager,
          booking.id,
          click!.attributionToken,
        ),
      ]);
      expect(results.filter((r) => r !== null)).toHaveLength(1); // one writer wins, the other sees the unique-violation no-op

      const rows = await dataSource.query(
        `SELECT id FROM booking_referral_attribution WHERE booking_id = $1`,
        [booking.id],
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // Commission ledger hook + cancellation reversal (§31.3) — the actual
  // money-correctness rules, exercised through the real checkout/webhook/
  // refund flow (same discipline as payments.e2e-spec.ts).
  // ---------------------------------------------------------------------
  describe('commission ledger hook and cancellation handling (§31.3)', () => {
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

    it('writes a PARTNER_COMMISSION ledger entry (percentage-of-platform-fee) on booking confirmation, and reverses it proportionally on a 100% refund', async () => {
      const partnerId = await makeActivePartner(
        'Commission Partner',
        PartnerCommissionType.PERCENTAGE_OF_PLATFORM_FEE,
        2000,
      ); // 20.00%
      const campaign = await makeCampaign(partnerId, 'COMM');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });

      const booking = await makeBooking(
        'commission',
        20,
        click!.attributionToken,
      );
      const totalAmount = Number(booking.totalAmount);
      const session = await paymentsService.createCheckoutSession(null, {
        bookingId: booking.id,
        provider: 'PAYRIFF' as any,
      });
      await paymentsService.handleWebhook(
        'PAYRIFF' as any,
        payriffWebhookPayload(
          session.paymentId,
          `payriff-ext-${suffix}-commission`,
          totalAmount,
        ),
        undefined,
      );

      const entries = await dataSource.query(
        `SELECT entry_type, amount, partner_id FROM ledger_entry WHERE booking_id = $1`,
        [booking.id],
      );
      const byType: Record<string, any> = Object.fromEntries(
        entries.map((e: any) => [e.entry_type, e]),
      );

      const expectedPlatformFee = Math.round(totalAmount * 0.12); // PLATFORM_DEFAULT_COMMISSION_PERCENTAGE default
      const expectedPartnerCommission = Math.round(expectedPlatformFee * 0.2); // 20% of the platform fee, NOT of gross or of provider net (§31.3)
      expect(byType.PARTNER_COMMISSION).toBeDefined();
      expect(byType.PARTNER_COMMISSION.partner_id).toBe(partnerId);
      expect(Number(byType.PARTNER_COMMISSION.amount)).toBe(
        expectedPartnerCommission,
      );
      // §31.3's central invariant: PROVIDER_NET is completely unaffected by partner commission — it's an additional row, never a deduction.
      expect(Number(byType.PROVIDER_NET.amount)).toBe(
        totalAmount - expectedPlatformFee - Math.round(totalAmount * 0.03),
      );

      const [{ customer_user_id: customerUserId }] = await dataSource.query(
        `SELECT customer_user_id FROM booking WHERE id = $1`,
        [booking.id],
      );
      const refund = await refundsService.requestRefund(customerUserId, {
        bookingId: booking.id,
        reason: 'Test cancellation',
      });
      expect(refund.status).toBe('REQUESTED'); // outside the default 24h free-cancellation window -> 100% refund, above the 0 auto-approve limit -> booking cancels immediately, money movement awaits approval
      const approved = await refundsService.approve(
        refund.id,
        await adminActorId(),
        RoleName.SUPER_ADMIN,
      );
      expect(['APPROVED', 'PROCESSING', 'COMPLETED']).toContain(
        approved.status,
      );

      const afterRefundEntries = await dataSource.query(
        `SELECT entry_type, amount, partner_id FROM ledger_entry WHERE booking_id = $1 AND partner_id = $2 ORDER BY created_at`,
        [booking.id, partnerId],
      );
      // §31.3: "An offsetting REFUND-type partner ledger entry is written" (explicitly REFUND, never a silent edit of the original row).
      const partnerReversal = afterRefundEntries.find(
        (e: any) => e.entry_type === 'REFUND',
      );
      expect(partnerReversal).toBeDefined();
      expect(Number(partnerReversal.amount)).toBe(-expectedPartnerCommission); // 100% reversal
      const partnerLedgerTotal = afterRefundEntries.reduce(
        (sum: number, e: any) => sum + Number(e.amount),
        0,
      );
      expect(partnerLedgerTotal).toBe(0); // fully netted to zero — nothing owed, nothing overpaid
    });

    it('writes no PARTNER_COMMISSION entry for a booking with no referral attribution', async () => {
      const booking = await makeBooking('no-attribution', 21, null);
      const session = await paymentsService.createCheckoutSession(null, {
        bookingId: booking.id,
        provider: 'PAYRIFF' as any,
      });
      await paymentsService.handleWebhook(
        'PAYRIFF' as any,
        payriffWebhookPayload(
          session.paymentId,
          `payriff-ext-${suffix}-no-attr`,
          Number(booking.totalAmount),
        ),
        undefined,
      );

      const [partnerEntry] = await dataSource.query(
        `SELECT * FROM ledger_entry WHERE booking_id = $1 AND entry_type = 'PARTNER_COMMISSION'`,
        [booking.id],
      );
      expect(partnerEntry).toBeUndefined();
    });

    it('batches a confirmed, past-eligibility PARTNER_COMMISSION into a real Payout and marks it PAID (14_PAYOUT_LEDGER.md §14.5a generic payee machinery)', async () => {
      const partnerId = await makeActivePartner(
        'Payout Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        750,
      );
      const campaign = await makeCampaign(partnerId, 'PAYOUT');
      const click = await trackingService.trackClick({
        code: campaign.code,
        ipHash: null,
        landingPath: '/',
      });

      const booking = await makeBooking('payout', 22, click!.attributionToken);
      const session = await paymentsService.createCheckoutSession(null, {
        bookingId: booking.id,
        provider: 'PAYRIFF' as any,
      });
      await paymentsService.handleWebhook(
        'PAYRIFF' as any,
        payriffWebhookPayload(
          session.paymentId,
          `payriff-ext-${suffix}-payout`,
          Number(booking.totalAmount),
        ),
        undefined,
      );

      // Eligibility requires the booking's start time to be in the past
      // (14_PAYOUT_LEDGER.md §14.3) — move it back, same technique as
      // payouts.e2e-spec.ts, spaced well clear of any other test's slot.
      await dataSource.query(
        `UPDATE booking_item SET start_at = now() - interval '2 days', end_at = now() - interval '2 days' + interval '2 hours' WHERE booking_id = $1`,
        [booking.id],
      );

      const payouts = await payoutsService.runPayoutBatch(
        new Date(Date.now() - 30 * 86_400_000),
        new Date(),
        await adminActorId(),
      );
      const partnerPayout = payouts.find((p) => p.partnerId === partnerId);
      expect(partnerPayout).toBeDefined();
      expect(partnerPayout!.status).toBe(PayoutStatus.AVAILABLE);
      expect(Number(partnerPayout!.amount)).toBe(750);

      await payoutsService.markProcessing(
        partnerPayout!.id,
        await adminActorId(),
      );
      // No linked owner account yet in V1 (§31.7) — markPaid must still
      // succeed and simply skip the in-app notification (payouts.service.ts's
      // notifyPartnerPaid no-op path), never throw a FK violation.
      const paid = await payoutsService.markPaid(
        partnerPayout!.id,
        await adminActorId(),
        'TEST-BANK-REF-001',
      );
      expect(paid.status).toBe(PayoutStatus.PAID);

      const balance = await payoutsService.getBalance('partner_id', partnerId);
      expect(balance.paid).toBeGreaterThanOrEqual(750);
    });
  });

  // ---------------------------------------------------------------------
  // Admin service layer: partner CRUD, status transitions, campaigns
  // ---------------------------------------------------------------------
  describe('PartnersService admin CRUD', () => {
    it('creates a partner PENDING and rejects an invalid status transition (ACTIVE cannot go back to PENDING)', async () => {
      const partner = await partnersService.create(await adminActorId(), {
        name: `${suffix} Lifecycle Partner`,
        type: 'AGENCY' as any,
        defaultCommissionType: PartnerCommissionType.FIXED_PER_BOOKING,
        defaultCommissionValue: 100,
      });
      createdPartnerIds.push(partner.id);
      expect(partner.status).toBe(PartnerStatus.PENDING);

      const activated = await partnersService.changeStatus(
        partner.id,
        await adminActorId(),
        { status: PartnerStatus.ACTIVE, reason: 'Approved' },
      );
      expect(activated.status).toBe(PartnerStatus.ACTIVE);

      await expect(
        partnersService.changeStatus(partner.id, await adminActorId(), {
          status: PartnerStatus.PENDING,
          reason: 'Invalid',
        }),
      ).rejects.toBeInstanceOf(DomainException);
    });

    it('rejects a duplicate campaign code', async () => {
      const partnerId = await makeActivePartner(
        'Dup Code Partner',
        PartnerCommissionType.FIXED_PER_BOOKING,
        500,
      );
      const code = `${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}DUPCODE`;
      await campaignsService.create(partnerId, await adminActorId(), {
        name: 'first',
        code,
      } as any);
      await expect(
        campaignsService.create(partnerId, await adminActorId(), {
          name: 'second',
          code,
        } as any),
      ).rejects.toBeInstanceOf(DomainException);
    });

    it('404s looking up a partner that does not exist', async () => {
      await expect(
        partnersService.findById('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  // ---------------------------------------------------------------------
  // Analytics + partner isolation
  // ---------------------------------------------------------------------
  describe('PartnerAnalyticsService', () => {
    it("scopes clicks/attributed-bookings strictly per partner — one partner never sees another partner's figures", async () => {
      const partnerA = await makeActivePartner(
        'Isolation A',
        PartnerCommissionType.FIXED_PER_BOOKING,
        500,
      );
      const campaignA = await makeCampaign(partnerA, 'ISOA');
      const clickA1 = await trackingService.trackClick({
        code: campaignA.code,
        ipHash: null,
        landingPath: '/',
      });
      await trackingService.trackClick({
        code: campaignA.code,
        ipHash: null,
        landingPath: '/',
      }); // second click, no booking
      await makeBooking('isolation-a', 25, clickA1!.attributionToken);

      const partnerB = await makeActivePartner(
        'Isolation B',
        PartnerCommissionType.FIXED_PER_BOOKING,
        500,
      );
      const campaignB = await makeCampaign(partnerB, 'ISOB');
      await trackingService.trackClick({
        code: campaignB.code,
        ipHash: null,
        landingPath: '/',
      }); // one click, no booking

      const analyticsA = await analyticsService.forPartner(partnerA);
      const analyticsB = await analyticsService.forPartner(partnerB);

      expect(analyticsA.clicks).toBe(2);
      expect(analyticsA.attributedBookings).toBe(1);
      expect(analyticsB.clicks).toBe(1);
      expect(analyticsB.attributedBookings).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // HTTP guard surface: admin authorization / unauthorized access.
  // Needs the FULL AppModule (APP_GUARD providers live there, not in any
  // one feature module), so this block boots and tears down its own app
  // instance rather than reusing the service-level TestAppModule above.
  // ---------------------------------------------------------------------
  describe('Admin HTTP authorization (full AppModule)', () => {
    let httpApp: INestApplication;
    let jwtService: JwtService;

    function tokenFor(
      roles: { role: RoleName; providerId: string | null }[],
    ): string {
      return jwtService.sign(
        {
          sub: '00000000-0000-0000-0000-000000000099',
          email: 'admin-auth-test@example.com',
          phone: null,
          roles,
        },
        {
          secret:
            process.env.JWT_ACCESS_SECRET ||
            'DEV_ONLY_INSECURE_SECRET_CHANGE_ME',
          expiresIn: '15m',
        },
      );
    }

    beforeAll(async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      httpApp = moduleFixture.createNestApplication();
      httpApp.setGlobalPrefix('api/v1', { exclude: ['r/:code'] });
      await httpApp.init();
      jwtService = httpApp.get(JwtService);
    }, 30_000);

    afterAll(async () => {
      await httpApp.close();
    });

    it('rejects an unauthenticated request to an admin partners endpoint with 401', async () => {
      await request(httpApp.getHttpServer())
        .get('/api/v1/admin/partners')
        .expect(401);
    });

    it('rejects a request from a non-admin role (CUSTOMER) with 403', async () => {
      const token = tokenFor([{ role: RoleName.CUSTOMER, providerId: null }]);
      await request(httpApp.getHttpServer())
        .get('/api/v1/admin/partners')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejects an admin role that lacks partner.read (CONTENT_ADMIN) with 403', async () => {
      const token = tokenFor([
        { role: RoleName.CONTENT_ADMIN, providerId: null },
      ]);
      await request(httpApp.getHttpServer())
        .get('/api/v1/admin/partners')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('allows an authorized admin role (OPERATIONS_ADMIN, which holds partner.read) through to a 200', async () => {
      const token = tokenFor([
        { role: RoleName.OPERATIONS_ADMIN, providerId: null },
      ]);
      await request(httpApp.getHttpServer())
        .get('/api/v1/admin/partners')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('GET /r/:code (public, no auth) redirects even for an unknown code — never a 401/403/404', async () => {
      const res = await request(httpApp.getHttpServer()).get(
        '/r/NO-SUCH-CODE-AT-ALL',
      );
      expect(res.status).toBe(302);
    });
  });
});
