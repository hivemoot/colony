import type { ActivityData } from '../types/activity';

export interface DayActivity {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Total activity count for the day */
  count: number;
  /** Breakdown by activity type */
  breakdown: {
    commits: number;
    issues: number;
    prs: number;
    comments: number;
  };
}

/**
 * Aggregate all timestamped events in ActivityData into per-day activity counts.
 *
 * Returns one entry per day for the last `days` calendar days ending at `now`,
 * ordered oldest-first.  Days with no activity have count = 0.
 */
export function computeActivityHeatmap(
  data: ActivityData,
  days = 14,
  now = new Date()
): DayActivity[] {
  const dayMap = new Map<string, DayActivity>();

  // Pre-populate every day so empty days are represented (UTC)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = toUTCDateKey(d);
    dayMap.set(key, {
      date: key,
      count: 0,
      breakdown: { commits: 0, issues: 0, prs: 0, comments: 0 },
    });
  }

  const increment = (
    dateStr: string,
    field: keyof DayActivity['breakdown']
  ): void => {
    const key = toUTCDateKey(new Date(dateStr));
    const entry = dayMap.get(key);
    if (entry) {
      entry.count++;
      entry.breakdown[field]++;
    }
  };

  for (const c of data.commits) increment(c.date, 'commits');
  for (const i of data.issues) increment(i.createdAt, 'issues');
  for (const pr of data.pullRequests) increment(pr.createdAt, 'prs');
  for (const c of data.comments) increment(c.createdAt, 'comments');

  // Return oldest-first
  return Array.from(dayMap.values());
}

/** Extract YYYY-MM-DD from a Date object in UTC. */
function toUTCDateKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Map a raw count to a 0-4 intensity level for color styling.
 * 0 = no activity, 4 = max activity (relative to the dataset).
 */
export function intensityLevel(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
