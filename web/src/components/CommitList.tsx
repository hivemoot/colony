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
            <p className="text-amber-800 dark:text-amber-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-100">
              {commit.message}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              by {commit.author}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}
