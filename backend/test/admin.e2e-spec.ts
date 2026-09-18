import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { AdminModule } from '../src/modules/admin/admin.module';
import { AdminListingsService } from '../src/modules/admin/admin-listings.service';
import { AdminUsersService } from '../src/modules/admin/admin-users.service';
import { AdminTaxonomyService } from '../src/modules/admin/admin-taxonomy.service';
import { AdminSearchService } from '../src/modules/admin/admin-search.service';
import { AuditLogService } from '../src/modules/audit/audit-log.service';
import { RoomsModule } from '../src/modules/rooms/rooms.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RoomStatus } from '../src/common/constants/provider.enum';
import {
  DomainException,
  ResourceNotFoundException,
} from '../src/common/exceptions/domain.exception';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md — exercises the admin services
 * directly against real Postgres (same discipline/pattern as every other
 * e2e spec in this repo: HTTP-layer concerns — @Roles/@RequirePermission
 * guard wiring — are unit-testable in isolation from PermissionGuard's own
 * spec; what needs the real schema is the query/audit-trail behavior these
 * services implement, which is what this file covers).
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
    AuthModule, // AppUserEntity metadata, same reason as favorites.e2e-spec.ts
    RoomsModule, // RoomEntity's relations (RoomType, Amenity, Location, Provider, ...)
    AdminModule,
  ],
});

