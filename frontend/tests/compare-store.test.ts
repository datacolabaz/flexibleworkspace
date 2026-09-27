import { describe, expect, it, beforeEach } from 'vitest';
import { addToCompare, getCompareIds, removeFromCompare } from '@/lib/compare/compare-store';

describe('compare store', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('rejects duplicates and a 5th location', () => {
    expect(addToCompare('a').ok).toBe(true);
    expect(addToCompare('a').reason).toBe('duplicate');
    expect(addToCompare('b').ok).toBe(true);
    expect(addToCompare('c').ok).toBe(true);
    expect(addToCompare('d').ok).toBe(true);
    expect(addToCompare('e').reason).toBe('full');
    expect(getCompareIds()).toEqual(['a', 'b', 'c', 'd']);
    expect(removeFromCompare('b')).toEqual(['a', 'c', 'd']);
  });
});
