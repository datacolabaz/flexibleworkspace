import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BookingAttributionEntity } from './entities/booking-attribution.entity';
import {
  AttributionSourceType,
  ReferralLinkOwnerType,
} from '../../common/constants/attribution.enum';

const PG_UNIQUE_VIOLATION = '23505';

export interface AttributionSnapshotInput {
  bookingId: string;
  locationId: string;
  providerId: string;
  /** Partner `ref_token` cookie — opaque; verified against referral_click. */
  partnerAttributionToken?: string | null;
  /** Provider/organizer `own_ref_token` cookie. */
  ownReferralToken?: string | null;
  /** Client-supplied event UUID — validated server-side, never trusted as organizer/provider. */
  claimedEventId?: string | null;
  claimedReferralSource?: string | null;
  sessionId?: string | null;
}

@Injectable()
export class BookingAttributionService {
  private readonly logger = new Logger(BookingAttributionService.name);

  /**
   * Writes an immutable attribution snapshot inside the caller's booking
   * transaction. Never throws for missing/invalid cookies — booking create
   * must not fail because attribution is incomplete.
   */
  async snapshot(
    manager: EntityManager,
    input: AttributionSnapshotInput,
  ): Promise<BookingAttributionEntity | null> {
    const now = new Date();
    let sourceType = AttributionSourceType.UNKNOWN;
    let sourceId: string | null = null;
    let sourceCode: string | null = null;
    let eventId: string | null = null;
    let organizerId: string | null = null;
    let landingPath: string | null = null;
    const lastTouch: Record<string, unknown> = {};

    const own = await this.resolveOwnReferral(manager, input.ownReferralToken);
    if (own) {
      sourceType =
        own.ownerType === ReferralLinkOwnerType.ORGANIZER
          ? AttributionSourceType.ORGANIZER_REFERRAL
          : AttributionSourceType.PROVIDER_REFERRAL;
      sourceId = own.linkId;
      sourceCode = own.code;
      landingPath = own.landingPath;
      lastTouch.type = sourceType;
      lastTouch.code = own.code;
      lastTouch.linkId = own.linkId;
      if (own.destinationType === 'event' && own.destinationId) {
        const event = await this.loadEvent(manager, own.destinationId);
        if (event) {
          eventId = event.id;
          organizerId = event.organizerId;
        }
      }
    } else if (input.partnerAttributionToken) {
      const partner = await this.resolvePartnerClick(
        manager,
        input.partnerAttributionToken,
      );
      if (partner) {
        sourceType = AttributionSourceType.EXTERNAL_PARTNER;
        sourceId = partner.campaignId;
        sourceCode = partner.campaignCode;
        landingPath = partner.landingPath;
        lastTouch.type = sourceType;
        lastTouch.campaignId = partner.campaignId;
      }
    }

    if (input.claimedEventId) {
      const event = await this.loadEvent(manager, input.claimedEventId);
      if (event) {
        eventId = event.id;
        organizerId = event.organizerId;
        if (sourceType === AttributionSourceType.UNKNOWN) {
          sourceType = AttributionSourceType.EVENT_PAGE;
        }
      }
    }

    if (sourceType === AttributionSourceType.UNKNOWN && input.claimedReferralSource) {
      const src = input.claimedReferralSource.toLowerCase();
      if (src.includes('paid') || src.startsWith('cpc') || src.startsWith('ads')) {
        sourceType = AttributionSourceType.PAID_CAMPAIGN;
      } else if (src === 'direct') {
        sourceType = AttributionSourceType.DIRECT;
      } else if (src === 'organic' || src === 'search' || src === 'spotva') {
        sourceType = AttributionSourceType.ORGANIC;
      } else if (src === 'spotva_event') {
        sourceType = AttributionSourceType.EVENT_PAGE;
      }
      sourceCode = sourceCode ?? input.claimedReferralSource.slice(0, 100);
    }

    if (
      sourceType === AttributionSourceType.UNKNOWN &&
      !input.claimedReferralSource &&
      !input.ownReferralToken &&
      !input.partnerAttributionToken
    ) {
      sourceType = AttributionSourceType.DIRECT;
    }

    const firstTouch = { ...lastTouch };
    lastTouch.touchedAt = now.toISOString();
    if (landingPath) lastTouch.landingPath = landingPath;

    const row = manager.create(BookingAttributionEntity, {
      bookingId: input.bookingId,
      sourceType,
      sourceId,
      sourceCode,
      firstTouchSource: Object.keys(firstTouch).length ? firstTouch : null,
      lastTouchSource: Object.keys(lastTouch).length ? lastTouch : null,
      landingPath,
      eventId,
      organizerId,
      providerId: input.providerId,
      locationId: input.locationId,
      sessionId: input.sessionId ?? null,
      attributionModel: 'last_click_7d',
      attributedAt: now,
      attributionLockedAt: now,
      createdAt: now,
    });

    try {
      return await manager.save(row);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        this.logger.log(
          `Duplicate booking_attribution for ${input.bookingId} — first writer wins.`,
        );
        return null;
      }
      this.logger.warn(
        `booking_attribution snapshot failed for ${input.bookingId}: ${err?.message}`,
      );
      return null;
    }
  }

  private async loadEvent(
    manager: EntityManager,
    eventId: string,
  ): Promise<{ id: string; organizerId: string } | null> {
    const rows = await manager.query(
      `SELECT id, organizer_id AS "organizerId"
       FROM events
       WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    return rows[0] ?? null;
  }

  private async resolveOwnReferral(
    manager: EntityManager,
    token?: string | null,
  ): Promise<{
    linkId: string;
    code: string;
    ownerType: string;
    destinationType: string | null;
    destinationId: string | null;
    landingPath: string | null;
  } | null> {
    if (!token) return null;
    try {
      const rows = await manager.query(
        `SELECT c.landing_path AS "landingPath",
                l.id AS "linkId",
                l.code,
                l.owner_type AS "ownerType",
                l.destination_type AS "destinationType",
                l.destination_id AS "destinationId"
         FROM referral_link_click c
         JOIN referral_link l ON l.id = c.referral_link_id
         WHERE c.attribution_token = $1
           AND c.expires_at > NOW()
           AND l.is_active = true
           AND l.revoked_at IS NULL`,
        [token],
      );
      return rows[0] ?? null;
    } catch (err: any) {
      if (err?.code === '42P01') return null;
      throw err;
    }
  }

  private async resolvePartnerClick(
    manager: EntityManager,
    token: string,
  ): Promise<{
    campaignId: string;
    campaignCode: string;
    landingPath: string | null;
  } | null> {
    const rows = await manager.query(
      `SELECT rc.campaign_id AS "campaignId",
              camp.code AS "campaignCode",
              rc.landing_path AS "landingPath"
       FROM referral_click rc
       JOIN referral_campaign camp ON camp.id = rc.campaign_id
       WHERE rc.attribution_token = $1
         AND rc.expires_at > NOW()`,
      [token],
    );
    return rows[0] ?? null;
  }
}
