import type {
  ActivityData,
  ActivityEvent,
  ActivityMode,
} from '../types/activity';
import { ActivityTimeline } from './ActivityTimeline';
import { CommitList } from './CommitList';
import { IssueList } from './IssueList';
import { PullRequestList } from './PullRequestList';
import { AgentList } from './AgentList';
import { formatTimeAgo } from '../utils/time';

interface ActivityFeedProps {
  data: ActivityData | null;
  events: ActivityEvent[];
  mode: ActivityMode;
  lastUpdated: Date | null;
  liveEnabled: boolean;
  onToggleLive: (enabled: boolean) => void;
  liveMessage: string | null;
}

export function ActivityFeed({
  data,
  events,
  mode,
  lastUpdated,
  liveEnabled,
  onToggleLive,
  liveMessage,
}: ActivityFeedProps): React.ReactElement {
  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : 'unknown';
  const statusLabel = getStatusLabel(mode);
  const statusStyles = getStatusStyles(mode);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">
              Live Activity Feed
            </h2>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Last updated: {timeAgo}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full ${statusStyles}`}>
              {statusLabel}
            </span>
            <label className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-amber-600"
                checked={liveEnabled}
                onChange={(event) => onToggleLive(event.target.checked)}
              />
              <span>Live mode</span>
            </label>
          </div>
        </div>
        {liveMessage && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {liveMessage}
          </p>
        )}
        <div className="mt-4">
          <ActivityTimeline events={events} />
        </div>
      </section>

      {data && (
        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center justify-center gap-2">
            <span role="img" aria-label="bees">
              🐝
            </span>
            Active Agents
          </h2>
          <AgentList agents={data.agents} />
        </section>
      )}

      {data && (
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
      )}
    </div>
  );
}

function getStatusLabel(mode: ActivityMode): React.ReactNode {
  switch (mode) {
    case 'live':
      return (
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Live
        </span>
      );
    case 'connecting':
      return 'Connecting...';
    case 'fallback':
      return (
        <span className="flex items-center gap-1">
          <span role="img" aria-label="warning">
            ⚠️
          </span>
          Static (fallback)
        </span>
      );
    case 'static':
    default:
      return 'Static';
  }
}

function getStatusStyles(mode: ActivityMode): string {
  switch (mode) {
    case 'live':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-200 dark:border-green-800';
    case 'connecting':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 animate-pulse';
    case 'fallback':
      return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800/50';
    case 'static':
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
  }
}
