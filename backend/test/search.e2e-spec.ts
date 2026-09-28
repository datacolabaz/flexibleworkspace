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

  /**
   * 1700000000039-RoomPremium.ts — category-scoped premium ranking.
   * Isolated fixtures (own rooms, reusing the outer `verifiedProviderId`/
   * `bakuLocationId`) so these don't disturb the organic-ordering
   * assertions above. Covers: pin-to-top within category, no leakage
   * across categories or into unfiltered browsing, expiry/not-yet-started
   * windows reverting to organic order, multi-premium priority ordering,
   * an explicit sort overriding the pin, `getFeaturedRooms()`'s pool, and
   * that `premiumInternalNote` never reaches a public result shape.
   */
  describe('Premium ranking (1700000000039-RoomPremium)', () => {
    let conferenceRoomTypeId: string;
    let premiumHiRoomId: string; // meeting_room, priority=1, active, EXPENSIVE
    let premiumLoRoomId: string; // meeting_room, priority=5, active, mid price
    let expiredPremiumRoomId: string; // meeting_room, isPremium=true but ended in the past
    let futurePremiumRoomId: string; // meeting_room, isPremium=true but starts in the future
    let crossCategoryPremiumRoomId: string; // conference_room, active premium
    let draftPremiumRoomId: string; // meeting_room, DRAFT + active premium — must never appear
    let plainFeaturedRoomId: string; // meeting_room, is_featured=true, isPremium=false
    const premiumRoomIds: string[] = [];

    beforeAll(async () => {
      const [conferenceRoomType] = await dataSource.query(
        `SELECT id FROM room_type WHERE translation_key = 'room_type.conference_room'`,
      );
      conferenceRoomTypeId = conferenceRoomType.id;

      const mk = async (
        label: string,
        roomTypeId: string,
        price: number,
        status: 'ACTIVE' | 'DRAFT',
        premium: {
          isPremium: boolean;
          priority?: number | null;
          startsAt?: Date | null;
          endsAt?: Date | null;
        },
      ) => {
        const [row] = await dataSource.query(
          `INSERT INTO room (location_id, room_type_id, name, slug, capacity_min, capacity_max, base_price_amount, base_price_currency, status,
                              average_rating, review_count, is_premium, premium_priority, premium_starts_at, premium_ends_at,
                              created_at, updated_at)
           VALUES ($1, $2, $3, $4, 1, 4, $5, 'AZN', $6, 4.0, 3, $7, $8, $9, $10, now(), now())
           RETURNING id`,
          [
            bakuLocationId,
            roomTypeId,
            label,
            `${suffix}-${label.toLowerCase().replace(/\s+/g, '-')}`,
            price,
            status,
            premium.isPremium,
            premium.priority ?? null,
            premium.startsAt ?? null,
            premium.endsAt ?? null,
          ],
        );
        premiumRoomIds.push(row.id);
        return row.id as string;
      };

      const past = new Date(Date.now() - 3_600_000);
      const farPast = new Date(Date.now() - 30 * 86_400_000);
      const recentPast = new Date(Date.now() - 86_400_000);
      const future = new Date(Date.now() + 30 * 86_400_000);
      const farFuture = new Date(Date.now() + 60 * 86_400_000);

      premiumHiRoomId = await mk(
        'Premium Hi Priority Room',
        meetingRoomTypeId,
        90000,
        'ACTIVE',
        { isPremium: true, priority: 1, startsAt: past, endsAt: future },
      );
      premiumLoRoomId = await mk(
        'Premium Lo Priority Room',
        meetingRoomTypeId,
        8000,
        'ACTIVE',
        { isPremium: true, priority: 5, startsAt: past, endsAt: future },
      );
      expiredPremiumRoomId = await mk(
        'Expired Premium Room',
        meetingRoomTypeId,
        8500,
        'ACTIVE',
        { isPremium: true, priority: 1, startsAt: farPast, endsAt: recentPast },
      );
      futurePremiumRoomId = await mk(
        'Future Premium Room',
        meetingRoomTypeId,
        8600,
        'ACTIVE',
        { isPremium: true, priority: 1, startsAt: future, endsAt: farFuture },
      );
      crossCategoryPremiumRoomId = await mk(
        'Cross Category Premium Room',
        conferenceRoomTypeId,
        8700,
        'ACTIVE',
        { isPremium: true, priority: 1, startsAt: past, endsAt: future },
      );
      draftPremiumRoomId = await mk(
        'Draft Premium Room',
        meetingRoomTypeId,
        8800,
        'DRAFT',
        { isPremium: true, priority: 1, startsAt: past, endsAt: future },
      );
      plainFeaturedRoomId = await mk(
        'Plain Featured Room',
        meetingRoomTypeId,
        9000,
        'ACTIVE',
        { isPremium: false },
      );
      await dataSource.query(
        `UPDATE room SET is_featured = TRUE WHERE id = $1`,
        [plainFeaturedRoomId],
      );
    }, 30_000);

    afterAll(async () => {
      await dataSource.query(`DELETE FROM room WHERE id = ANY($1::uuid[])`, [
        premiumRoomIds,
      ]);
    });

    it('pins an active premium room to the top of its own category under the default relevance sort, despite a much higher price', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      expect(page.results[0].id).toBe(premiumHiRoomId);
      expect(page.results[0].isPremium).toBe(true);
    });

    it('orders multiple active premium rooms by premium_priority ASC ahead of organic results', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      const ids = page.results.map((r) => r.id);
      const hiIndex = ids.indexOf(premiumHiRoomId); // priority 1
      const loIndex = ids.indexOf(premiumLoRoomId); // priority 5
      const organicIndex = ids.indexOf(cheapVerifiedRoomId); // not premium
      expect(hiIndex).toBeGreaterThanOrEqual(0);
      expect(loIndex).toBeGreaterThan(hiIndex);
      expect(organicIndex).toBeGreaterThan(loIndex);
    });

    it('does NOT pin premium rooms when no category filter is active (never forces cross-category placement)', async () => {
      const page = await searchService.search({
        city: 'Baku',
        page: 1,
        pageSize: 50,
      } as any);
      // Premium Hi (90000 AZN) would be first if pinning applied unfiltered;
      // instead, plain organic relevance ordering governs, so a far cheaper
      // room outranks it.
      const hiIndex = page.results.findIndex((r) => r.id === premiumHiRoomId);
      const cheapIndex = page.results.findIndex(
        (r) => r.id === cheapVerifiedRoomId,
      );
      expect(hiIndex).toBeGreaterThan(cheapIndex);
    });

    it("does NOT leak a premium room into a different category's results", async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      const ids = page.results.map((r) => r.id);
      expect(ids).not.toContain(crossCategoryPremiumRoomId);
    });

    it('does not pin an active premium room from category B when searching category A, even though it IS active', async () => {
      const page = await searchService.search({
        roomType: 'room_type.conference_room',
        page: 1,
        pageSize: 50,
      } as any);
      expect(page.results[0].id).toBe(crossCategoryPremiumRoomId);
      expect(page.results[0].isPremium).toBe(true);
    });

    it('reverts an EXPIRED premium room to normal (non-pinned) organic ranking', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      const expired = page.results.find((r) => r.id === expiredPremiumRoomId);
      expect(expired).toBeDefined();
      expect(expired!.isPremium).toBe(false);
      // Its price (8500) is cheaper than both active premium rooms, yet it
      // must rank AFTER them since it is no longer active.
      const ids = page.results.map((r) => r.id);
      expect(ids.indexOf(expiredPremiumRoomId)).toBeGreaterThan(
        ids.indexOf(premiumLoRoomId),
      );
    });

    it('does not pin a premium room whose window has not started yet', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      const future = page.results.find((r) => r.id === futurePremiumRoomId);
      expect(future).toBeDefined();
      expect(future!.isPremium).toBe(false);
    });

    it('does not override an explicit sort=price with premium pinning', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        sort: 'price',
        page: 1,
        pageSize: 50,
      } as any);
      const prices = page.results.map((r) => r.pricePerHour.amount);
      const sorted = [...prices].sort((a, b) => a - b);
      expect(prices).toEqual(sorted);
      // The expensive premium room (90000) must NOT be first under sort=price.
      expect(page.results[0].id).not.toBe(premiumHiRoomId);
    });

    it('never returns a DRAFT room as premium (or at all), even with an active premium flag', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      const ids = page.results.map((r) => r.id);
      expect(ids).not.toContain(draftPremiumRoomId);
    });

    it('never exposes premiumInternalNote on a public search result', async () => {
      const page = await searchService.search({
        roomType: 'room_type.meeting_room',
        page: 1,
        pageSize: 50,
      } as any);
      for (const r of page.results) {
        expect(Object.keys(r)).not.toContain('premiumInternalNote');
      }
    });

    describe('getFeaturedRooms', () => {
      /**
       * Product decision 2026-09-28: this widget has NO category filter,
       * so pinning EVERY active premium room here (unlike `search()`,
       * which pins within one category) could let premium rooms from
       * several categories fill the whole rail. Capped to AT MOST ONE
       * pinned premium slot. This fixture pool has THREE simultaneously
       * active premium rooms across two categories (premiumHiRoomId and
       * crossCategoryPremiumRoomId both priority=1 in different
       * categories; premiumLoRoomId priority=5) — proving the cap holds
       * even when multiple candidates are otherwise eligible.
       */
      it('pins AT MOST ONE active premium room on the flat, category-less homepage pool, ranked first', async () => {
        const rooms = await searchService.getFeaturedRooms(20);
        const ids = rooms.map((r) => r.id);
        // premiumHiRoomId and crossCategoryPremiumRoomId are tied on
        // priority=1 (different categories) — exactly one of them wins
        // the single slot; which one is an implementation-detail
        // tie-break (recency/id), not asserted here.
        const tiedTopCandidates = [premiumHiRoomId, crossCategoryPremiumRoomId];
        const pinned = tiedTopCandidates.filter((id) => ids.includes(id));
        expect(pinned).toHaveLength(1);
        expect(ids[0]).toBe(pinned[0]);
        expect(rooms[0].isPremium).toBe(true);
        // premiumLoRoomId (priority=5, worse) never wins the single slot,
        // and it isn't `is_featured` either, so it's absent entirely —
        // proof the cap doesn't just reorder, it excludes the loser.
        expect(ids).not.toContain(premiumLoRoomId);
      });

      it('fills the remaining slots with the pre-existing is_featured pool, unaffected by the premium cap', async () => {
        const rooms = await searchService.getFeaturedRooms(20);
        const ids = rooms.map((r) => r.id);
        expect(ids).toContain(plainFeaturedRoomId);
        const featuredEntry = rooms.find((r) => r.id === plainFeaturedRoomId);
        expect(featuredEntry!.isPremium).toBe(false);
      });

      it('excludes an expired-premium, non-featured room from the featured pool', async () => {
        const rooms = await searchService.getFeaturedRooms(20);
        const ids = rooms.map((r) => r.id);
        expect(ids).not.toContain(expiredPremiumRoomId);
      });

      it('never returns more than one room with isPremium=true', async () => {
        const rooms = await searchService.getFeaturedRooms(20);
        expect(rooms.filter((r) => r.isPremium)).toHaveLength(1);
      });
    });

    describe('getRoomDetail', () => {
      it('reflects isPremium=true for an active premium room', async () => {
        const detail = await searchService.getRoomDetail(premiumHiRoomId);
        expect(detail.isPremium).toBe(true);
      });

      it('reflects isPremium=false for an expired premium room', async () => {
        const detail = await searchService.getRoomDetail(expiredPremiumRoomId);
        expect(detail.isPremium).toBe(false);
      });
    });
  });
});
