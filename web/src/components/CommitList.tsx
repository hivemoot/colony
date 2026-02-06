import type { Commit } from '../types/activity';
import { handleAvatarError } from '../utils/avatar';
import { formatTimeAgo } from '../utils/time';

interface CommitListProps {
  commits: Commit[];
  repoUrl: string;
  filteredAgent?: string | null;
}

export function CommitList({
  commits,
  repoUrl,
  filteredAgent,
}: CommitListProps): React.ReactElement {
  if (commits.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        {filteredAgent ? `No commits from ${filteredAgent}` : 'No commits yet'}
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
            className="group block transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
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
                onError={handleAvatarError}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {commit.author}
              </p>
            </div>
            <time
              dateTime={commit.date}
              className="text-[10px] text-amber-500 dark:text-amber-400 block mt-0.5"
            >
              {formatTimeAgo(new Date(commit.date))}
            </time>
          </a>
        </li>
      ))}
    </ul>
  );
}
