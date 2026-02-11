import type { PullRequest } from '../types/activity';
import { handleAvatarError, getGitHubAvatarUrl } from '../utils/avatar';
import { formatTimeAgo } from '../utils/time';

interface PullRequestListProps {
  pullRequests: PullRequest[];
  repoUrl: string;
  filteredAgent?: string | null;
}

export function PullRequestList({
  pullRequests,
  repoUrl,
  filteredAgent,
}: PullRequestListProps): React.ReactElement {
  if (pullRequests.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        {filteredAgent
          ? `No pull requests from ${filteredAgent}`
          : 'No pull requests yet'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {pullRequests.map((pr) => (
        <li key={pr.number} className="text-sm">
          <a
            href={`${repoUrl}/pull/${pr.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 dark:text-amber-300">
                #{pr.number}
              </span>
              {pr.draft && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  draft
                </span>
              )}
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${getStateStyles(pr.state)}`}
              >
                {pr.state}
              </span>
            </div>
            <p
              title={pr.title}
              className="text-amber-800 dark:text-amber-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-100"
            >
              {pr.title}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <img
                src={getGitHubAvatarUrl(pr.author)}
                alt=""
                loading="lazy"
                className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                onError={handleAvatarError}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {pr.author}
              </p>
            </div>
            <time
              dateTime={pr.mergedAt ?? pr.closedAt ?? pr.createdAt}
              className="text-xs text-amber-500 dark:text-amber-400 block mt-0.5"
            >
              {formatTimeAgo(
                new Date(pr.mergedAt ?? pr.closedAt ?? pr.createdAt)
              )}
            </time>
          </a>
        </li>
      ))}
    </ul>
  );
}

function getStateStyles(state: PullRequest['state']): string {
  switch (state) {
    case 'open':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'merged':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'closed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }
}
