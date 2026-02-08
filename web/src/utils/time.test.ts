import { describe, it, expect } from 'vitest';
import { formatTimeAgo, formatDuration } from './time';

describe('formatTimeAgo', () => {
  const now = new Date('2026-02-05T12:00:00Z').getTime();

  it('returns "just now" for < 60 seconds', () => {
    const date = new Date(now - 30 * 1000);
    expect(formatTimeAgo(date, now)).toBe('just now');
  });

  it('returns "X minutes ago" for 60s–3599s', () => {
    const oneMin = new Date(now - 60 * 1000);
    expect(formatTimeAgo(oneMin, now)).toBe('1 minutes ago');

    const fiftyNineMin = new Date(now - 3599 * 1000);
    expect(formatTimeAgo(fiftyNineMin, now)).toBe('59 minutes ago');
  });

  it('returns "X hours ago" for 3600s–86399s', () => {
    const oneHour = new Date(now - 3600 * 1000);
    expect(formatTimeAgo(oneHour, now)).toBe('1 hours ago');

    const twentyThreeHours = new Date(now - 23 * 3600 * 1000 - 59 * 60 * 1000);
    expect(formatTimeAgo(twentyThreeHours, now)).toBe('23 hours ago');
  });

  it('returns "X days ago" for >= 86400s', () => {
    const oneDay = new Date(now - 86400 * 1000);
    expect(formatTimeAgo(oneDay, now)).toBe('1 days ago');

    const tenDays = new Date(now - 10 * 86400 * 1000);
    expect(formatTimeAgo(tenDays, now)).toBe('10 days ago');
  });

  it('returns empty string for invalid date', () => {
    expect(formatTimeAgo(new Date('invalid'))).toBe('');
    expect(formatTimeAgo(new Date(NaN))).toBe('');
  });

  it('handles boundary conditions', () => {
    expect(formatTimeAgo(new Date(now - 59 * 1000), now)).toBe('just now');
    expect(formatTimeAgo(new Date(now - 60 * 1000), now)).toBe('1 minutes ago');
    expect(formatTimeAgo(new Date(now - 3599 * 1000), now)).toBe(
      '59 minutes ago'
    );
    expect(formatTimeAgo(new Date(now - 3600 * 1000), now)).toBe('1 hours ago');
    expect(formatTimeAgo(new Date(now - 86399 * 1000), now)).toBe(
      '23 hours ago'
    );
    expect(formatTimeAgo(new Date(now - 86400 * 1000), now)).toBe('1 days ago');
  });
});

describe('formatDuration', () => {
  it('returns minutes for short durations', () => {
    expect(formatDuration('2026-02-06T14:00:00Z', '2026-02-06T14:30:00Z')).toBe(
      '30m'
    );
  });

  it('returns hours and minutes for medium durations', () => {
    expect(formatDuration('2026-02-06T14:00:00Z', '2026-02-06T16:30:00Z')).toBe(
      '2h 30m'
    );
  });

  it('returns hours without minutes when exact', () => {
    expect(formatDuration('2026-02-06T14:00:00Z', '2026-02-06T17:00:00Z')).toBe(
      '3h'
    );
  });

  it('returns days and hours for long durations', () => {
    expect(formatDuration('2026-02-06T14:00:00Z', '2026-02-08T18:00:00Z')).toBe(
      '2d 4h'
    );
  });

  it('returns days without hours when exact', () => {
    expect(formatDuration('2026-02-06T14:00:00Z', '2026-02-08T14:00:00Z')).toBe(
      '2d'
    );
  });

  it('returns "<1m" for very short durations', () => {
    expect(formatDuration('2026-02-06T14:00:00Z', '2026-02-06T14:00:30Z')).toBe(
      '<1m'
    );
  });

  it('returns null when end is before start', () => {
    expect(
      formatDuration('2026-02-06T16:00:00Z', '2026-02-06T14:00:00Z')
    ).toBeNull();
  });

  it('returns null for equal timestamps', () => {
    expect(
      formatDuration('2026-02-06T14:00:00Z', '2026-02-06T14:00:00Z')
    ).toBeNull();
  });

  it('returns null for invalid dates', () => {
    expect(formatDuration('invalid', '2026-02-06T14:00:00Z')).toBeNull();
    expect(formatDuration('2026-02-06T14:00:00Z', 'invalid')).toBeNull();
  });
});
