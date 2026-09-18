import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PartnersService } from './partners.service';
import { PayoutsService } from '../payouts/payouts.service';

export interface PartnerAnalytics {
  partnerId: string;
  clicks: number;
  attributedBookings: number;
  commissionAvailable: number;
  commissionPending: number;
  commissionInTransit: number;
  commissionPaid: number;
  currency: string;
}

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.6 `GET /admin/partners/{id}/analytics`
 * — "clicks, attributed bookings, commission earned/paid." §31.7: admin-facing
 * only in V1 (no partner-facing dashboard/login yet).
 *
 * Every query is scoped by partner_id — a partner's figures never leak
 * another partner's clicks/bookings/commission (verified by
 * partners.e2e-spec.ts's "partner isolation" test).
 */
@Injectable()
export class PartnerAnalyticsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly partnersService: PartnersService,
    private readonly payoutsService: PayoutsService,
  ) {}

  async forPartner(partnerId: string): Promise<PartnerAnalytics> {
    await this.partnersService.findById(partnerId); // 404s cleanly if the partner doesn't exist

    const [clicksRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS clicks
       FROM referral_click rc
       JOIN referral_campaign camp ON camp.id = rc.campaign_id
       WHERE camp.partner_id = $1`,
      [partnerId],
    );
    const [attributedRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS attributed_bookings FROM booking_referral_attribution WHERE partner_id = $1`,
      [partnerId],
    );
    // Reuses PayoutsService.getBalance's generic provider/partner read-model
    // (§14.6) rather than re-deriving the same eligibility math here.
    const balance = await this.payoutsService.getBalance(
      'partner_id',
      partnerId,
    );

    return {
      partnerId,
      clicks: Number(clicksRow?.clicks ?? 0),
      attributedBookings: Number(attributedRow?.attributed_bookings ?? 0),
      commissionAvailable: balance.available,
      commissionPending: balance.pending,
      commissionInTransit: balance.inTransit,
      commissionPaid: balance.paid,
      currency: balance.currency,
    };
  }
}
