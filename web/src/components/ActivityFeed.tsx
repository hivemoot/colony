import type { ActivityData } from '../types/activity';
import type { FetchMode } from '../hooks/useActivityData';
import { CommitList } from './CommitList';
import { IssueList } from './IssueList';
import { PullRequestList } from './PullRequestList';
import { AgentList } from './AgentList';
import { useState, useEffect } from 'react';

interface ActivityFeedProps {
  data: ActivityData;
  mode: FetchMode;
  onModeChange: (mode: FetchMode) => void;
  lastFetched: Date | null;
  isRateLimited: boolean;
  onRefresh: () => void;
}

export function ActivityFeed({
  data,
  mode,
  onModeChange,
  lastFetched,
  isRateLimited,
  onRefresh,
}: ActivityFeedProps): React.ReactElement {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeAgo = lastFetched ? formatTimeAgo(lastFetched, now) : 'never';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-4 bg-white/30 dark:bg-neutral-800/30 p-1 rounded-full border border-amber-200 dark:border-neutral-700">
          <button
            onClick={() => onModeChange('static')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              mode === 'static'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-900 dark:text-amber-100 hover:bg-amber-200/50 dark:hover:bg-neutral-700/50'
            }`}
          >
            Static
          </button>
          <button
            onClick={() => onModeChange('live')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'live'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-amber-900 dark:text-amber-100 hover:bg-green-200/50 dark:hover:bg-neutral-700/50'
            }`}
          >
            {mode === 'live' && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
            )}
            Live
          </button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <span>Last updated: {timeAgo}</span>
            <button
              onClick={() => onRefresh()}
              className="hover:rotate-180 transition-transform duration-500"
              title="Refresh now"
            >
              🔄
            </button>
          </p>
          {isRateLimited && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">
              ⚠️ GitHub API rate limit reached. Using static fallback.
            </p>
          )}
        </div>
      </div>

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

function formatTimeAgo(date: Date, now: number): string {
  const seconds = Math.floor((now - date.getTime()) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
