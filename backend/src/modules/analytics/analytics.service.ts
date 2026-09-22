import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { VisitorEventEntity } from './entities/visitor-event.entity';

export interface ProviderAnalytics {
  providerId: string;
  periodDays: number;
  views: number;
  requests: number;
  confirmed: number;
  /** Percentage (0-100, one decimal), or null when there were no requests yet — the UI shows "—" for null rather than a misleading 0%. */
  confirmationRate: number | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(VisitorEventEntity)
    private readonly eventRepo: Repository<VisitorEventEntity>,
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

    const views = Number(viewsRow?.count ?? 0);
    const requests = Number(requestsRow?.count ?? 0);
    const confirmed = Number(confirmedRow?.count ?? 0);

    return {
      providerId,
      periodDays: days,
      views,
      requests,
      confirmed,
      confirmationRate:
        requests > 0 ? Math.round((confirmed / requests) * 1000) / 10 : null,
    };
  }
}
