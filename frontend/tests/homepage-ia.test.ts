import { describe, expect, it, vi } from 'vitest';
import { pickWeighted } from '@/lib/ads/weighted-rotation';
import { visibleSocialLinks } from '@/lib/site/social-links';
import az from '../messages/az.json';

describe('pickWeighted', () => {
  it('returns null for an empty list', () => {
    expect(pickWeighted([])).toBeNull();
  });

  it('returns the only item', () => {
    expect(pickWeighted([{ id: 'a', weight: 5 }])?.id).toBe('a');
  });

  it('skips the excluded id when another creative exists', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickWeighted([{ id: 'a', weight: 50 }, { id: 'b', weight: 1 }], 'a')?.id).toBe('b');
    vi.restoreAllMocks();
  });
});

describe('visibleSocialLinks', () => {
  it('hides networks with empty URLs', () => {
    const visible = visibleSocialLinks({
      instagram: 'https://instagram.com/spotva.co',
      facebook: 'https://www.facebook.com/profile.php?id=61595072692616',
      tiktok: 'https://www.tiktok.com/@spotva.co',
      linkedin: '',
    });
    expect(visible.map((item) => item.key)).toEqual(['instagram', 'facebook', 'tiktok']);
  });
});

describe('homepage empty-state copy', () => {
  it('uses coming-soon copy that is not a permanent featured placeholder', () => {
    expect(az.home.dashboard.venues.emptyTitle).toBe('Məkanlar tezliklə burada');
    expect(az.home.dashboard.venues.emptyCta).toBe('Məkanını əlavə et');
    expect(az.home.dashboard.venues.emptyBody.toLowerCase()).toContain('podcast');
  });
});
