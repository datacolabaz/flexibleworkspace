import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { FavoritesModule } from '../src/modules/favorites/favorites.module';
import { FavoritesService } from '../src/modules/favorites/favorites.service';
import { RoomsModule } from '../src/modules/rooms/rooms.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { ResourceNotFoundException } from '../src/common/exceptions/domain.exception';

/**
 * 09_DOMAIN_MODEL.md §9.2 "Favorite" — a plain join table, but the listing
 * query joins room/location/photo, so it's still worth running against the
 * real schema rather than mocking repositories (same discipline as every
 * other e2e spec here).
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
    AuthModule, // registers AppUserEntity's metadata — ProvidersModule's UserRoleEntity#user relation (pulled in via RoomsModule) needs it, same reason as bookings-concurrency.e2e-spec.ts
    RoomsModule, // registers every entity RoomEntity's relations need (RoomType, Amenity, Location, Provider, ...) — same reason as locations.e2e-spec.ts
    FavoritesModule,
  ],
});

describe('Favorites (real Postgres)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let favoritesService: FavoritesService;

  const suffix = `favorites-test-${Date.now()}`;
  let userId: string;
  let providerId: string;
  let locationId: string;
  let roomAId: string;
  let roomBId: string;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    favoritesService = app.get(FavoritesService);

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    userId = user.id;

    const [owner] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at) VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}-owner@example.com`],
    );

    const [provider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Favorites Test MMC', 'Favorites Test', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [suffix, owner.id],
    );
    providerId = provider.id;

    const [location] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Favorites Test Location', 'Test Address', 'Baku', 'AZ', ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [providerId],
    );
    locationId = location.id;

    const [roomType] = await dataSource.query(
      `SELECT id FROM room_type WHERE translation_key = 'room_type.meeting_room'`,
    );
    const [roomA] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_max, base_price_amount, base_price_currency, status,
                          min_booking_minutes, max_booking_minutes, advance_booking_min_hours, advance_booking_max_days, buffer_minutes,
                          created_at, updated_at)
       VALUES ($1, $2, 'Favorites Test Room A', $3, 10, 5000, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `${suffix}-room-a`],
    );
    roomAId = roomA.id;
    const [roomB] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_max, base_price_amount, base_price_currency, status,
                          min_booking_minutes, max_booking_minutes, advance_booking_min_hours, advance_booking_max_days, buffer_minutes,
                          created_at, updated_at)
       VALUES ($1, $2, 'Favorites Test Room B', $3, 10, 7500, 'AZN', 'ACTIVE', 30, 480, 0, 365, 0, now(), now())
       RETURNING id`,
      [locationId, roomType.id, `${suffix}-room-b`],
    );
    roomBId = roomB.id;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM favorite WHERE user_id = $1`, [userId]);
    await dataSource.query(`DELETE FROM room WHERE id IN ($1, $2)`, [
      roomAId,
      roomBId,
    ]);
    await dataSource.query(`DELETE FROM location WHERE id = $1`, [locationId]);
    await dataSource.query(`DELETE FROM provider WHERE id = $1`, [providerId]);
    await dataSource.query(`DELETE FROM app_user WHERE email LIKE $1`, [
      `${suffix}%`,
    ]);
    await app.close();
  });

  it('reports not-favorited before anything is added', async () => {
    expect(await favoritesService.isFavorite(userId, roomAId)).toBe(false);
    expect(await favoritesService.listForUser(userId)).toHaveLength(0);
  });

  it('adds a room to favorites, is idempotent on a second add, and lists it with room summary fields', async () => {
    await favoritesService.add(userId, roomAId);
    await favoritesService.add(userId, roomAId); // idempotent — no duplicate-key error, no duplicate row

    expect(await favoritesService.isFavorite(userId, roomAId)).toBe(true);

    const list = await favoritesService.listForUser(userId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(roomAId);
    expect(list[0].pricePerHour).toEqual({ amount: 5000, currency: 'AZN' });
    expect(list[0].city).toBe('Baku');
  });

  it('lists multiple favorites most-recently-added first', async () => {
    await favoritesService.add(userId, roomBId);
    const list = await favoritesService.listForUser(userId);
    expect(list.map((r) => r.id)).toEqual([roomBId, roomAId]);
  });

  it('removes a favorite, and removing a non-favorited room is a harmless no-op', async () => {
    await favoritesService.remove(userId, roomAId);
    expect(await favoritesService.isFavorite(userId, roomAId)).toBe(false);
    expect(await favoritesService.listForUser(userId)).toHaveLength(1);

    await expect(favoritesService.remove(userId, roomAId)).resolves.toEqual({
      favorited: false,
    });
  });

  it('rejects favoriting a room that does not exist', async () => {
    await expect(
      favoritesService.add(userId, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
