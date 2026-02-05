import { describe, it, expect } from 'vitest';
import { formatTimeAgo } from './time';

describe('formatTimeAgo', () => {
  const now = new Date('2026-02-04T12:00:00Z').getTime();

  it('returns "just now" for less than 60 seconds', () => {
    const date = new Date('2026-02-04T11:59:30Z');
    expect(formatTimeAgo(date, now)).toBe('just now');
  });

  it('returns minutes ago for 1 to 59 minutes', () => {
    const oneMin = new Date('2026-02-04T11:59:00Z');
    const fiftyNineMin = new Date('2026-02-04T11:01:00Z');
    expect(formatTimeAgo(oneMin, now)).toBe('1 minutes ago');
    expect(formatTimeAgo(fiftyNineMin, now)).toBe('59 minutes ago');
  });

  it('returns hours ago for 1 to 23 hours', () => {
    const oneHour = new Date('2026-02-04T11:00:00Z');
    const twentyThreeHours = new Date('2026-02-03T13:00:00Z');
    expect(formatTimeAgo(oneHour, now)).toBe('1 hours ago');
    expect(formatTimeAgo(twentyThreeHours, now)).toBe('23 hours ago');
  });

  it('returns days ago for 24 hours or more', () => {
    const oneDay = new Date('2026-02-03T12:00:00Z');
    const tenDays = new Date('2026-01-25T12:00:00Z');
    expect(formatTimeAgo(oneDay, now)).toBe('1 days ago');
    expect(formatTimeAgo(tenDays, now)).toBe('10 days ago');
  });

  it('handles exact boundary conditions', () => {
    expect(formatTimeAgo(new Date(now - 59999), now)).toBe('just now');
    expect(formatTimeAgo(new Date(now - 60000), now)).toBe('1 minutes ago');
    expect(formatTimeAgo(new Date(now - 3599999), now)).toBe('59 minutes ago');
    expect(formatTimeAgo(new Date(now - 3600000), now)).toBe('1 hours ago');
    expect(formatTimeAgo(new Date(now - 86399999), now)).toBe('23 hours ago');
    expect(formatTimeAgo(new Date(now - 86400000), now)).toBe('1 days ago');
  });
});
