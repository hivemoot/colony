export function formatTimeAgo(date: Date, now = Date.now()): string {
  const ms = date.getTime();
  if (isNaN(ms)) return '';

  const seconds = Math.floor((now - ms) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/**
 * Formats a duration in hours as a compact human-readable string.
 * Examples: 0.5 → "30m", 2 → "2h", 14 → "14h", 25.5 → "1d 1.5h"
 */
export function formatHours(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes < 1 ? '<1m' : `${minutes}m`;
  }
  if (hours < 24) {
    return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  if (remaining < 0.5) return `${days}d`;
  return `${days}d ${remaining.toFixed(0)}h`;
}

/**
 * Formats the duration between two ISO timestamps as a compact string.
 * Returns null if either timestamp is missing.
 */
export function formatDuration(
  startIso: string,
  endIso: string
): string | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (isNaN(start) || isNaN(end) || end <= start) return null;

  const totalMinutes = Math.floor((end - start) / 60_000);

  if (totalMinutes < 1) return '<1m';
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
