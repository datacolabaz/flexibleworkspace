/** Mirrors provider_verification_status in 28_DATABASE_DDL.sql. */
export enum ProviderVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * The document types a provider can submit for verification review
 * (25_PROVIDER_ARCHITECTURE.md / Sprint 1). Not mirrored in the DB as its
 * own enum type — stored as plain text inside each JSONB entry in
 * `provider.verification_documents` (see the 1700000000009 migration).
 */
export enum ProviderVerificationDocumentType {
  ID_DOCUMENT = 'ID_DOCUMENT',
  BUSINESS_REGISTRATION = 'BUSINESS_REGISTRATION',
  ADDRESS_PROOF = 'ADDRESS_PROOF',
  OTHER = 'OTHER',
}

/** Mirrors provider_plan_tier in 28_DATABASE_DDL.sql. */
export enum ProviderPlanTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

/** Mirrors room_status in 28_DATABASE_DDL.sql. */
export enum RoomStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Per-plan limits, taken verbatim from the approved table in
 * 25_PROVIDER_ARCHITECTURE.md §25.2 — not re-derived or approximated here.
 * These are code-level product decisions, not admin-configurable data, in V1.
 */
export const PLAN_LOCATION_LIMITS: Record<ProviderPlanTier, number> = {
  [ProviderPlanTier.FREE]: 1,
  [ProviderPlanTier.STARTER]: 1,
  [ProviderPlanTier.PRO]: 5,
  [ProviderPlanTier.ENTERPRISE]: Number.POSITIVE_INFINITY,
};

export const PLAN_ROOM_LIMITS: Record<ProviderPlanTier, number> = {
  [ProviderPlanTier.FREE]: 3,
  [ProviderPlanTier.STARTER]: 10,
  [ProviderPlanTier.PRO]: 50, // soft cap, raise on request per §25.2
  [ProviderPlanTier.ENTERPRISE]: Number.POSITIVE_INFINITY,
};

/**
 * Provider Listing Media Specification (product decision, this pass) —
 * supersedes the earlier §25.2 figures (5/15/30/∞) with a tighter,
 * explicitly cost-conscious set: "credible listing + low infrastructure
 * cost + meaningful Pro upgrade incentive." Only FREE (5) and PRO (10)
 * were specified; STARTER and ENTERPRISE aren't named in that decision,
 * so this extrapolates STARTER alongside FREE and ENTERPRISE alongside
 * PRO (same "no unstated business threshold" discipline used elsewhere
 * in this codebase, e.g. `refund.autoApproveLimitMinorUnits`) — flag to
 * the product owner if STARTER/ENTERPRISE should differ; changing this
 * table is the only place that needs to.
 */
export const PLAN_PHOTOS_PER_ROOM_LIMITS: Record<ProviderPlanTier, number> = {
  [ProviderPlanTier.FREE]: 5,
  [ProviderPlanTier.STARTER]: 5,
  [ProviderPlanTier.PRO]: 10,
  [ProviderPlanTier.ENTERPRISE]: 10,
};

/** Recommending 3-5 quality photos is a UI copy choice, not an enforced minimum — a listing may go live with just 1 (Provider Listing Media Specification §4). */
export const RECOMMENDED_MIN_PHOTOS = 3;

/** Video: PRO/ENTERPRISE only, one video per room, max 30s / 20MB (Provider Listing Media Specification §2). FREE/STARTER get 0 — `canUploadVideo` below is the single source of truth callers should use rather than comparing plan tiers directly. */
export const PLAN_VIDEO_MAX_COUNT: Record<ProviderPlanTier, number> = {
  [ProviderPlanTier.FREE]: 0,
  [ProviderPlanTier.STARTER]: 0,
  [ProviderPlanTier.PRO]: 1,
  [ProviderPlanTier.ENTERPRISE]: 1,
};

export const PLAN_VIDEO_MAX_DURATION_SECONDS: Record<ProviderPlanTier, number> =
  {
    [ProviderPlanTier.FREE]: 0,
    [ProviderPlanTier.STARTER]: 0,
    [ProviderPlanTier.PRO]: 30,
    [ProviderPlanTier.ENTERPRISE]: 30,
  };

export const PLAN_VIDEO_MAX_SIZE_BYTES: Record<ProviderPlanTier, number> = {
  [ProviderPlanTier.FREE]: 0,
  [ProviderPlanTier.STARTER]: 0,
  [ProviderPlanTier.PRO]: 20 * 1024 * 1024,
  [ProviderPlanTier.ENTERPRISE]: 20 * 1024 * 1024,
};

/**
 * Reusable plan-entitlement functions (Provider Listing Media
 * Specification §11) — callers (backend validation, frontend UI gating)
 * go through these rather than comparing `plan === ProviderPlanTier.PRO`
 * directly, so a future plan-tier change only touches the tables above.
 */
export function canUploadVideo(plan: ProviderPlanTier): boolean {
  return PLAN_VIDEO_MAX_COUNT[plan] > 0;
}

export function getMaxImageCount(plan: ProviderPlanTier): number {
  return PLAN_PHOTOS_PER_ROOM_LIMITS[plan];
}

export function getMaxVideoCount(plan: ProviderPlanTier): number {
  return PLAN_VIDEO_MAX_COUNT[plan];
}

export function getMaxVideoDurationSeconds(plan: ProviderPlanTier): number {
  return PLAN_VIDEO_MAX_DURATION_SECONDS[plan];
}

export function getMaxVideoSizeBytes(plan: ProviderPlanTier): number {
  return PLAN_VIDEO_MAX_SIZE_BYTES[plan];
}
