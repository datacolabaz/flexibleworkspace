import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from '@/lib/auth/safe-redirect';

describe('safeRedirectTarget', () => {
  it('accepts a path-absolute, same-origin target', () => {
    expect(safeRedirectTarget('/account/bookings')).toBe('/account/bookings');
  });

  it('rejects an absolute URL to another host', () => {
    expect(safeRedirectTarget('https://evil.example/steal')).toBeUndefined();
  });

  it('rejects a protocol-relative URL (still changes host)', () => {
    expect(safeRedirectTarget('//evil.example')).toBeUndefined();
  });

  it('rejects a backslash-prefixed target (browser-quirk protocol-relative)', () => {
    expect(safeRedirectTarget('/\\evil.example')).toBeUndefined();
  });

  it('rejects a path that does not start with /', () => {
    expect(safeRedirectTarget('account/bookings')).toBeUndefined();
  });

  it('returns undefined for absent input', () => {
    expect(safeRedirectTarget(undefined)).toBeUndefined();
    expect(safeRedirectTarget(null)).toBeUndefined();
    expect(safeRedirectTarget('')).toBeUndefined();
  });
});
