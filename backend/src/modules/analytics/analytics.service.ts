import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { VisitorEventEntity } from './entities/visitor-event.entity';
import { AnalyticsEventEntity } from './entities/analytics-event.entity';
import {
  ALLOWED_ANALYTICS_EVENTS,
  PII_METADATA_KEYS,
} from './allowed-events';
import { DomainException } from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';
import { LedgerEntryType } from '../../common/constants/payment.enum';
import { AttributionSourceType } from '../../common/constants/attribution.enum';

const MAX_EVENT_BYTES = 4096;
const OCCURRED_AT_SKEW_MS = 5 * 60_000;

export interface ProviderAnalytics {
  providerId: string;
  periodDays: number;
  views: number;
  uniqueVisitors: number;
  requests: number;
  confirmed: number;
  acceptedBookings: number;
  paidBookings: number;
  grossRevenueMinor: number;
  spotvaCommissionMinor: number;
  providerNetMinor: number;
  referralClicks: number;
  referralBookings: number;
  marketplaceBookings: number;
  pendingPayoutMinor: number;
  paidPayoutMinor: number;
  conversionRate: number | null;
  /** Percentage (0-100, one decimal), or null when there were no requests yet — the UI shows "—" for null rather than a misleading 0%. */
  confirmationRate: number | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(VisitorEventEntity)
    private readonly eventRepo: Repository<VisitorEventEntity>,
    @InjectRepository(AnalyticsEventEntity)
    private readonly analyticsEventRepo: Repository<AnalyticsEventEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async recordPageview(input: {
    path: string;
    roomId?: string;
    ip: string;
    userAgent: string;
  }) {
    const path = input.path.slice(0, 500);
    const visitorHash = createHash('sha256')
      .update(
        `${process.env.ANALYTICS_HASH_SALT ?? 'change-me'}|${input.ip}|${input.userAgent}`,
      )
      .digest('hex');

    await this.eventRepo.insert({
      eventType: 'PAGE_VIEW',
      path,
      visitorHash,
      roomId: input.roomId ?? null,
      createdAt: new Date(),
    });

    return { accepted: true };
  }

  async dashboard(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const todaySince = new Date();
    todaySince.setHours(0, 0, 0, 0);

    const [
      totalViews,
      uniqueVisitors,
      todayViews,
      todayUniqueVisitors,
      topPages,
    ] = await Promise.all([
      this.eventRepo
        .createQueryBuilder('event')
        .where('event.created_at >= :since', { since })
        .getCount(),
      this.eventRepo
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.visitor_hash)', 'count')
        .where('event.created_at >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.eventRepo
        .createQueryBuilder('event')
        .where('event.created_at >= :todaySince', { todaySince })
        .getCount(),
      this.eventRepo
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.visitor_hash)', 'count')
        .where('event.created_at >= :todaySince', { todaySince })
        .getRawOne<{ count: string }>(),
      this.eventRepo
        .createQueryBuilder('event')
        .select('event.path', 'path')
        .addSelect('COUNT(*)', 'views')
        .where('event.created_at >= :since', { since })
        .groupBy('event.path')
        .orderBy('views', 'DESC')
        .limit(10)
        .getRawMany<{ path: string; views: string }>(),
    ]);

