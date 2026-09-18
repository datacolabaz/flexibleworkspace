import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { SearchModule } from '../src/modules/search/search.module';
import { SearchService } from '../src/modules/search/search.service';

/**
 * 16_SEARCH_ARCHITECTURE.md — search is one big composed SQL query (PostGIS
 * geo predicates, tsvector/trgm fuzzy match, live availability, relevance
 * scoring), so — like bookings-concurrency.e2e-spec.ts — this runs against
 * the REAL Postgres database rather than mocking the DataSource, because
 * what's under test is largely whether the SQL itself is correct.
 *
 * Bootstraps a minimal module tree (config + real TypeORM connection +
 * SearchModule) rather than the full AppModule, for the same reason as the
 * booking concurrency test: AppModule references sibling modules
 * (Payments/Payouts/Reviews/Favorites/Admin) not built yet and so doesn't
 * compile standalone.
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
    SearchModule,
  ],
});

describe('Search (real Postgres, real SQL)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let searchService: SearchService;

  let ownerUserId: string;
  let verifiedProviderId: string;
  let unverifiedProviderId: string;
  let bakuLocationId: string;
  let ganjaLocationId: string;
  let meetingRoomTypeId: string;
  let wifiAmenityId: string;
  let projectorAmenityId: string;

  // Rooms seeded for assertions:
  let cheapVerifiedRoomId: string; // Baku, meeting_room, wifi, cheap, near origin point
  let expensiveVerifiedRoomId: string; // Baku, meeting_room, wifi+projector, expensive, far from origin point
  let unverifiedRoomId: string; // Ganja, unverified provider — must never appear
  let draftRoomId: string; // Baku, verified provider, but status=DRAFT — must never appear
  const suffix = `search-test-${Date.now()}`;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    searchService = app.get(SearchService);

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    ownerUserId = user.id;

    const [verifiedProvider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Search Test Verified MMC', 'Search Test Verified', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [`${suffix}-verified`, ownerUserId],
    );
    verifiedProviderId = verifiedProvider.id;

    const [unverifiedProvider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Search Test Unverified MMC', 'Search Test Unverified', $1, $2, 'PENDING', 'FREE', now(), now()) RETURNING id`,
      [`${suffix}-unverified`, ownerUserId],
    );
    unverifiedProviderId = unverifiedProvider.id;

    // Baku location near a known point (Fountain Square, 49.8440/40.3730-ish) used as the search origin.
    const [baku] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, district, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Search Test Baku Location', 'Test Address 1', 'Baku', 'Nasimi', 'AZ',
               ST_SetSRID(ST_MakePoint(49.85, 40.38), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [verifiedProviderId],
    );
    bakuLocationId = baku.id;

    // Ganja location, far away, under the UNVERIFIED provider.
    const [ganja] = await dataSource.query(
      `INSERT INTO location (provider_id, name, address_line, city, district, country_code, geo, timezone, created_at, updated_at)
       VALUES ($1, 'Search Test Ganja Location', 'Test Address 2', 'Ganja', NULL, 'AZ',
               ST_SetSRID(ST_MakePoint(46.36, 40.68), 4326)::geography, 'Asia/Baku', now(), now())
       RETURNING id`,
      [unverifiedProviderId],
    );
    ganjaLocationId = ganja.id;

    const [roomType] = await dataSource.query(
      `SELECT id FROM room_type WHERE translation_key = 'room_type.meeting_room'`,
    );
    meetingRoomTypeId = roomType.id;
    const [wifi] = await dataSource.query(
      `SELECT id FROM amenity WHERE translation_key = 'amenity.wifi'`,
    );
    wifiAmenityId = wifi.id;
    const [projector] = await dataSource.query(
      `SELECT id FROM amenity WHERE translation_key = 'amenity.projector'`,
    );
    projectorAmenityId = projector.id;

    const [cheapRoom] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_min, capacity_max, base_price_amount, base_price_currency, status, average_rating, review_count, created_at, updated_at)
       VALUES ($1, $2, 'Cheap Verified Meeting Room', $3, 1, 4, 3000, 'AZN', 'ACTIVE', 4.5, 20, now(), now())
       RETURNING id`,
      [bakuLocationId, meetingRoomTypeId, `${suffix}-cheap`],
    );
    cheapVerifiedRoomId = cheapRoom.id;
    await dataSource.query(
      `INSERT INTO room_amenity (room_id, amenity_id) VALUES ($1, $2)`,
      [cheapVerifiedRoomId, wifiAmenityId],
    );

    const [expensiveRoom] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_min, capacity_max, base_price_amount, base_price_currency, status, average_rating, review_count, created_at, updated_at)
       VALUES ($1, $2, 'Expensive Verified Meeting Room', $3, 4, 20, 25000, 'AZN', 'ACTIVE', 4.9, 5, now(), now())
       RETURNING id`,
      [bakuLocationId, meetingRoomTypeId, `${suffix}-expensive`],
    );
    expensiveVerifiedRoomId = expensiveRoom.id;
    await dataSource.query(
      `INSERT INTO room_amenity (room_id, amenity_id) VALUES ($1, $2), ($1, $3)`,
      [expensiveVerifiedRoomId, wifiAmenityId, projectorAmenityId],
    );

    const [unverifiedRoom] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_min, capacity_max, base_price_amount, base_price_currency, status, created_at, updated_at)
       VALUES ($1, $2, 'Room Under Unverified Provider', $3, 1, 4, 3000, 'AZN', 'ACTIVE', now(), now())
       RETURNING id`,
      [ganjaLocationId, meetingRoomTypeId, `${suffix}-unverified-room`],
    );
    unverifiedRoomId = unverifiedRoom.id;

    const [draftRoom] = await dataSource.query(
      `INSERT INTO room (location_id, room_type_id, name, slug, capacity_min, capacity_max, base_price_amount, base_price_currency, status, created_at, updated_at)
       VALUES ($1, $2, 'Draft Room Not Yet Published', $3, 1, 4, 3000, 'AZN', 'DRAFT', now(), now())
       RETURNING id`,
      [bakuLocationId, meetingRoomTypeId, `${suffix}-draft`],
    );
    draftRoomId = draftRoom.id;

    // Wide-open weekly availability for the cheap room only, used by the live-availability test.
    for (let day = 0; day <= 6; day++) {
      await dataSource.query(
        `INSERT INTO availability_rule (room_id, recurrence_type, day_of_week, start_time, end_time, is_open, created_at)
         VALUES ($1, 'WEEKLY', $2, '00:00', '23:59', true, now())`,
        [cheapVerifiedRoomId, day],
      );
    }
    // The expensive room is NEVER open (used to prove the availability hard-exclude works).
    for (let day = 0; day <= 6; day++) {
      await dataSource.query(
        `INSERT INTO availability_rule (room_id, recurrence_type, day_of_week, start_time, end_time, is_open, created_at)
         VALUES ($1, 'WEEKLY', $2, '00:00', '00:00', false, now())`,
        [expensiveVerifiedRoomId, day],
      );
    }
  }, 30_000);

  afterAll(async () => {
    const roomIds = [
      cheapVerifiedRoomId,
      expensiveVerifiedRoomId,
      unverifiedRoomId,
      draftRoomId,
    ];
    await dataSource.query(
      `DELETE FROM room_amenity WHERE room_id = ANY($1::uuid[])`,
      [roomIds],
    );
    await dataSource.query(
      `DELETE FROM availability_rule WHERE room_id = ANY($1::uuid[])`,
      [roomIds],
    );
    await dataSource.query(`DELETE FROM room WHERE id = ANY($1::uuid[])`, [
      roomIds,
    ]);
    await dataSource.query(`DELETE FROM location WHERE id IN ($1, $2)`, [
      bakuLocationId,
      ganjaLocationId,
    ]);
    await dataSource.query(`DELETE FROM provider WHERE id IN ($1, $2)`, [
      verifiedProviderId,
      unverifiedProviderId,
    ]);
    await dataSource.query(`DELETE FROM app_user WHERE id = $1`, [ownerUserId]);
    await app.close();
  });

  it('never returns rooms from an unverified provider or a DRAFT room, even with no filters', async () => {
    const page = await searchService.search({
      city: 'Baku',
      page: 1,
      pageSize: 50,
    } as any);
    const ids = page.results.map((r) => r.id);
    expect(ids).toContain(cheapVerifiedRoomId);
    expect(ids).toContain(expensiveVerifiedRoomId);
    expect(ids).not.toContain(unverifiedRoomId);
    expect(ids).not.toContain(draftRoomId);
  });

  it('includes lat/lng on search results, matching the seeded location (needed for the results map — 15_MAPS_ARCHITECTURE.md §15.1)', async () => {
    const page = await searchService.search({
      city: 'Baku',
      page: 1,
      pageSize: 50,
    } as any);
    const cheapRoom = page.results.find((r) => r.id === cheapVerifiedRoomId);
    expect(cheapRoom).toBeDefined();
    expect(cheapRoom!.lat).toBeCloseTo(40.38, 3);
    expect(cheapRoom!.lng).toBeCloseTo(49.85, 3);
  });

  it('applies the amenities containment filter (must have ALL requested amenities)', async () => {
    const page = await searchService.search({
      city: 'Baku',
      amenities: ['amenity.wifi', 'amenity.projector'],
      page: 1,
      pageSize: 50,
    } as any);
    const ids = page.results.map((r) => r.id);
    expect(ids).toContain(expensiveVerifiedRoomId); // has both
    expect(ids).not.toContain(cheapVerifiedRoomId); // only has wifi
  });

  it('applies the priceMax filter', async () => {
    const page = await searchService.search({
      city: 'Baku',
      priceMax: 5000,
      page: 1,
      pageSize: 50,
    } as any);
    const ids = page.results.map((r) => r.id);
    expect(ids).toContain(cheapVerifiedRoomId);
    expect(ids).not.toContain(expensiveVerifiedRoomId);
  });

  it('is typo-tolerant on city via pg_trgm (§16.2 point 3)', async () => {
    const page = await searchService.search({
      city: 'Bakuu',
      page: 1,
      pageSize: 50,
    } as any);
    const ids = page.results.map((r) => r.id);
    expect(ids).toContain(cheapVerifiedRoomId);
  });

  it('excludes rooms outside the requested radius and sorts by distance', async () => {
    // Origin point very close to the Baku fixtures, far from nothing else relevant.
    const page = await searchService.search({
      lat: 40.38,
      lng: 49.85,
      radiusKm: 5,
      page: 1,
      pageSize: 50,
    } as any);
    const ids = page.results.map((r) => r.id);
    expect(ids).toContain(cheapVerifiedRoomId);
    expect(ids).toContain(expensiveVerifiedRoomId);
    for (const r of page.results) {
      expect(r.distanceKm).not.toBeNull();
      expect(r.distanceKm as number).toBeLessThanOrEqual(5);
    }
  });

  it('hard-excludes a room that is not actually open for the requested date/time/duration (§16.2 point 4)', async () => {
    // Pick a near-future Monday-or-any day; the cheap room is open all week, the expensive room is closed all week.
    const date = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const page = await searchService.search({
      city: 'Baku',
      date,
      startTime: '10:00',
      durationMinutes: 60,
      page: 1,
      pageSize: 50,
    } as any);
    const ids = page.results.map((r) => r.id);
    expect(ids).toContain(cheapVerifiedRoomId);
    expect(ids).not.toContain(expensiveVerifiedRoomId);
    const cheap = page.results.find((r) => r.id === cheapVerifiedRoomId);
    expect(cheap?.available).toBe(true);
  });

  it('sorts by price ascending when sort=price', async () => {
    const page = await searchService.search({
      city: 'Baku',
      sort: 'price',
      page: 1,
      pageSize: 50,
    } as any);
    const prices = page.results.map((r) => r.pricePerHour.amount);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  it('returns totalCount consistent with the number of matching rows', async () => {
    const page = await searchService.search({
      city: 'Baku',
      pageSize: 1,
      page: 1,
    } as any);
    expect(page.results).toHaveLength(1);
    expect(page.totalCount).toBeGreaterThanOrEqual(2); // at least the two verified Baku rooms
  });

  describe('getRoomDetail', () => {
    it('returns full detail for a public, active, verified room', async () => {
      const detail = await searchService.getRoomDetail(cheapVerifiedRoomId);
      expect(detail.id).toBe(cheapVerifiedRoomId);
      expect(detail.amenities).toEqual(['amenity.wifi']);
      expect(detail.verified).toBe(true);
      expect(detail.lat).not.toBeNull();
      expect(detail.lng).not.toBeNull();
    });

    it('404s for a DRAFT room (not yet publicly visible)', async () => {
      await expect(
        searchService.getRoomDetail(draftRoomId),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('404s for a room under an unverified provider', async () => {
      await expect(
        searchService.getRoomDetail(unverifiedRoomId),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
