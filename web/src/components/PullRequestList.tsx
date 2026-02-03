import type { PullRequest } from '../types/activity';

interface PullRequestListProps {
  pullRequests: PullRequest[];
  repoUrl: string;
}

export function PullRequestList({
  pullRequests,
  repoUrl,
}: PullRequestListProps): React.ReactElement {
  if (pullRequests.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No pull requests yet
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
            className="group block"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 dark:text-amber-300">
                #{pr.number}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${getStateStyles(pr.state)}`}
              >
                {pr.state}
              </span>
            </div>
            <p className="text-amber-800 dark:text-amber-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-100">
              {pr.title}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              by {pr.author}
            </p>
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
