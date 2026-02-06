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
