import type { Issue } from '../types/activity';

interface IssueListProps {
  issues: Issue[];
  repoUrl: string;
}

export function IssueList({
  issues,
  repoUrl,
}: IssueListProps): React.ReactElement {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No issues yet
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li key={issue.number} className="text-sm">
          <a
            href={`${repoUrl}/issues/${issue.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                #{issue.number}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                  issue.state === 'open'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                    : 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                }`}
              >
                {issue.state}
              </span>
            </div>
            <p className="text-amber-900 dark:text-amber-100 font-medium truncate group-hover:text-amber-700 dark:group-hover:text-amber-200">
              {issue.title}
            </p>
            {issue.labels.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {issue.labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="text-[9px] px-1.5 py-0.5 bg-amber-100/50 dark:bg-neutral-700 text-amber-700 dark:text-amber-300 rounded border border-amber-200/50 dark:border-neutral-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
