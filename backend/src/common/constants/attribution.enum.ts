export enum AttributionSourceType {
  ORGANIC = 'organic',
  DIRECT = 'direct',
  PAID_CAMPAIGN = 'paid_campaign',
  PROVIDER_REFERRAL = 'provider_referral',
  EVENT_PAGE = 'event_page',
  ORGANIZER_REFERRAL = 'organizer_referral',
  EXTERNAL_PARTNER = 'external_partner',
  UNKNOWN = 'unknown',
}

export const ATTRIBUTION_SOURCE_TYPES = Object.values(AttributionSourceType);

export enum ReferralLinkOwnerType {
  PROVIDER = 'provider',
  ORGANIZER = 'organizer',
  ADMIN = 'admin',
}

export enum ReferralLinkDestinationType {
  LOCATION = 'location',
  EVENT = 'event',
  HOMEPAGE = 'homepage',
}

/** Opaque httpOnly cookie for provider/organizer referral_link clicks. Distinct from partner `ref_token`. */
export const OWN_REFERRAL_COOKIE_NAME = 'own_ref_token';
