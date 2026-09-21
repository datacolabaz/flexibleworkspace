import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { VisitorEventEntity } from './entities/visitor-event.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(VisitorEventEntity)
    private readonly eventRepo: Repository<VisitorEventEntity>,
  ) {}

  async recordPageview(input: { path: string; roomId?: string; ip: string; userAgent: string }) {
    const path = input.path.slice(0, 500);
    const visitorHash = createHash('sha256')
      .update(`${process.env.ANALYTICS_HASH_SALT ?? 'change-me'}|${input.ip}|${input.userAgent}`)
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

    const [totalViews, uniqueVisitors, todayViews, todayUniqueVisitors, topPages] = await Promise.all([
      this.eventRepo.createQueryBuilder('event').where('event.created_at >= :since', { since }).getCount(),
      this.eventRepo.createQueryBuilder('event').select('COUNT(DISTINCT event.visitor_hash)', 'count').where('event.created_at >= :since', { since }).getRawOne<{ count: string }>(),
      this.eventRepo.createQueryBuilder('event').where('event.created_at >= :todaySince', { todaySince }).getCount(),
      this.eventRepo.createQueryBuilder('event').select('COUNT(DISTINCT event.visitor_hash)', 'count').where('event.created_at >= :todaySince', { todaySince }).getRawOne<{ count: string }>(),
      this.eventRepo.createQueryBuilder('event').select('event.path', 'path').addSelect('COUNT(*)', 'views').where('event.created_at >= :since', { since }).groupBy('event.path').orderBy('views', 'DESC').limit(10).getRawMany<{ path: string; views: string }>(),
    ]);

    return {
      periodDays: days,
      totalViews,
      uniqueVisitors: Number(uniqueVisitors?.count ?? 0),
      todayViews,
      todayUniqueVisitors: Number(todayUniqueVisitors?.count ?? 0),
      topPages: topPages.map((page) => ({ path: page.path, views: Number(page.views) })),
    };
  }
}
