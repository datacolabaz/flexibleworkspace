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

export const PLAN_PHOTOS_PER_ROOM_LIMITS: Record<ProviderPlanTier, number> = {
  [ProviderPlanTier.FREE]: 5,
  [ProviderPlanTier.STARTER]: 15,
  [ProviderPlanTier.PRO]: 30,
  [ProviderPlanTier.ENTERPRISE]: Number.POSITIVE_INFINITY, // soft cap per §25.2
};
