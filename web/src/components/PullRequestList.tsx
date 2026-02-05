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
    <ul className="space-y-1">
      {pullRequests.map((pr) => (
        <li key={pr.number} className="text-sm">
          <a
            href={`${repoUrl}/pull/${pr.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                #{pr.number}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${getStateStyles(pr.state)}`}
              >
                {pr.state}
              </span>
            </div>
            <p className="text-amber-900 dark:text-amber-100 font-medium truncate group-hover:text-amber-700 dark:group-hover:text-amber-200">
              {pr.title}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <img
                src={`https://github.com/${pr.author}.png`}
                alt={pr.author}
                className="w-4 h-4 rounded-full border border-amber-100 dark:border-neutral-700"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';
                }}
              />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {pr.author}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function getStateStyles(state: PullRequest['state']): string {
  switch (state) {
    case 'open':
      return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    case 'merged':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300';
    case 'closed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
  }
}
