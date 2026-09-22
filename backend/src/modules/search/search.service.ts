import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { SearchQueryDto, SearchSort } from './dto/search-query.dto';
import { ACTIVE_BOOKING_STATUSES } from '../../common/constants/booking.enum';
import { DomainException } from '../../common/exceptions/domain.exception';

export interface RoomSearchResult {
  id: string;
  name: string;
  roomType: string;
  providerName: string;
  verified: boolean;
  city: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  capacityMin: number;
  capacityMax: number;
  pricePerHour: { amount: number; currency: string };
  averageRating: number;
  reviewCount: number;
  coverPhotoUrl: string | null;
  available: boolean;
  relevanceScore: number;
}

export interface SearchResultPage {
  results: RoomSearchResult[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface RoomDetailResult extends RoomSearchResult {
  description: string | null;
  sizeSqm: number | null;
  amenities: string[];
  cancellationPolicy: Record<string, unknown> | null;
  photos: string[];
  minBookingMinutes: number;
  maxBookingMinutes: number;
}

/** Local helper — keeps the giant raw-SQL query's positional params in sync without hand-counting `$N`. */
class ParamBuilder {
  private readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
  get params(): unknown[] {
    return this.values;
  }
}

/**
 * 16_SEARCH_ARCHITECTURE.md — PostgreSQL-first search (no Elasticsearch at
 * V1, §16.1). Every touch of `location.geo` goes through raw SQL (same
 * ADR-009 discipline as LocationsService, since TypeORM can't express
 * ST_DWithin/ST_Distance declaratively), and since the query already has to
 * be raw SQL for the geo predicate, the whole search — structured filters,
 * full-text/trigram fuzzy match, live availability, rating, and the
 * relevance formula — is composed as ONE parameterized query (§16.2's
 * explicit "not several round-trips" requirement), rather than assembled
 * through TypeORM's QueryBuilder plus a separate application-side pass.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async search(dto: SearchQueryDto): Promise<SearchResultPage> {
    const pb = new ParamBuilder();
    const weights = this.configService.get('search.weights') as {
      price: number;
      distance: number;
      rating: number;
      amenityMatch: number;
      capacityFit: number;
    };

    const hasGeo = dto.lat !== undefined && dto.lng !== undefined;
    const hasAvailabilityCheck = !!(
      dto.date &&
      dto.startTime &&
      dto.durationMinutes
    );

    // ---- Distance (only computable when the caller gave lat/lng) ----
    const pointExpr = hasGeo
      ? `ST_SetSRID(ST_MakePoint(${pb.add(dto.lng)}::double precision, ${pb.add(dto.lat)}::double precision), 4326)::geography`
      : null;
    const distanceMExpr = pointExpr
      ? `ST_Distance(l.geo, ${pointExpr})`
      : 'NULL';

    // ---- Live availability (§12.1 logic, reproduced as a single boolean
    // predicate per candidate room instead of the multi-window
    // AvailabilityService.getOpenWindows() computation, since search only
    // needs a yes/no for one fixed requested range, not the full set of
    // open windows. Mirrors AvailabilityService.isRangeAvailable() exactly:
    // duration bounds, holiday-closes-day-unless-date-override, weekly vs.
    // date-specific rule precedence, blocked periods, buffered active
    // bookings, and the advance-booking window. ----
    let isAvailableExpr = 'TRUE';
    if (hasAvailabilityCheck) {
      const pDate = pb.add(dto.date);
      const pStartTime = pb.add(dto.startTime);
      const pDuration = pb.add(dto.durationMinutes);
      // Requested range converted from location-local wall-clock to UTC,
      // per-row, using each location's own timezone column — the same
      // conversion AvailabilityService does with luxon, just done in SQL so
      // it can run once across every candidate room in the same query.
      const startAtUtc = `((${pDate}::date + ${pStartTime}::time) AT TIME ZONE l.timezone)`;
      const endAtUtc = `(${startAtUtc} + (${pDuration} || ' minutes')::interval)`;
      const dow = `EXTRACT(DOW FROM ${pDate}::date)::int`;

      isAvailableExpr = `(
        ${pDuration} BETWEEN r.min_booking_minutes AND r.max_booking_minutes
        AND ${startAtUtc} >= now() + (r.advance_booking_min_hours || ' hours')::interval
        AND ${startAtUtc} <= now() + (r.advance_booking_max_days || ' days')::interval
        AND NOT (
          EXISTS (SELECT 1 FROM holiday h WHERE h.country_code = l.country_code AND h.observed_date = ${pDate}::date)
          AND NOT EXISTS (
            SELECT 1 FROM availability_rule arh
            WHERE arh.room_id = r.id AND arh.recurrence_type = 'DATE_SPECIFIC' AND arh.specific_date = ${pDate}::date
          )
        )
        AND EXISTS (
          SELECT 1 FROM availability_rule ar
          WHERE ar.room_id = r.id AND ar.is_open = true
            AND ar.start_time <= ${pStartTime}::time
            AND ar.end_time >= (${pStartTime}::time + (${pDuration} || ' minutes')::interval)
            AND (
              (ar.recurrence_type = 'DATE_SPECIFIC' AND ar.specific_date = ${pDate}::date)
              OR (
                ar.recurrence_type = 'WEEKLY' AND ar.day_of_week = ${dow}
                AND NOT EXISTS (
                  SELECT 1 FROM availability_rule aro
                  WHERE aro.room_id = r.id AND aro.recurrence_type = 'DATE_SPECIFIC' AND aro.specific_date = ${pDate}::date
                )
              )
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocked_period bp
          WHERE bp.room_id = r.id AND bp.start_at < ${endAtUtc} AND bp.end_at > ${startAtUtc}
        )
        AND NOT EXISTS (
          SELECT 1 FROM booking_item bi
          WHERE bi.room_id = r.id
            AND bi.status IN (${ACTIVE_BOOKING_STATUSES.map((s) => pb.add(s)).join(', ')})
            AND bi.start_at - (r.buffer_minutes || ' minutes')::interval < ${endAtUtc}
            AND bi.end_at + (r.buffer_minutes || ' minutes')::interval > ${startAtUtc}
        )
      )`;
    }

    // ---- Structured + fuzzy filters (§16.2 points 1 and 3) ----
    const whereClauses = [
      'r.deleted_at IS NULL',
      "r.status = 'ACTIVE'",
      'l.deleted_at IS NULL',
      'p.deleted_at IS NULL',
      "p.verification_status = 'VERIFIED'",
    ];

    if (dto.city) {
      // Typo-tolerant match on city/district (§16.2 point 3) rather than
      // strict equality — pg_trgm similarity plus a substring fallback so
      // "Baki"/"baku" both match "Baku".
      const p = pb.add(dto.city);
      whereClauses.push(
        `(l.city ILIKE '%' || ${p} || '%' OR similarity(l.city, ${p}) > 0.3)`,
      );
    }
    if (dto.district) {
      const p = pb.add(dto.district);
      whereClauses.push(
        `(l.district ILIKE '%' || ${p} || '%' OR similarity(l.district, ${p}) > 0.3)`,
      );
    }
    if (dto.roomType) {
      whereClauses.push(`rt.translation_key = ${pb.add(dto.roomType)}`);
    }
    if (dto.participants !== undefined) {
      // Hard-fits check only (must physically hold the party); how *well*
      // it fits (versus an oversized room) is a ranking concern, not a
      // filter — see capacity_fit below.
      whereClauses.push(`r.capacity_max >= ${pb.add(dto.participants)}`);
    }
    if (dto.priceMax !== undefined) {
      whereClauses.push(`r.base_price_amount <= ${pb.add(dto.priceMax)}`);
    }
    if (dto.amenities && dto.amenities.length > 0) {
      // Array containment (§16.2 point 1) — every requested amenity must be
      // present; this is a hard filter, not a partial-credit ranking term.
      const p = pb.add(dto.amenities);
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM unnest(${p}::text[]) AS req(translation_key)
        WHERE NOT EXISTS (
          SELECT 1 FROM room_amenity ra JOIN amenity am ON am.id = ra.amenity_id
          WHERE ra.room_id = r.id AND am.translation_key = req.translation_key
        )
      )`);
    }
    if (pointExpr && dto.radiusKm !== undefined) {
      whereClauses.push(
        `ST_DWithin(l.geo, ${pointExpr}, ${pb.add(dto.radiusKm * 1000)})`,
      );
    }
    if (hasAvailabilityCheck) {
      // "a room is never shown as a result if it can't actually be booked
      // for the requested slot" (§16.2 point 4) — a hard exclude, not a
      // down-rank.
      whereClauses.push(isAvailableExpr);
    }

    // ---- Relevance sub-scores (§16.3). Each is normalized to [0,1]; a
    // dimension the caller gave no input for defaults to a neutral value
    // (0.5, or 1.0 for amenity match with nothing requested) rather than
    // being dropped, keeping the formula simple and always computable —
    // exact weights/curves are the documented "Phase 2 tuning detail". ----
    const priceFitExpr =
      dto.priceMax !== undefined
        ? `GREATEST(0, LEAST(1, 1 - (r.base_price_amount::numeric / GREATEST(${pb.add(dto.priceMax)}, 1))))`
        : '0.5';
    const distanceScoreExpr = pointExpr
      ? `(1 / (1 + (${distanceMExpr} / 1000.0)))`
      : '0.5';
    // log-dampened review count: confidence saturates around ~10 reviews (ln(11)) so one 5-star review can't outrank a well-reviewed room.
    const ratingScoreExpr = `((r.average_rating / 5.0) * LEAST(1, LN(r.review_count + 1) / LN(11)))`;
    // Always 1.0: requested amenities are a hard containment filter above,
    // so every candidate row already has all of them — there's no partial
    // match to score. Kept as a named term (not folded away) because
    // §16.3 names it explicitly as part of the formula's observable inputs.
    const amenityMatchExpr = '1.0';
    const capacityFitExpr =
      dto.participants !== undefined
        ? `LEAST(1, ${pb.add(dto.participants)}::numeric / GREATEST(r.capacity_max, 1))`
        : '0.5';

    const wp = pb.add(weights.price);
    const wd = pb.add(weights.distance);
    const wr = pb.add(weights.rating);
    const wa = pb.add(weights.amenityMatch);
    const wc = pb.add(weights.capacityFit);
    const relevanceExpr = `(
      (${wp}::numeric * ${priceFitExpr})
      + (${wd}::numeric * ${distanceScoreExpr})
      + (${wr}::numeric * ${ratingScoreExpr})
      + (${wa}::numeric * ${amenityMatchExpr})
      + (${wc}::numeric * ${capacityFitExpr})
    ) / GREATEST(${wp}::numeric + ${wd}::numeric + ${wr}::numeric + ${wa}::numeric + ${wc}::numeric, 0.0001)`;

    const sort: SearchSort = dto.sort ?? 'relevance';
    let orderByExpr: string;
    if (sort === 'price') orderByExpr = 'r.base_price_amount ASC';
    else if (sort === 'distance' && pointExpr)
      orderByExpr = `${distanceMExpr} ASC NULLS LAST`;
    else if (sort === 'rating')
      orderByExpr = 'r.average_rating DESC, r.review_count DESC';
    else orderByExpr = 'relevance_score DESC';

    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const limitParam = pb.add(pageSize);
    const offsetParam = pb.add((page - 1) * pageSize);

    const sql = `
      SELECT
        r.id,
        r.name,
        rt.translation_key AS room_type,
        p.display_name AS provider_name,
        -- Every row here already passed p.verification_status = 'VERIFIED'
        -- in the WHERE clause, so this is always true for a search result.
        true AS verified,
        l.city,
        l.district,
        ST_Y(l.geo::geometry) AS lat,
        ST_X(l.geo::geometry) AS lng,
        ${distanceMExpr} AS distance_m,
        r.capacity_min,
        r.capacity_max,
        r.base_price_amount::int AS price_amount,
        r.base_price_currency AS price_currency,
        r.average_rating::float AS average_rating,
        r.review_count,
        (
          SELECT storage_key FROM photo ph
          WHERE ph.room_id = r.id AND ph.moderation_status = 'APPROVED'
          ORDER BY ph.is_cover DESC, ph.display_order ASC
          LIMIT 1
        ) AS cover_photo_key,
        ${isAvailableExpr} AS available,
        ${relevanceExpr} AS relevance_score,
        count(*) OVER() AS total_count
      FROM room r
      JOIN location l ON l.id = r.location_id
      JOIN provider p ON p.id = l.provider_id
      JOIN room_type rt ON rt.id = r.room_type_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${orderByExpr}, r.id
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const rows = await this.dataSource.query(sql, pb.params);
    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;

    return {
      results: rows.map((row: any) => this.mapRow(row)),
      page,
      pageSize,
      totalCount,
    };
  }

  private mapRow(row: any): RoomSearchResult {
    return {
      id: row.id,
      name: row.name,
      roomType: row.room_type,
      providerName: row.provider_name,
      verified: row.verified,
      city: row.city,
      district: row.district,
      lat: row.lat !== null ? Number(row.lat) : null,
      lng: row.lng !== null ? Number(row.lng) : null,
      distanceKm:
        row.distance_m !== null
          ? Math.round((row.distance_m / 1000) * 10) / 10
          : null,
      capacityMin: row.capacity_min,
      capacityMax: row.capacity_max,
      pricePerHour: { amount: row.price_amount, currency: row.price_currency },
      averageRating: row.average_rating,
      reviewCount: row.review_count,
      coverPhotoUrl: row.cover_photo_key
        ? this.storageKeyToUrl(row.cover_photo_key)
        : null,
      available: row.available,
      relevanceScore: Math.round(row.relevance_score * 1000) / 1000,
    };
  }

  /**
   * Photo URLs are resolved from the storage key at read time (never
   * persisted as an absolute URL — 22_INFRASTRUCTURE.md), matching how
   * StorageProvider is the single source of truth for how a key maps to a
   * servable path. Kept local to Search rather than importing the storage
   * module: search only ever needs the read-side URL derivation, not an
   * upload capability.
   */
  private storageKeyToUrl(storageKey: string): string {
    // The relative path the backend actually serves the file at (see
    // main.ts's `app.useStaticAssets(..., { prefix: '/uploads' })`) is
    // always `/uploads/<key>` regardless of the on-disk directory name, so
    // this no longer derives it from `storage.localPath`.
    const origin = this.configService.get<string>('backendPublicUrl');
    // The frontend runs on its own separate domain, so a bare relative path
    // would resolve against the WRONG origin there — prepend the backend's
    // own public origin whenever one is configured (see configuration.ts).
    return origin
      ? `${origin}/uploads/${storageKey}`
      : `/uploads/${storageKey}`;
  }

  /**
   * `GET /spaces/featured` — Sprint 4 (Featured Listing). A small,
   * admin-curated set of rooms (`room.is_featured = TRUE`, toggled from
   * the admin panel's Listings section) for the public homepage's
   * "Featured venues" section, which previously showed 3 hardcoded mock
   * rooms. Deliberately a plain query, not `search()`'s full relevance/
   * geo/availability machinery — the homepage just needs "whichever
   * rooms are currently featured," most recently updated first, same
   * visibility rules as regular search (active, verified provider, not
   * deleted). Reuses `mapRow()`/`RoomSearchResult` so the frontend gets
   * the exact same shape `searchRooms()` already returns.
   */
  async getFeaturedRooms(limit = 6): Promise<RoomSearchResult[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), 12);
    const rows = await this.dataSource.query(
      `
      SELECT
        r.id,
        r.name,
        rt.translation_key AS room_type,
        p.display_name AS provider_name,
        true AS verified,
        l.city,
        l.district,
        NULL::double precision AS lat,
        NULL::double precision AS lng,
        NULL::double precision AS distance_m,
        r.capacity_min,
        r.capacity_max,
        r.base_price_amount::int AS price_amount,
        r.base_price_currency AS price_currency,
        r.average_rating::float AS average_rating,
        r.review_count,
        (
          SELECT storage_key FROM photo ph
          WHERE ph.room_id = r.id AND ph.moderation_status = 'APPROVED'
          ORDER BY ph.is_cover DESC, ph.display_order ASC
          LIMIT 1
        ) AS cover_photo_key,
        true AS available,
        0 AS relevance_score
      FROM room r
      JOIN location l ON l.id = r.location_id
      JOIN provider p ON p.id = l.provider_id
      JOIN room_type rt ON rt.id = r.room_type_id
      WHERE r.deleted_at IS NULL AND r.status = 'ACTIVE'
        AND l.deleted_at IS NULL AND p.deleted_at IS NULL
        AND p.verification_status = 'VERIFIED'
        AND r.is_featured = TRUE
      ORDER BY r.updated_at DESC
      LIMIT $1
      `,
      [cappedLimit],
    );
    return rows.map((row: any) => this.mapRow(row));
  }

  /** `GET /spaces/:roomId` — full room detail, public (29_API_OPENAPI.yaml RoomDetail). */
  async getRoomDetail(roomId: string): Promise<RoomDetailResult> {
    const pb = new ParamBuilder();
    const pRoomId = pb.add(roomId);

    const rows = await this.dataSource.query(
      `
      SELECT
        r.id, r.name, r.description, r.size_sqm, r.cancellation_policy,
        r.capacity_min, r.capacity_max, r.min_booking_minutes, r.max_booking_minutes,
        r.base_price_amount::int AS price_amount, r.base_price_currency AS price_currency,
        r.average_rating::float AS average_rating, r.review_count,
        r.status,
        rt.translation_key AS room_type,
        p.display_name AS provider_name,
        p.verification_status,
        l.city, l.district,
        ST_Y(l.geo::geometry) AS lat, ST_X(l.geo::geometry) AS lng
      FROM room r
      JOIN location l ON l.id = r.location_id
      JOIN provider p ON p.id = l.provider_id
      JOIN room_type rt ON rt.id = r.room_type_id
      WHERE r.id = ${pRoomId} AND r.deleted_at IS NULL AND l.deleted_at IS NULL AND p.deleted_at IS NULL
        AND r.status = 'ACTIVE' AND p.verification_status = 'VERIFIED'
      `,
      pb.params,
    );
    if (rows.length === 0) {
      // Same discipline as booking ownership checks (BookingsController) —
      // a DRAFT/INACTIVE room or one belonging to an unverified provider
      // isn't publicly bookable, so it 404s rather than leaking that a
      // not-yet-published listing exists.
      throw new DomainException(
        'NOT_FOUND',
        'Room not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const row = rows[0];

    const amenities = await this.dataSource.query(
      `SELECT am.translation_key FROM room_amenity ra JOIN amenity am ON am.id = ra.amenity_id WHERE ra.room_id = $1`,
      [roomId],
    );
    const photos = await this.dataSource.query(
      `SELECT storage_key FROM photo WHERE room_id = $1 AND moderation_status = 'APPROVED' ORDER BY is_cover DESC, display_order ASC`,
      [roomId],
    );

    return {
      id: row.id,
      name: row.name,
      roomType: row.room_type,
      providerName: row.provider_name,
      verified: row.verification_status === 'VERIFIED',
      city: row.city,
      district: row.district,
      distanceKm: null,
      capacityMin: row.capacity_min,
      capacityMax: row.capacity_max,
      pricePerHour: { amount: row.price_amount, currency: row.price_currency },
      averageRating: row.average_rating,
      reviewCount: row.review_count,
      coverPhotoUrl:
        photos.length > 0 ? this.storageKeyToUrl(photos[0].storage_key) : null,
      available: row.status === 'ACTIVE',
      relevanceScore: 0,
      description: row.description,
      sizeSqm: row.size_sqm !== null ? Number(row.size_sqm) : null,
      amenities: amenities.map((a: any) => a.translation_key),
      cancellationPolicy: row.cancellation_policy,
      photos: photos.map((p: any) => this.storageKeyToUrl(p.storage_key)),
      lat: row.lat !== null ? Number(row.lat) : null,
      lng: row.lng !== null ? Number(row.lng) : null,
      minBookingMinutes: row.min_booking_minutes,
      maxBookingMinutes: row.max_booking_minutes,
    };
  }
}
