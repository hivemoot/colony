import type { ActivityEvent, ActivityEventType } from '../types/activity';
import { formatTimeAgo } from '../utils/time';

interface ActivityTimelineProps {
  events: ActivityEvent[];
}

const EVENT_STYLES: Record<
  ActivityEventType,
  { icon: string; dotClass: string; badgeClass: string; label: string }
> = {
  commit: {
    icon: '📝',
    dotClass: 'bg-amber-500',
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    label: 'Commit',
  },
  issue: {
    icon: '🎯',
    dotClass: 'bg-orange-500',
    badgeClass:
      'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    label: 'Issue',
  },
  pull_request: {
    icon: '🔀',
    dotClass: 'bg-sky-500',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    label: 'PR',
  },
  merge: {
    icon: '✅',
    dotClass: 'bg-green-500',
    badgeClass:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    label: 'Merge',
  },
  comment: {
    icon: '💬',
    dotClass: 'bg-teal-500',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    label: 'Comment',
  },
  review: {
    icon: '🧭',
    dotClass: 'bg-slate-500',
    badgeClass:
      'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
    label: 'Review',
  },
};

export function ActivityTimeline({
  events,
}: ActivityTimelineProps): React.ReactElement {
  if (events.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No recent activity yet
      </p>
    );
  }

  return (
    <ul className="space-y-6 relative">
      {/* Vertical line */}
      <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-amber-200 dark:bg-neutral-700" />

      {events.map((event) => {
        const style = EVENT_STYLES[event.type];
        const eventDate = new Date(event.createdAt);
        const timeAgo = formatTimeAgo(eventDate);

        return (
          <li key={event.id} className="relative flex gap-4">
            <div className="mt-1.5 flex flex-col items-center">
              <span
                className={`h-3 w-3 rounded-full z-10 ring-4 ring-amber-50 dark:ring-neutral-800 ${style.dotClass}`}
              />
            </div>
            <div className="flex-1 bg-white/30 dark:bg-neutral-800/30 rounded-lg p-3 border border-amber-100/50 dark:border-neutral-700/50 hover:border-amber-200 dark:hover:border-neutral-600 transition-colors shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-300">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${style.badgeClass}`}
                >
                  <span role="img" aria-label={style.label}>
                    {style.icon}
                  </span>
                  {event.summary}
                </span>
                <span className="text-amber-400 dark:text-neutral-600">•</span>
                <span>{timeAgo}</span>
              </div>
              {event.url ? (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 block text-amber-900 dark:text-amber-100 font-bold hover:text-amber-600 dark:hover:text-amber-300 leading-tight"
                >
                  {event.title}
                </a>
              ) : (
                <p className="mt-1.5 text-amber-900 dark:text-amber-100 font-bold leading-tight">
                  {event.title}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-100/30 dark:border-neutral-700/30">
                <img
                  src={`https://github.com/${event.actor}.png`}
                  alt={event.actor}
                  className="w-5 h-5 rounded-full border border-amber-200 dark:border-neutral-600"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';
                  }}
                />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {event.actor}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
