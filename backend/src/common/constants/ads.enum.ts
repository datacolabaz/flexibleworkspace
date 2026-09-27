export const AD_ROTATION_INTERVALS = [30, 45, 60, 90] as const;
export type AdRotationInterval = (typeof AD_ROTATION_INTERVALS)[number];

export const AD_CREATIVE_SIZES = ['336x280', '300x250'] as const;
export type AdCreativeSize = (typeof AD_CREATIVE_SIZES)[number];

export const AD_EVENT_TYPES = ['impression', 'click'] as const;
export type AdEventType = (typeof AD_EVENT_TYPES)[number];

export const HOMEPAGE_SIDEBAR_PLACEMENT = 'homepage_sidebar';

export const DEFAULT_AD_ROTATION_INTERVAL = 45;

export const SITE_SETTING_SOCIAL_KEYS = [
  'social.instagram',
  'social.facebook',
  'social.tiktok',
  'social.linkedin',
] as const;

export type SiteSettingSocialKey = (typeof SITE_SETTING_SOCIAL_KEYS)[number];
