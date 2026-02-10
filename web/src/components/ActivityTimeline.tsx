import type { ActivityEvent, ActivityEventType } from '../types/activity';
import { formatTimeAgo } from '../utils/time';
import { handleAvatarError } from '../utils/avatar';

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
  proposal: {
    icon: '⚖️',
    dotClass: 'bg-purple-500',
    badgeClass:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    label: 'Proposal',
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
    <ul className="space-y-5" aria-label="Recent activity events">
      {events.map((event) => {
        const style = EVENT_STYLES[event.type];
        const eventDate = new Date(event.createdAt);
        const timeAgo = formatTimeAgo(eventDate);

        return (
          <li key={event.id} className="flex gap-3">
            <div className="mt-1 flex flex-col items-center">
              <span className={`h-2.5 w-2.5 rounded-full ${style.dotClass}`} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-300">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${style.badgeClass}`}
                >
                  <span role="img" aria-label={style.label}>
                    {style.icon}
                  </span>
                  {event.summary}
                </span>
                <span
                  className="text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                >
                  •
                </span>
                <time dateTime={event.createdAt}>{timeAgo}</time>
              </div>
              {event.url ? (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-amber-900 dark:text-amber-100 font-medium hover:text-amber-600 dark:hover:text-amber-200 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
                >
                  {event.title}
                </a>
              ) : (
                <p className="mt-1 text-amber-900 dark:text-amber-100 font-medium">
                  {event.title}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <img
                  src={`https://github.com/${event.actor}.png`}
                  alt=""
                  loading="lazy"
                  className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                  onError={handleAvatarError}
                />
                <a
                  href={`https://github.com/${event.actor}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
                >
                  {event.actor}
                </a>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
