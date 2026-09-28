import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { AdminListingsService } from '../src/modules/admin/admin-listings.service';
import { AuditLogService } from '../src/modules/audit/audit-log.service';
import { AuditModule } from '../src/modules/audit/audit.module';
import { RoomsModule } from '../src/modules/rooms/rooms.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import {
  DomainException,
  ResourceNotFoundException,
} from '../src/common/exceptions/domain.exception';

/**
 * 1700000000039-RoomPremium.ts — `AdminListingsService.setPremium()`, the
 * admin-only, offline-paid, category-scoped premium ranking control.
 *
 * Deliberately NOT bootstrapped from `AdminModule` (unlike admin.e2e-spec.ts):
 * `AdminModule` also registers `BookingEntity` directly (for
 * `AdminDashboardService`), and `BookingEntity#items` only resolves when
 * `BookingsModule` — with its own large import graph (Notifications,
 * Partners, Promo, Providers) — is also in the module tree. Booking/payment
 * modules are explicitly out of scope for this feature, so this spec
 * composes the minimal tree `AdminListingsService` actually needs: its own
 * `RoomEntity` repo (via `RoomsModule`), `AuditLogService` (via
 * `AuditModule`), and `AppUserEntity`/`UserRoleEntity` (via `AuthModule`,
 * required because `RoomsModule` → `ProvidersModule` registers
 * `UserRoleEntity`, whose relation target `AppUserEntity` must be
 * registered too) — nothing booking- or payment-related.
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
    RoomsModule,
    AuditModule,
    AuthModule,
  ],
  providers: [AdminListingsService],
});

describe('AdminListingsService.setPremium (real Postgres)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let adminListingsService: AdminListingsService;
  let auditLogService: AuditLogService;

  const suffix = `admin-premium-test-${Date.now()}`;
  let adminUserId: string;
  let ownerUserId: string;
  let providerId: string;
  let locationId: string;
  let roomId: string;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    adminListingsService = app.get(AdminListingsService);
    auditLogService = app.get(AuditLogService);

    const [admin] = await dataSource.query(
      `INSERT INTO app_user (email, locale, display_name, is_active, created_at, updated_at) VALUES ($1, 'az', 'Premium Admin Test', true, now(), now()) RETURNING id`,
      [`${suffix}-admin@example.com`],
    );
    adminUserId = admin.id;

    const [owner] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-owner@example.com`],
    );
    ownerUserId = owner.id;

    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Premium Admin Test MMC', 'Premium Admin Test Provider', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, ownerUserId],
    );
    providerId = provider.id;

    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Premium Admin Test Location', 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [providerId],
    );
    locationId = location.id;

    const [roomType] = await dataSource.query(
      `SELECT id FROM room_type WHERE translation_key = 'room_type.meeting_room'`,
    );
    const [room] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_min, capacity_max, base_price_amount, base_price_currency, status,
                          min_booking_minutes, max_booking_minutes, advance_booking_min_hours, advance_booking_max_days, buffer_minutes,
                          created_at, updated_at)
       VALUES ($1, $2, 'Premium Admin Test Room', $3, 1, 8, 5000, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `${suffix}-room`],
    );
    roomId = room.id;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM audit_log WHERE actor_user_id = $1 OR entity_id = $2`,
      [adminUserId, roomId],
    );
    await dataSource.query(`DELETE FROM room WHERE id = $1`, [roomId]);
    await dataSource.query(`DELETE FROM location WHERE id = $1`, [locationId]);
    await dataSource.query(`DELETE FROM provider WHERE id = $1`, [providerId]);
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  it('defaults a freshly-seeded room to isPremium=false (backward compatibility)', async () => {
    const rows = await dataSource.query(
      `SELECT is_premium, premium_priority, premium_starts_at, premium_ends_at, premium_internal_note FROM room WHERE id = $1`,
      [roomId],
    );
    expect(rows[0].is_premium).toBe(false);
    expect(rows[0].premium_priority).toBeNull();
    expect(rows[0].premium_starts_at).toBeNull();
    expect(rows[0].premium_ends_at).toBeNull();
    expect(rows[0].premium_internal_note).toBeNull();
  });

  it('activates premium with a priority, window, and internal note, and audits the change', async () => {
    const startsAt = new Date(Date.now() - 3_600_000).toISOString(); // 1h ago
    const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); // +30d

    const saved = await adminListingsService.setPremium(roomId, adminUserId, {
      isPremium: true,
      priority: 1,
      startsAt,
      endsAt,
      internalNote: 'Paid via WhatsApp, invoice #123',
    });
    expect(saved.isPremium).toBe(true);
    expect(saved.premiumPriority).toBe(1);
    expect(saved.premiumInternalNote).toBe('Paid via WhatsApp, invoice #123');

    const entries = await auditLogService.list({
      entityType: 'Room',
      entityId: roomId,
      action: 'ADMIN_PREMIUM_UPDATE',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].beforeState).toMatchObject({ isPremium: false });
    expect(entries[0].afterState).toMatchObject({
      isPremium: true,
      premiumPriority: 1,
    });
  });

  it('leaves priority/dates/note unchanged when only isPremium is sent', async () => {
    const saved = await adminListingsService.setPremium(roomId, adminUserId, {
      isPremium: true,
    });
    expect(saved.premiumPriority).toBe(1); // unchanged from the previous test
    expect(saved.premiumInternalNote).toBe('Paid via WhatsApp, invoice #123');
    expect(saved.premiumStartsAt).not.toBeNull();
    expect(saved.premiumEndsAt).not.toBeNull();
  });

  it('rejects a premium window where endsAt is not after startsAt', async () => {
    await expect(
      adminListingsService.setPremium(roomId, adminUserId, {
        isPremium: true,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it('clears the active window by sending explicit nulls', async () => {
    const saved = await adminListingsService.setPremium(roomId, adminUserId, {
      isPremium: true,
      startsAt: null,
      endsAt: null,
    });
    expect(saved.premiumStartsAt).toBeNull();
    expect(saved.premiumEndsAt).toBeNull();
  });

  it('deactivates premium and audits the change', async () => {
    const saved = await adminListingsService.setPremium(roomId, adminUserId, {
      isPremium: false,
    });
    expect(saved.isPremium).toBe(false);

    const entries = await auditLogService.list({
      entityType: 'Room',
      entityId: roomId,
      action: 'ADMIN_PREMIUM_UPDATE',
    });
    expect(entries[0].afterState).toMatchObject({ isPremium: false }); // most recent first
  });

  it('rejects setting premium on a room that does not exist', async () => {
    await expect(
      adminListingsService.setPremium(
        '00000000-0000-0000-0000-000000000000',
        adminUserId,
        { isPremium: true },
      ),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it("surfaces the premium fields (incl. the admin-only internal note) and the room's category via listRooms()", async () => {
    await adminListingsService.setPremium(roomId, adminUserId, {
      isPremium: true,
      priority: 2,
      internalNote: 'Renewed for another month',
    });
    const rows = await adminListingsService.listRooms(
      'Premium Admin Test Room',
    );
    const row = rows.find((r) => r.id === roomId) as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.isPremium).toBe(true);
    expect(row.premiumPriority).toBe(2);
    expect(row.premiumInternalNote).toBe('Renewed for another month');
    expect(row.roomType).toBe('room_type.meeting_room');
  });
});
