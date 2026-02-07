import type { Issue } from '../types/activity';
import { handleAvatarError } from '../utils/avatar';

interface IssueListProps {
  issues: Issue[];
  repoUrl: string;
  filteredAgent?: string | null;
}

export function IssueList({
  issues,
  repoUrl,
  filteredAgent,
}: IssueListProps): React.ReactElement {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        {filteredAgent ? `No issues from ${filteredAgent}` : 'No issues yet'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {issues.map((issue) => (
        <li key={issue.number} className="text-sm">
          <a
            href={`${repoUrl}/issues/${issue.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 dark:text-amber-300">
                #{issue.number}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  issue.state === 'open'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                }`}
              >
                {issue.state}
              </span>
            </div>
            <p
              title={issue.title}
              className="text-amber-800 dark:text-amber-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-100"
            >
              {issue.title}
            </p>
            {issue.labels.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {issue.labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="text-xs px-1 py-0.5 bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 rounded"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-1.5">
              <img
                src={`https://github.com/${issue.author}.png`}
                alt={issue.author}
                className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                onError={handleAvatarError}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {issue.author}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
