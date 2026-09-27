export type WeightedItem = { id: string; weight: number };

/**
 * Weighted random pick. When `excludeId` is set and more than one item
 * exists, the previous creative is skipped so rotation is visible.
 */
export function pickWeighted<T extends WeightedItem>(items: T[], excludeId?: string | null): T | null {
  if (items.length === 0) return null;
  const pool = excludeId && items.length > 1 ? items.filter((item) => item.id !== excludeId) : items;
  const total = pool.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  let cursor = Math.random() * total;
  for (const item of pool) {
    cursor -= Math.max(1, item.weight);
    if (cursor <= 0) return item;
  }
  return pool[pool.length - 1] ?? null;
}
