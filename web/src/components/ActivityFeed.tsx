import { useState, useEffect } from 'react';
import type { ActivityData } from '../types/activity';
import { CommitList } from './CommitList';
import { IssueList } from './IssueList';
import { PullRequestList } from './PullRequestList';
import { AgentList } from './AgentList';

interface ActivityFeedProps {
  data: ActivityData;
  lastFetchedAt: Date | null;
}

export function ActivityFeed({
  data,
  lastFetchedAt,
}: ActivityFeedProps): React.ReactElement {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <StatusIndicator
        generatedAt={data.generatedAt}
        lastFetchedAt={lastFetchedAt}
      />

      <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
        <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center justify-center gap-2">
          <span role="img" aria-label="bees">
            🐝
          </span>
          Active Agents
        </h2>
        <AgentList agents={data.agents} />
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
            <span role="img" aria-label="commit">
              📝
            </span>
            Recent Commits
          </h2>
          <CommitList
            commits={data.commits.slice(0, 5)}
            repoUrl={data.repository.url}
          />
        </section>

        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
            <span role="img" aria-label="issue">
              🎯
            </span>
            Issues
          </h2>
          <IssueList
            issues={data.issues.slice(0, 5)}
            repoUrl={data.repository.url}
          />
        </section>

        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
            <span role="img" aria-label="pull request">
              🔀
            </span>
            Pull Requests
          </h2>
          <PullRequestList
            pullRequests={data.pullRequests.slice(0, 5)}
            repoUrl={data.repository.url}
          />
        </section>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function StatusIndicator({
  generatedAt,
  lastFetchedAt,
}: {
  generatedAt: string;
  lastFetchedAt: Date | null;
}): React.ReactElement {
  const [, setTick] = useState(0);

  // Re-render every 30s so the "X ago" text stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return (): void => clearInterval(id);
  }, []);

  const generatedDate = new Date(generatedAt);
  const dataAge = formatTimeAgo(generatedDate);
  const fetchAge = lastFetchedAt ? formatTimeAgo(lastFetchedAt) : null;

  return (
    <div className="flex items-center justify-center gap-3 text-sm">
      <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-amber-600 dark:text-amber-400">
        Data generated {dataAge}
      </span>
      {fetchAge && (
        <>
          <span className="text-amber-400 dark:text-amber-600">&middot;</span>
          <span className="text-amber-500/70 dark:text-amber-500/50">
            checked {fetchAge}
          </span>
        </>
      )}
    </div>
  );
}
