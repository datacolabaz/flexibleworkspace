import 'server-only';

export type PublicAd = {
  id: string;
  advertiserName: string;
  creativeUrl: string;
  clickUrl: string;
  weight: number;
  creativeSize: string;
};

export type PublicAdSlot = {
  placementKey: string;
  rotationIntervalSeconds: number;
  ads: PublicAd[];
};

export const HOMEPAGE_SIDEBAR_PLACEMENT = 'homepage_sidebar';

function backendUrl(path: string) {
  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) throw new Error('BACKEND_API_URL is not set.');
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function getAdSlot(placementKey: string): Promise<PublicAdSlot> {
  try {
    const response = await fetch(backendUrl(`ads/slots/${encodeURIComponent(placementKey)}`), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return { placementKey, rotationIntervalSeconds: 45, ads: [] };
    }
    return (await response.json()) as PublicAdSlot;
  } catch (err) {
    console.error('Best-effort ad slot fetch failed:', err);
    return { placementKey, rotationIntervalSeconds: 45, ads: [] };
  }
}

export type PublicSocials = {
  instagram: string;
  facebook: string;
  tiktok: string;
  linkedin: string;
};

export async function getPublicSocials(): Promise<PublicSocials> {
  const empty = { instagram: '', facebook: '', tiktok: '', linkedin: '' };
  try {
    const response = await fetch(backendUrl('site-settings/public'), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return empty;
    return { ...empty, ...((await response.json()) as PublicSocials) };
  } catch (err) {
    console.error('Best-effort site settings fetch failed:', err);
    return empty;
  }
}
