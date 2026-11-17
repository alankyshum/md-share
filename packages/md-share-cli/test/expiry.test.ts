import { describe, expect, it } from 'vitest';
import { expiry } from '../src/config/expiry.js';

describe('share expiry', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('defaults to a year, or seven days for decisions', () => {
    expect(expiry(undefined, undefined, now)).toBe('2027-01-01T00:00:00.000Z');
    expect(expiry(undefined, 'decision', now)).toBe('2026-01-08T00:00:00.000Z');
    expect(expiry('2m', 'decision', now)).toBe('2026-01-01T00:02:00.000Z');
  });
  it('rejects invalid and past dates', () => {
    expect(() => expiry('bad', undefined, now)).toThrow();
    expect(() => expiry('2025-01-01', undefined, now)).toThrow();
    expect(() => expiry(undefined, 'other', now)).toThrow();
  });
});
