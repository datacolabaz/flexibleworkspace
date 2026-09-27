export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok' | 'linkedin';

export type SocialLinks = Record<SocialNetwork, string>;

export const SOCIAL_NETWORKS: SocialNetwork[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];

export function visibleSocialLinks(socials: SocialLinks) {
  return SOCIAL_NETWORKS.filter((key) => socials[key]?.trim()).map((key) => ({
    key,
    href: socials[key].trim(),
  }));
}
