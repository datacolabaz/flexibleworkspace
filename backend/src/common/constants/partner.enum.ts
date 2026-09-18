/** Mirrors `partner_type` (32_PARTNER_REFERRAL_DDL.sql / 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.2). */
export enum PartnerType {
  AFFILIATE = 'AFFILIATE',
  AGENCY = 'AGENCY',
  CORPORATE = 'CORPORATE',
  COMMUNITY = 'COMMUNITY',
  STRATEGIC_PARTNER = 'STRATEGIC_PARTNER',
}

/**
 * Mirrors `partner_status`. Lifecycle mirrors `Provider.verification_status`
 * deliberately (§31.2): PENDING -> ACTIVE on admin approval, -> SUSPENDED
 * reversibly. No self-service signup in V1 (§31.7) — every partner starts
 * PENDING because an admin created the row, not because someone applied.
 */
export enum PartnerStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export const PARTNER_STATUS_TRANSITIONS: Record<
  PartnerStatus,
  PartnerStatus[]
> = {
  [PartnerStatus.PENDING]: [PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED],
  [PartnerStatus.ACTIVE]: [PartnerStatus.SUSPENDED],
  [PartnerStatus.SUSPENDED]: [PartnerStatus.ACTIVE],
};

/** Mirrors `referral_campaign_status`. */
export enum ReferralCampaignStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

/**
 * The attribution cookie's name. Deliberately a neutral, non-brand string
 * (the architecture doc's own illustration used `flexspace_ref`, but the
 * marketplace's final name is not yet decided — see PHASE4_REPORT.md /
 * conversation record). Shared between ReferralTrackingController (writer)
 * and BookingsController (reader) so the two never drift.
 */
export const REFERRAL_ATTRIBUTION_COOKIE_NAME = 'ref_token';
