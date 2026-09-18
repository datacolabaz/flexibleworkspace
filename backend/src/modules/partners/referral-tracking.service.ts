import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';

import { ReferralCampaignEntity } from './entities/referral-campaign.entity';
import { ReferralClickEntity } from './entities/referral-click.entity';
import { BookingReferralAttributionEntity } from './entities/booking-referral-attribution.entity';
import { PartnerEntity } from './entities/partner.entity';
import {
  PartnerStatus,
  ReferralCampaignStatus,
} from '../../common/constants/partner.enum';
import { ConfigService } from '@nestjs/config';

/** Postgres unique-violation error code (booking_id UNIQUE on booking_referral_attribution — the race/duplicate-attribution guard). */
const PG_UNIQUE_VIOLATION = '23505';

export interface ClickResult {
  attributionToken: string;
  attributionWindowDays: number;
}

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 — server-side, deterministic
 * attribution. Nothing here ever trusts client-supplied "I was referred by
 * X" data; the cookie only ever carries an opaque token, and every real
 * fact (a click happened, it hasn't expired, it maps to an active
 * campaign/partner) is re-verified server-side against Postgres.
 */
@Injectable()
export class ReferralTrackingService {
  private readonly logger = new Logger(ReferralTrackingService.name);

  constructor(
    @InjectRepository(ReferralCampaignEntity)
    private readonly campaignRepo: Repository<ReferralCampaignEntity>,
    @InjectRepository(ReferralClickEntity)
    private readonly clickRepo: Repository<ReferralClickEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepo: Repository<PartnerEntity>,
    private readonly configService: ConfigService,
  ) {}

  hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    const salt = this.configService.get<string>('partner.ipHashSalt') ?? '';
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }

  /**
   * §31.4 step 2 — `GET /r/{code}` handler's core logic. An unknown code, a
   * non-ACTIVE campaign, or a non-ACTIVE partner all resolve to "no click
   * recorded, no cookie set" rather than a 404 — a mistyped or stale
   * partner link should still land the visitor on the marketplace, exactly
   * like organic traffic, not show them an error page. This is an additive
   * UX decision the architecture doc doesn't pin down explicitly.
   */
  async trackClick(params: {
    code: string;
    ipHash: string | null;
    userAgent?: string;
    landingPath: string;
  }): Promise<ClickResult | null> {
    const campaign = await this.campaignRepo.findOne({
      where: { code: params.code },
    });
    if (!campaign || campaign.status !== ReferralCampaignStatus.ACTIVE)
      return null;

    const now = new Date();
    if (campaign.startsAt && campaign.startsAt > now) return null;
    if (campaign.endsAt && campaign.endsAt < now) return null;

    const partner = await this.partnerRepo.findOne({
      where: { id: campaign.partnerId },
    });
    if (
      !partner ||
      partner.status !== PartnerStatus.ACTIVE ||
      partner.deletedAt
    )
      return null;

    // Server-generated, opaque, unique (uq_referral_click_token). 32 random
    // bytes / 64 hex chars — far beyond brute-force range, and never derived
    // from anything guessable (§31.4: "proves nothing by itself").
    const attributionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      now.getTime() + campaign.attributionWindowDays * 86_400_000,
    );

    const click = this.clickRepo.create({
      campaignId: campaign.id,
      attributionToken,
      ipHash: params.ipHash,
      userAgent: params.userAgent ?? null,
      landingPath: params.landingPath,
      createdAt: now,
      expiresAt,
    });
    await this.clickRepo.save(click);

    return {
      attributionToken,
      attributionWindowDays: campaign.attributionWindowDays,
    };
  }

  /**
   * §31.4 step 4 — called from BookingsService.create() inside its own
   * transaction (so a crash between booking-insert and attribution-insert
   * can never happen). Every failure mode is a silent no-op rather than an
   * error: an absent/garbage/expired token, an ended campaign, or a
   * suspended partner just means "this booking has no partner attribution,"
   * never "this booking fails to create." The `manager` param keeps this
   * atomic with the caller's own transaction rather than opening a second one.
   */
  async attributeBooking(
    manager: EntityManager,
    bookingId: string,
    attributionToken?: string | null,
  ): Promise<BookingReferralAttributionEntity | null> {
    if (!attributionToken) return null;

    const click = await manager.findOne(ReferralClickEntity, {
      where: { attributionToken },
    });
    if (!click) return null; // unknown/garbage token
    if (click.expiresAt < new Date()) return null; // attribution window closed

    const campaign = await manager.findOne(ReferralCampaignEntity, {
      where: { id: click.campaignId },
    });
    if (!campaign || campaign.status !== ReferralCampaignStatus.ACTIVE)
      return null; // campaign paused/ended since the click

    const partner = await manager.findOne(PartnerEntity, {
      where: { id: campaign.partnerId },
    });
    if (
      !partner ||
      partner.status !== PartnerStatus.ACTIVE ||
      partner.deletedAt
    )
      return null; // partner suspended since the click

    const attribution = manager.create(BookingReferralAttributionEntity, {
      bookingId,
      referralClickId: click.id,
      partnerId: campaign.partnerId,
      campaignId: campaign.id,
      attributedAt: new Date(),
    });
    try {
      return await manager.save(attribution);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        // uq_booking_referral_attribution_booking — this booking already has
        // an attribution (a retried request, a race). Harmless no-op: the
        // first writer wins, which is correct (one attribution per booking).
        this.logger.log(
          `Duplicate attribution attempt for booking ${bookingId} — already attributed, no-op.`,
        );
        return null;
      }
      throw err;
    }
  }

  buildTrackingUrl(code: string): string {
    const base =
      this.configService.get<string>('partner.publicBaseUrl') ??
      '[MARKETPLACE_DOMAIN]';
    return `${base}/r/${code}`;
  }
}
