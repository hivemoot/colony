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
    <ul className="space-y-2">
      {commits.map((commit) => (
        <li key={commit.sha} className="text-sm">
          <a
            href={`${repoUrl}/commit/${commit.sha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <code className="text-xs text-amber-700 dark:text-amber-300 font-mono group-hover:underline">
              {commit.sha}
            </code>
            <p
              title={commit.message}
              className="text-amber-800 dark:text-amber-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-100"
            >
              {commit.message}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <img
                src={`https://github.com/${commit.author}.png`}
                alt={commit.author}
                className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';
                }}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {commit.author}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
