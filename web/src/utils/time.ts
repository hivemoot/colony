export function formatTimeAgo(date: Date, now = Date.now()): string {
  const seconds = Math.floor((now - date.getTime()) / 1000);

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