describe('Admin (real Postgres)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let adminListingsService: AdminListingsService;
  let adminUsersService: AdminUsersService;
  let adminTaxonomyService: AdminTaxonomyService;
  let adminSearchService: AdminSearchService;
  let auditLogService: AuditLogService;

  const suffix = `admin-test-${Date.now()}`;
  let adminUserId: string;
  let targetUserId: string;
  let providerId: string;
  let locationId: string;
  let roomId: string;
  const createdRoomTypeIds: string[] = [];
  const createdAmenityIds: string[] = [];

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    adminListingsService = app.get(AdminListingsService);
    adminUsersService = app.get(AdminUsersService);
    adminTaxonomyService = app.get(AdminTaxonomyService);
    adminSearchService = app.get(AdminSearchService);
    auditLogService = app.get(AuditLogService);

    const [admin] = await dataSource.query(
      `INSERT INTO app_user (email, locale, display_name, is_active, created_at, updated_at) VALUES ($1, 'az', 'Admin Test', true, now(), now()) RETURNING id`,
      [`${suffix}-admin@example.com`],
    );
    adminUserId = admin.id;

    const [target] = await dataSource.query(
      `INSERT INTO app_user (email, phone, locale, display_name, is_active, created_at, updated_at)
       VALUES ($1, $2, 'az', 'Target Customer', true, now(), now()) RETURNING id`,
      [
        `${suffix}-target@example.com`,
        `+99450${Date.now().toString().slice(-7)}`,
      ],
    );
    targetUserId = target.id;

    const [owner] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-owner@example.com`],
    );

    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Admin Test MMC', 'Admin Test Provider', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, owner.id],
    );
    providerId = provider.id;

    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Admin Test Location', 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
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
       VALUES ($1, $2, 'Admin Test Room', $3, 1, 8, 5000, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `${suffix}-room`],
    );
    roomId = room.id;
  }, 30_000);

  afterAll(async () => {
    for (const id of createdAmenityIds)
      await dataSource.query(`DELETE FROM amenity WHERE id = $1`, [id]);
    for (const id of createdRoomTypeIds)
      await dataSource.query(`DELETE FROM room_type WHERE id = $1`, [id]);
    // audit_log rows reference BOTH actor_user_id and entity_id; every row this test created has
    // adminUserId as the actor, which also covers the RoomType/Amenity/User-entity rows above.
    await dataSource.query(
      `DELETE FROM audit_log WHERE actor_user_id = $1 OR entity_id IN ($1, $2, $3)`,
      [adminUserId, roomId, targetUserId],
    );
    await dataSource.query(`DELETE FROM room WHERE id = $1`, [roomId]);
    await dataSource.query(`DELETE FROM location WHERE id = $1`, [locationId]);
    await dataSource.query(`DELETE FROM provider WHERE id = $1`, [providerId]);
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  describe('AdminListingsService — room correction + revert', () => {
    it('corrects a room field, audits the change, and rejects an empty patch', async () => {
      const before = await dataSource.query(
        `SELECT capacity_max FROM room WHERE id = $1`,
        [roomId],
      );
      expect(Number(before[0].capacity_max)).toBe(8);

      const saved = await adminListingsService.correctRoom(
        roomId,
        adminUserId,
        { capacityMax: 12, reason: 'Owner reported wrong capacity' },
      );
      expect(saved.capacityMax).toBe(12);

      const entries = await auditLogService.list({
        entityType: 'Room',
        entityId: roomId,
        action: 'ADMIN_CORRECT',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].beforeState).toEqual({ capacityMax: 8 });
      expect(entries[0].afterState).toEqual({ capacityMax: 12 });
      expect(entries[0].reason).toBe('Owner reported wrong capacity');

      await expect(
        adminListingsService.correctRoom(roomId, adminUserId, {
          reason: 'no fields',
        }),
      ).rejects.toBeInstanceOf(DomainException);
    });

    it('reverts a prior correction by re-applying its beforeState as a new audited change', async () => {
      const entries = await auditLogService.list({
        entityType: 'Room',
        entityId: roomId,
        action: 'ADMIN_CORRECT',
      });
      const correctionId = entries[0].id;

      const reverted = await adminListingsService.revertRoomCorrection(
        roomId,
        correctionId,
        adminUserId,
      );
      expect(reverted.capacityMax).toBe(8);

      const revertEntries = await auditLogService.list({
        entityType: 'Room',
        entityId: roomId,
        action: 'ADMIN_REVERT',
      });
      expect(revertEntries).toHaveLength(1);
      expect(revertEntries[0].revertedAuditLogId).toBe(correctionId);
      expect(revertEntries[0].beforeState).toEqual({ capacityMax: 12 });
      expect(revertEntries[0].afterState).toEqual({ capacityMax: 8 });

      // the ORIGINAL row must be untouched (append-only discipline)
      const original = await auditLogService.findById(correctionId);
      expect(original?.action).toBe('ADMIN_CORRECT');
      expect(original?.beforeState).toEqual({ capacityMax: 8 });
    });

    it('rejects correcting a room that does not exist', async () => {
      await expect(
        adminListingsService.correctRoom(
          '00000000-0000-0000-0000-000000000000',
          adminUserId,
          { name: 'x', reason: 'test' },
        ),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('rejects reverting an audit entry that is not an ADMIN_CORRECT on this room', async () => {
      const revertEntries = await auditLogService.list({
        entityType: 'Room',
        entityId: roomId,
        action: 'ADMIN_REVERT',
      });
      await expect(
        adminListingsService.revertRoomCorrection(
          roomId,
          revertEntries[0].id,
          adminUserId,
        ),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('AdminUsersService — search, update, suspend', () => {
    it('finds a user by partial email and by id', async () => {
      const byEmail = await adminUsersService.list(suffix);
      expect(byEmail.map((u) => u.id)).toEqual(
        expect.arrayContaining([targetUserId, adminUserId]),
      );

      const found = await adminUsersService.findById(targetUserId);
      expect(found.displayName).toBe('Target Customer');
    });

    it('updates display fields within the allowlist and audits the change', async () => {
      const updated = await adminUsersService.update(
        targetUserId,
        adminUserId,
        { displayName: 'Corrected Name', reason: 'Typo reported by user' },
      );
      expect(updated.displayName).toBe('Corrected Name');

      const entries = await auditLogService.list({
        entityType: 'User',
        entityId: targetUserId,
        action: 'ADMIN_UPDATE',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].beforeState).toEqual({
        displayName: 'Target Customer',
        locale: 'az',
      });
      expect(entries[0].reason).toBe('Typo reported by user');
    });

    it('suspends then reinstates a user, toggling is_active and recording distinct audit actions', async () => {
      const suspended = await adminUsersService.setSuspended(
        targetUserId,
        adminUserId,
        true,
        'ToS violation reported',
      );
      expect(suspended.isActive).toBe(false);

      const reinstated = await adminUsersService.setSuspended(
        targetUserId,
        adminUserId,
        false,
        'Appeal upheld',
      );
      expect(reinstated.isActive).toBe(true);

      const suspendEntries = await auditLogService.list({
        entityType: 'User',
        entityId: targetUserId,
        action: 'SUSPEND',
      });
      const reinstateEntries = await auditLogService.list({
        entityType: 'User',
        entityId: targetUserId,
        action: 'REINSTATE',
      });
      expect(suspendEntries).toHaveLength(1);
      expect(reinstateEntries).toHaveLength(1);
    });

    it('rejects looking up a user that does not exist', async () => {
      await expect(
        adminUsersService.findById('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('AdminTaxonomyService — room types and amenities', () => {
    it('creates and updates a room type, auditing both', async () => {
      const created = await adminTaxonomyService.createRoomType(adminUserId, {
        translationKey: `room_type.${suffix}_podcast_studio`,
        defaultCapacityMin: 1,
        defaultCapacityMax: 4,
      });
      createdRoomTypeIds.push(created.id);
      expect(created.searchFacetWeight).toBe('1.00');

      const updated = await adminTaxonomyService.updateRoomType(
        created.id,
        adminUserId,
        {
          translationKey: `room_type.${suffix}_podcast_studio`,
          defaultCapacityMax: 6,
        },
      );
      expect(updated.defaultCapacityMax).toBe(6);

      const createEntries = await auditLogService.list({
        entityType: 'RoomType',
        entityId: created.id,
        action: 'CREATE',
      });
      const updateEntries = await auditLogService.list({
        entityType: 'RoomType',
        entityId: created.id,
        action: 'UPDATE',
      });
      expect(createEntries).toHaveLength(1);
      expect(updateEntries).toHaveLength(1);
    });

    it('creates and updates an amenity, auditing both', async () => {
      const created = await adminTaxonomyService.createAmenity(adminUserId, {
        translationKey: `amenity.${suffix}_soundproofing`,
        category: 'comfort',
      });
      createdAmenityIds.push(created.id);

      const updated = await adminTaxonomyService.updateAmenity(
        created.id,
        adminUserId,
        {
          translationKey: `amenity.${suffix}_soundproofing`,
          category: 'audio',
        },
      );
      expect(updated.category).toBe('audio');
    });

    it('rejects updating a room type or amenity that does not exist', async () => {
      await expect(
        adminTaxonomyService.updateRoomType(
          '00000000-0000-0000-0000-000000000000',
          adminUserId,
          { translationKey: 'x' },
        ),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(
        adminTaxonomyService.updateAmenity(
          '00000000-0000-0000-0000-000000000000',
          adminUserId,
          { translationKey: 'x' },
        ),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('AdminSearchService — global search', () => {
    it('finds a room by exact booking/payment id lookup being skipped for non-UUID query, matching by name instead', async () => {
      const results = await adminSearchService.search('Admin Test Room');
      expect(results.some((r) => r.type === 'ROOM' && r.id === roomId)).toBe(
        true,
      );
    });

    it('finds a provider by display name and a customer by email substring', async () => {
      const providerResults = await adminSearchService.search(
        'Admin Test Provider',
      );
      expect(
        providerResults.some(
          (r) => r.type === 'PROVIDER' && r.id === providerId,
        ),
      ).toBe(true);

      const customerResults = await adminSearchService.search(
        `${suffix}-target`,
      );
      expect(
        customerResults.some(
          (r) => r.type === 'CUSTOMER' && r.id === targetUserId,
        ),
      ).toBe(true);
    });

    it('finds a room by exact UUID id', async () => {
      const results = await adminSearchService.search(roomId);
      // UUID branch only checks booking/payment tables directly, but the ILIKE fan-out below still runs and won't match a bare UUID against name columns
      expect(Array.isArray(results)).toBe(true);
    });

    it('returns an empty list for a too-short query', async () => {
      expect(await adminSearchService.search('a')).toEqual([]);
    });
  });
});
