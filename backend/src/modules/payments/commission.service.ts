import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { CommissionRuleEntity } from './entities/commission-rule.entity';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import {
  CommissionRuleScope,
  GATEWAY_PROCESSING_FEE_PERCENTAGE,
  LedgerEntryType,
  PartnerCommissionType,
  PaymentAdapterName,
} from '../../common/constants/payment.enum';

export interface LedgerWriteResult {
  entries: LedgerEntryEntity[];
  providerNetAmount: number;
  platformFeeAmount: number;
}

/**
 * 13_PAYMENT_ARCHITECTURE.md §13.5 commission resolution + §14.2 ledger
 * math + ADR-010's PARTNER_COMMISSION hook. All writes here happen inside
 * the caller's transaction (`manager` is always the QueryRunner's
 * EntityManager from PaymentsService.handleWebhookEvent) so a booking is
 * never confirmed with an incomplete or inconsistent ledger.
 */
@Injectable()
export class CommissionService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Resolution order per §13.5 ("provider-specific override → category-
   * specific default → platform global default"), implemented via the
   * `priority` column `commission_rule` already has for exactly this
   * purpose: every rule that could apply (provider-specific, promotional,
   * category, or platform-default) and is currently within its optional
   * time window is a candidate; the highest-priority candidate wins. This
   * lets an admin express "provider override beats category beats
   * platform default" (the documented order) by seeding priorities in that
   * order, or override it deliberately for a specific promotion, without
   * hardcoding scope precedence in code.
   */
  private async resolveCommissionRule(
    manager: EntityManager,
    providerId: string,
    roomTypeId: string,
  ): Promise<CommissionRuleEntity | null> {
    const rows = await manager.query(
      `SELECT * FROM commission_rule
       WHERE (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
         AND (
           scope = 'PLATFORM_DEFAULT'
           OR (scope IN ('PROVIDER', 'PROMOTIONAL') AND provider_id = $1)
           OR (scope = 'CATEGORY' AND room_type_id = $2)
         )
       ORDER BY priority DESC, created_at DESC
       LIMIT 1`,
      [providerId, roomTypeId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const rule = new CommissionRuleEntity();
    rule.id = row.id;
    rule.scope = row.scope as CommissionRuleScope;
    rule.providerId = row.provider_id;
    rule.roomTypeId = row.room_type_id;
    rule.percentage = row.percentage;
    rule.fixedFeeAmount = row.fixed_fee_amount;
    rule.fixedFeeCurrency = row.fixed_fee_currency;
    rule.priority = row.priority;
    return rule;
  }

  private commissionAmount(
    rule: CommissionRuleEntity | null,
    grossAmount: number,
  ): number {
    if (rule?.fixedFeeAmount != null) return Number(rule.fixedFeeAmount);
    const percentage =
      rule?.percentage != null
        ? Number(rule.percentage)
        : this.platformDefaultPercentage();
    return Math.round(grossAmount * (percentage / 100));
  }

  private platformDefaultPercentage(): number {
    return (
      this.configService.get<number>('commission.platformDefaultPercentage') ??
      12
    );
  }

  /**
   * Writes GROSS / PLATFORM_FEE / PROCESSING_FEE / PROVIDER_NET
   * (14_PAYOUT_LEDGER.md §14.2) for a just-confirmed booking, plus
   * PARTNER_COMMISSION (ADR-010 / §31.3) when the booking carries a
   * BookingReferralAttribution. Returns the written rows so the caller can
   * persist them via `manager.save`, staying in the same transaction as
   * the booking-confirmation write.
   */
  async buildLedgerEntriesForConfirmedBooking(
    manager: EntityManager,
    params: {
      bookingId: string;
      providerId: string;
      roomTypeId: string;
      grossAmount: number; // the full customer charge — Booking.totalAmount (§14.2's "full customer charge")
      currency: string;
      paymentAdapter: PaymentAdapterName;
    },
  ): Promise<LedgerWriteResult> {
    const rule = await this.resolveCommissionRule(
      manager,
      params.providerId,
      params.roomTypeId,
    );
    const platformFeeAmount = this.commissionAmount(rule, params.grossAmount);
    const processingFeeAmount = Math.round(
      params.grossAmount *
        (GATEWAY_PROCESSING_FEE_PERCENTAGE[params.paymentAdapter] / 100),
    );
    const providerNetAmount =
      params.grossAmount - platformFeeAmount - processingFeeAmount;

    const now = new Date();
    const make = (
      entryType: LedgerEntryType,
      amount: number,
      opts: { partnerId?: string; commissionRuleId?: string | null } = {},
    ) => {
      const entry = new LedgerEntryEntity();
      entry.bookingId = params.bookingId;
      entry.providerId = opts.partnerId ? null : params.providerId;
      entry.partnerId = opts.partnerId ?? null;
      entry.entryType = entryType;
      entry.amount = String(amount);
      entry.currency = params.currency;
      entry.commissionRuleId = opts.commissionRuleId ?? null;
      entry.createdAt = now;
      return entry;
    };

    const entries: LedgerEntryEntity[] = [
      make(LedgerEntryType.GROSS, params.grossAmount, {
        commissionRuleId: rule?.id ?? null,
      }),
      make(LedgerEntryType.PLATFORM_FEE, -platformFeeAmount, {
        commissionRuleId: rule?.id ?? null,
      }),
      make(LedgerEntryType.PROCESSING_FEE, -processingFeeAmount),
      make(LedgerEntryType.PROVIDER_NET, providerNetAmount, {
        commissionRuleId: rule?.id ?? null,
      }),
    ];

    const partnerEntry = await this.buildPartnerCommissionEntry(
      manager,
      params.bookingId,
      platformFeeAmount,
      params.currency,
      now,
    );
    if (partnerEntry) entries.push(partnerEntry);

    return { entries, providerNetAmount, platformFeeAmount };
  }

  /**
   * ADR-010 / 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.3: "Partner
   * commission is calculated as a percentage of the PLATFORM's own
   * commission revenue... never a deduction from the provider's net
   * payout, and never added on top of the customer's price" — so this
   * reads `platformFeeAmount` (already computed above, provider-side math
   * untouched) and produces an ADDITIONAL, separate ledger row, never a
   * modification to PLATFORM_FEE/PROVIDER_NET.
   *
   * Queried via raw SQL against `booking_referral_attribution`/`partner`/
   * `referral_campaign` rather than mapped TypeORM entities — those
   * belong to the Partner/Referral module (P4-3a), which is not built yet;
   * this hook only needs read access to tables the earlier PartnerReferral
   * migration already created, so PaymentsModule doesn't need to depend on
   * a not-yet-existing module to honor ADR-010 now.
   */
  private async buildPartnerCommissionEntry(
    manager: EntityManager,
    bookingId: string,
    platformFeeAmount: number,
    currency: string,
    now: Date,
  ): Promise<LedgerEntryEntity | null> {
    const rows = await manager.query(
      `SELECT bra.partner_id, p.default_commission_type, p.default_commission_value,
              rc.commission_type_override, rc.commission_value_override
       FROM booking_referral_attribution bra
       JOIN partner p ON p.id = bra.partner_id
       JOIN referral_campaign rc ON rc.id = bra.campaign_id
       WHERE bra.booking_id = $1 AND p.status = 'ACTIVE' AND p.deleted_at IS NULL`,
      [bookingId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const type: PartnerCommissionType =
      row.commission_type_override ?? row.default_commission_type;
    const value = Number(
      row.commission_value_override ?? row.default_commission_value,
    );

    // Storage convention (not spelled out by 31_PARTNER_REFERRAL_ARCHITECTURE.md
    // §31.2, which types both fields as a shared bigint column for two
    // different units): PERCENTAGE_OF_PLATFORM_FEE is stored in basis
    // points (1/100 of a percent — e.g. 2000 = 20.00%), FIXED_PER_BOOKING
    // in minor currency units, mirroring how `commission_rule.percentage`
    // (NUMERIC(5,2)) vs `fixed_fee_amount` (BIGINT) are kept as two
    // differently-typed columns elsewhere in this same document — documented
    // here since the DDL alone doesn't fix it. See PHASE4_REPORT.md.
    const amount =
      type === PartnerCommissionType.FIXED_PER_BOOKING
        ? value
        : Math.round(platformFeeAmount * (value / 10000));

    const entry = new LedgerEntryEntity();
    entry.bookingId = bookingId;
    entry.providerId = null;
    entry.partnerId = row.partner_id;
    entry.entryType = LedgerEntryType.PARTNER_COMMISSION;
    entry.amount = String(amount); // positive — mirrors PROVIDER_NET's sign convention (§31.3: "mirrors PROVIDER_NET being written at confirmation")
    entry.currency = currency;
    entry.createdAt = now;
    return entry;
  }
}