    return {
      periodDays: days,
      totalViews,
      uniqueVisitors: Number(uniqueVisitors?.count ?? 0),
      todayViews,
      todayUniqueVisitors: Number(todayUniqueVisitors?.count ?? 0),
      topPages: topPages.map((page) => ({
        path: page.path,
        views: Number(page.views),
      })),
    };
  }

  /**
   * Provider Analytics (Feature Gap Analysis, Medium priority) — a
   * provider's own room views, booking requests, and confirmation rate,
   * scoped to their own rooms only (never another provider's figures).
   *
   * Raw SQL with the same `room -> location -> provider` join used
   * throughout the provider-facing modules (see `LeadsService.create`,
   * `PartnerAnalyticsService.forPartner`) rather than TypeORM
   * query-builder relations, since this crosses three entities
   * (`visitor_event`/`booking`/`booking_item`) that don't have direct
   * TypeORM relations wired between them.
   *
   * "Views" counts room-detail pageviews recorded with a `room_id`
   * (`PageviewTracker` only sends one on `/{locale}/rooms/{id}`, so this
   * is room-detail views specifically, not every page a visitor saw).
   *
   * "Requests" counts distinct bookings (not DRAFT, i.e. actually
   * submitted, not an abandoned cart) that include at least one of the
   * provider's rooms, by `booking.created_at`. "Confirmed" counts the
   * same set restricted to CONFIRMED/COMPLETED/NO_SHOW — a snapshot of
   * *current* status, not history (there's no status-history table to
   * ask "was this ever confirmed" instead), which is the same
   * current-status convention `BookingStatus`/`ACTIVE_BOOKING_STATUSES`
   * already use elsewhere in this codebase.
   */
  async forProvider(providerId: string, days = 30): Promise<ProviderAnalytics> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [[viewsRow], [requestsRow], [confirmedRow]] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) AS count
         FROM visitor_event ve
         JOIN room r ON r.id = ve.room_id
         JOIN location l ON l.id = r.location_id
         WHERE l.provider_id = $1 AND ve.created_at >= $2`,
        [providerId, since],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT b.id) AS count
         FROM booking b
         JOIN booking_item bi ON bi.booking_id = b.id
         JOIN room r ON r.id = bi.room_id
         JOIN location l ON l.id = r.location_id
         WHERE l.provider_id = $1 AND b.status != 'DRAFT' AND b.created_at >= $2`,
        [providerId, since],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT b.id) AS count
         FROM booking b
         JOIN booking_item bi ON bi.booking_id = b.id
         JOIN room r ON r.id = bi.room_id
         JOIN location l ON l.id = r.location_id
         WHERE l.provider_id = $1
           AND b.status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW')
           AND b.created_at >= $2`,
        [providerId, since],
      ),
    ]);

    const [
      uniqueRows,
      acceptedRows,
      paidRows,
      ledgerRows,
      referralClickRows,
      referralBookingRows,
      marketplaceBookingRows,
      payoutRows,
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM analytics_event
         WHERE provider_id = $1 AND occurred_at >= $2 AND session_id IS NOT NULL`,
        [providerId, since],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT b.id) AS count
         FROM booking b
         JOIN booking_item bi ON bi.booking_id = b.id
         JOIN room r ON r.id = bi.room_id
         JOIN location l ON l.id = r.location_id
         WHERE l.provider_id = $1
           AND b.status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW')
           AND b.created_at >= $2`,
        [providerId, since],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT le.booking_id) AS count
         FROM ledger_entry le
         WHERE le.provider_id = $1
           AND le.entry_type = $3
           AND le.created_at >= $2`,
        [providerId, since, LedgerEntryType.GROSS],
      ),
      this.dataSource.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE entry_type = $3), 0) AS gross,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = $4), 0) AS fee,
           COALESCE(SUM(amount) FILTER (WHERE entry_type = $5), 0) AS net
         FROM ledger_entry
         WHERE provider_id = $1 AND created_at >= $2`,
        [
          providerId,
          since,
          LedgerEntryType.GROSS,
          LedgerEntryType.PLATFORM_FEE,
          LedgerEntryType.PROVIDER_NET,
        ],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(rl.click_count), 0) AS count
         FROM referral_link rl
         WHERE rl.owner_type = 'provider' AND rl.owner_id = $1`,
        [providerId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count
         FROM booking_attribution ba
         WHERE ba.provider_id = $1
           AND ba.source_type = $3
           AND ba.created_at >= $2`,
        [providerId, since, AttributionSourceType.PROVIDER_REFERRAL],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count
         FROM booking_attribution ba
         WHERE ba.provider_id = $1
           AND ba.source_type IN ($3, $4)
           AND ba.created_at >= $2`,
        [
          providerId,
          since,
          AttributionSourceType.ORGANIC,
          AttributionSourceType.DIRECT,
        ],
      ),
      this.dataSource.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE status IN ('AVAILABLE','PROCESSING')), 0) AS pending,
           COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0) AS paid
         FROM payout
         WHERE provider_id = $1`,
        [providerId],
      ),
    ]);

    const views = Number(viewsRow?.count ?? 0);
    const requests = Number(requestsRow?.count ?? 0);
    const confirmed = Number(confirmedRow?.count ?? 0);
    const uniqueVisitors = Number(uniqueRows[0]?.count ?? 0);
    const acceptedBookings = Number(acceptedRows[0]?.count ?? confirmed);
    const paidBookings = Number(paidRows[0]?.count ?? 0);
    const grossRevenueMinor = Number(ledgerRows[0]?.gross ?? 0);
    const spotvaCommissionMinor = Number(ledgerRows[0]?.fee ?? 0);
    const providerNetMinor = Number(ledgerRows[0]?.net ?? 0);
    const referralClicks = Number(referralClickRows[0]?.count ?? 0);
    const referralBookings = Number(referralBookingRows[0]?.count ?? 0);
    const marketplaceBookings = Number(marketplaceBookingRows[0]?.count ?? 0);
    const pendingPayoutMinor = Number(payoutRows[0]?.pending ?? 0);
    const paidPayoutMinor = Number(payoutRows[0]?.paid ?? 0);

    return {
      providerId,
      periodDays: days,
      views,
      uniqueVisitors,
      requests,
      confirmed,
      acceptedBookings,
      paidBookings,
      grossRevenueMinor,
      spotvaCommissionMinor,
      providerNetMinor,
      referralClicks,
      referralBookings,
      marketplaceBookings,
      pendingPayoutMinor,
      paidPayoutMinor,
      conversionRate:
        views > 0 ? Math.round((requests / views) * 1000) / 10 : null,
      confirmationRate:
        requests > 0 ? Math.round((confirmed / requests) * 1000) / 10 : null,
    };
  }

  async forOrganizer(
    organizerUserId: string,
    eventId: string,
  ): Promise<{
    eventId: string;
    eventPageViews: number;
    locationClicks: number;
    bookingRequests: number;
    confirmedBookings: number;
    rsvpCount: number;
    referralClicks: number;
    ticketSales: number;
    conversionRate: number | null;
  }> {
    const owned = await this.dataSource.query(
      `SELECT id FROM events WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL`,
      [eventId, organizerUserId],
    );
    if (!owned[0]) {
      throw new DomainException(
        'EVENT_NOT_FOUND',
        'Event not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const [
      views,
      locClicks,
      bookings,
      confirmed,
      rsvps,
      refClicks,
      tickets,
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) AS count FROM analytics_event
         WHERE event_ref_id = $1 AND event_name IN ('event_created','event_published','page_view','location_viewed')`,
        [eventId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count FROM analytics_event
         WHERE event_ref_id = $1 AND event_name IN ('location_view','location_viewed')`,
        [eventId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count FROM booking_attribution WHERE event_id = $1`,
        [eventId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count
         FROM booking_attribution ba
         JOIN booking b ON b.id = ba.booking_id
         WHERE ba.event_id = $1 AND b.status IN ('CONFIRMED','COMPLETED','NO_SHOW')`,
        [eventId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count FROM event_rsvps
         WHERE event_id = $1 AND status IN ('confirmed','CONFIRMED')`,
        [eventId],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(click_count), 0) AS count
         FROM referral_link
         WHERE owner_type = 'organizer' AND destination_id = $1`,
        [eventId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS count FROM event_tickets
         WHERE event_id = $1 AND status IN ('confirmed','used')`,
        [eventId],
      ),
    ]);

    const eventPageViews = Number(views[0]?.count ?? 0);
    const bookingRequests = Number(bookings[0]?.count ?? 0);
    const confirmedBookings = Number(confirmed[0]?.count ?? 0);

    return {
      eventId,
      eventPageViews,
      locationClicks: Number(locClicks[0]?.count ?? 0),
      bookingRequests,
      confirmedBookings,
      rsvpCount: Number(rsvps[0]?.count ?? 0),
      referralClicks: Number(refClicks[0]?.count ?? 0),
      ticketSales: Number(tickets[0]?.count ?? 0),
      conversionRate:
        eventPageViews > 0
          ? Math.round((confirmedBookings / eventPageViews) * 1000) / 10
          : null,
    };
  }

  async recordProductEvent(input: {
    eventName: string;
    props?: Record<string, unknown>;
    clientTs?: number;
    clientEventId?: string;
    jwtUserId?: string | null;
    jwtProviderId?: string | null;
  }): Promise<{ accepted: boolean }> {
    const raw = JSON.stringify({
      event: input.eventName,
      props: input.props ?? {},
    });
    if (Buffer.byteLength(raw, 'utf8') > MAX_EVENT_BYTES) {
      throw new DomainException(
        'PAYLOAD_TOO_LARGE',
        'Analytics event payload exceeds 4KB.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!ALLOWED_ANALYTICS_EVENTS.has(input.eventName)) {
      throw new DomainException(
        'UNKNOWN_EVENT',
        'Event name is not on the allowlist.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    let occurredAt = now;
    if (typeof input.clientTs === 'number') {
      const client = new Date(input.clientTs);
      if (
        !Number.isNaN(client.getTime()) &&
        Math.abs(now.getTime() - client.getTime()) <= OCCURRED_AT_SKEW_MS
      ) {
        occurredAt = client;
      }
    }

    const props = this.stripPii(input.props ?? {});
    const locationId = this.asUuid(props.location_id);
    const bookingId = this.asUuid(props.booking_id);
    const eventRefId = this.asUuid(props.event_id);
    if (locationId) await this.assertExists('location', locationId);
    if (bookingId) await this.assertExists('booking', bookingId);
    if (eventRefId) await this.assertExists('events', eventRefId);

    try {
      await this.analyticsEventRepo.insert({
        eventName: input.eventName,
        userId: input.jwtUserId ?? null,
        sessionId:
          typeof props.session_id === 'string'
            ? props.session_id.slice(0, 255)
            : null,
        providerId:
          input.jwtProviderId ??
          (await this.providerIdForLocation(locationId)),
        organizerId: null,
        locationId,
        eventRefId,
        bookingId,
        source: this.asString(props.source, 100),
        medium: this.asString(props.medium, 100),
        campaign: this.asString(props.campaign, 100),
        referrer: this.asString(props.referrer, 500),
        landingPath: this.asString(props.landing_path, 500),
        value: typeof props.value === 'number' ? String(props.value) : null,
        properties: props,
        metadata: props,
        clientEventId: input.clientEventId ?? null,
        occurredAt,
        createdAt: now,
      });
    } catch (err: any) {
      if (err?.code === '23505') return { accepted: true };
      throw err;
    }
    return { accepted: true };
  }

  private stripPii(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (PII_METADATA_KEYS.has(key.toLowerCase())) continue;
      out[key] = value;
    }
    return out;
  }

  private asUuid(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value
      : null;
  }

  private asString(value: unknown, max: number): string | null {
    if (typeof value !== 'string' || !value) return null;
    return value.slice(0, max);
  }

  private async providerIdForLocation(
    locationId: string | null,
  ): Promise<string | null> {
    if (!locationId) return null;
    const rows = await this.dataSource.query(
      `SELECT provider_id AS "providerId" FROM location WHERE id = $1`,
      [locationId],
    );
    return rows[0]?.providerId ?? null;
  }

  private async assertExists(table: string, id: string): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!rows[0]) {
      throw new DomainException(
        'UNKNOWN_REFERENCE',
        `Unknown ${table} id.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
