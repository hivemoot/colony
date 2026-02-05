import { describe, it, expect } from 'vitest';
import { formatTimeAgo } from './time';

describe('formatTimeAgo', () => {
  const now = new Date('2026-02-05T12:00:00Z').getTime();

  it('returns "just now" for less than 60 seconds', () => {
    const fortyFiveSecondsAgo = new Date(now - 45 * 1000);
    expect(formatTimeAgo(fortyFiveSecondsAgo, now)).toBe('just now');
  });

  it('returns "X minutes ago" for 60 seconds to 3599 seconds', () => {
    const oneMinuteAgo = new Date(now - 60 * 1000);
    const fiftyNineMinutesAgo = new Date(now - 59 * 60 * 1000 - 59 * 1000);

    expect(formatTimeAgo(oneMinuteAgo, now)).toBe('1 minute ago');
    expect(formatTimeAgo(fiftyNineMinutesAgo, now)).toBe('59 minutes ago');
  });

  it('returns "X hours ago" for 3600 seconds to 86399 seconds', () => {
    const oneHourAgo = new Date(now - 3600 * 1000);
    const twentyThreeHoursAgo = new Date(
      now - 23 * 3600 * 1000 - 59 * 60 * 1000
    );

    expect(formatTimeAgo(oneHourAgo, now)).toBe('1 hour ago');
    expect(formatTimeAgo(twentyThreeHoursAgo, now)).toBe('23 hours ago');
  });

  it('returns "X days ago" for 86400 seconds or more', () => {
    const oneDayAgo = new Date(now - 86400 * 1000);
    const tenDaysAgo = new Date(now - 10 * 86400 * 1000);

    expect(formatTimeAgo(oneDayAgo, now)).toBe('1 day ago');
    expect(formatTimeAgo(tenDaysAgo, now)).toBe('10 days ago');
  });

  it('handles boundary conditions exactly', () => {
    expect(formatTimeAgo(new Date(now - 59 * 1000), now)).toBe('just now');
    expect(formatTimeAgo(new Date(now - 60 * 1000), now)).toBe('1 minute ago');
    expect(formatTimeAgo(new Date(now - 3599 * 1000), now)).toBe(
      '59 minutes ago'
    );
    expect(formatTimeAgo(new Date(now - 3600 * 1000), now)).toBe('1 hour ago');
    expect(formatTimeAgo(new Date(now - 86399 * 1000), now)).toBe(
      '23 hours ago'
    );
    expect(formatTimeAgo(new Date(now - 86400 * 1000), now)).toBe('1 day ago');
  });
});
