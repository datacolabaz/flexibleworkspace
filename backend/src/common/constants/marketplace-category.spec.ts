import {
  providerHasMarketplaceCategory,
  resolveMarketplaceCategorySlug,
} from './marketplace-category';

describe('marketplace categories', () => {
  it('maps legacy location slugs onto EN marketplace slugs', () => {
    expect(resolveMarketplaceCategorySlug('coworking')).toBe('COWORKING_SPACE');
    expect(resolveMarketplaceCategorySlug('MEETING_ROOM')).toBe('MEETING_ROOM');
  });

  it('requires at least one mapped category to publish', () => {
    expect(providerHasMarketplaceCategory([])).toBe(false);
    expect(providerHasMarketplaceCategory(['coworking'])).toBe(true);
    expect(providerHasMarketplaceCategory(['unknown'])).toBe(false);
  });
});
