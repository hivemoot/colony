import type { Commit } from '../types/activity';

interface CommitListProps {
  commits: Commit[];
  repoUrl: string;
}

export function CommitList({
  commits,
  repoUrl,
}: CommitListProps): React.ReactElement {
  if (commits.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No commits yet
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {commits.map((commit) => (
        <li key={commit.sha} className="text-sm">
          <a
            href={`${repoUrl}/commit/${commit.sha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <code className="text-[10px] text-amber-600 dark:text-amber-400 font-mono group-hover:text-amber-700 dark:group-hover:text-amber-300">
              {commit.sha.substring(0, 7)}
            </code>
            <p className="text-amber-900 dark:text-amber-100 font-medium truncate group-hover:text-amber-700 dark:group-hover:text-amber-200">
              {commit.message}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <img
                src={`https://github.com/${commit.author}.png`}
                alt={commit.author}
                className="w-4 h-4 rounded-full border border-amber-100 dark:border-neutral-700"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';
                }}
              />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {commit.author}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
