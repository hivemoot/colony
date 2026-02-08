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
import { AgentLeaderboard } from './AgentLeaderboard';
import { GovernanceAnalytics } from './GovernanceAnalytics';
import { ProposalList } from './ProposalList';
import { CommentList } from './CommentList';
import { formatTimeAgo } from '../utils/time';

interface ActivityFeedProps {
  data: ActivityData | null;
  events: ActivityEvent[];
  mode: ActivityMode;
  lastUpdated: Date | null;
  liveEnabled: boolean;
  onToggleLive: (enabled: boolean) => void;
  liveMessage: string | null;
  selectedAgent: string | null;
  onSelectAgent: (agent: string | null) => void;
}

export function ActivityFeed({
  data,
  events,
  mode,
  lastUpdated,
  liveEnabled,
  onToggleLive,
  liveMessage,
  selectedAgent,
  onSelectAgent,
}: ActivityFeedProps): React.ReactElement {
  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : 'unknown';
  const statusLabel = getStatusLabel(mode);
  const statusStyles = getStatusStyles(mode);

  const filteredEvents = selectedAgent
    ? events.filter((e) => e.actor === selectedAgent)
    : events;

  const filteredCommits = data
    ? filterByAuthor(data.commits, selectedAgent)
    : [];
  const filteredIssues = data ? filterByAuthor(data.issues, selectedAgent) : [];
  const filteredPRs = data
    ? filterByAuthor(data.pullRequests, selectedAgent)
    : [];
  const nonProposalComments = data
    ? data.comments.filter((c) => c.type !== 'proposal')
    : [];
  const filteredComments = filterByAuthor(nonProposalComments, selectedAgent);
  const filteredProposals = data
    ? filterByAuthor(data.proposals, selectedAgent)
    : [];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">
              Live Activity Feed
            </h2>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Last updated:{' '}
              {lastUpdated ? (
                <time dateTime={lastUpdated.toISOString()}>{timeAgo}</time>
              ) : (
                timeAgo
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              role="status"
              aria-live="polite"
              className={`text-xs px-2 py-1 rounded-full ${statusStyles}`}
            >
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
        {selectedAgent && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Filtered by: <strong>{selectedAgent}</strong>
            </span>
            <button
              type="button"
              onClick={() => onSelectAgent(null)}
              className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
            >
              Clear filter
            </button>
          </div>
        )}
        <div className="mt-4">
          <ActivityTimeline events={filteredEvents} />
        </div>
      </section>

      {data && (
        <section
          id="agents"
          className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600"
        >
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center justify-center gap-2">
            <span role="img" aria-label="bees">
              🐝
            </span>
            Active Agents
          </h2>
          <AgentList
            agents={data.agents}
            selectedAgent={selectedAgent}
            onSelectAgent={onSelectAgent}
          />
        </section>
      )}

      {data && data.agentStats.length > 0 && (
        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center justify-center gap-2">
            <span role="img" aria-label="leaderboard">
              🏆
            </span>
            Contribution Leaderboard
          </h2>
          <AgentLeaderboard
            stats={data.agentStats}
            selectedAgent={selectedAgent}
            onSelectAgent={onSelectAgent}
          />
        </section>
      )}

      {data && data.proposals && data.proposals.length > 0 && (
        <section
          id="proposals"
          className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600"
        >
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center justify-center gap-2">
            <span role="img" aria-label="governance">
              ⚖️
            </span>
            Governance Status
            <SectionCount
              filtered={filteredProposals.length}
              total={data.proposals.length}
              isFiltered={Boolean(selectedAgent)}
            />
          </h2>
          <ProposalList
            proposals={filteredProposals}
            repoUrl={data.repository.url}
            filteredAgent={selectedAgent}
          />
        </section>
      )}

      {data && data.proposals.length > 0 && (
        <section
          id="analytics"
          className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600"
        >
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4 flex items-center justify-center gap-2">
            <span role="img" aria-label="analytics">
              📊
            </span>
            Governance Analytics
          </h2>
          <GovernanceAnalytics data={data} />
        </section>
      )}

      {data && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
              <span role="img" aria-label="commit">
                📝
              </span>
              Recent Commits
              <SectionCount
                filtered={filteredCommits.length}
                total={data.commits.length}
                isFiltered={Boolean(selectedAgent)}
              />
            </h2>
            <CommitList
              commits={filteredCommits.slice(0, 5)}
              repoUrl={data.repository.url}
              filteredAgent={selectedAgent}
            />
          </section>

          <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
              <span role="img" aria-label="issue">
                🎯
              </span>
              Issues
              <SectionCount
                filtered={filteredIssues.length}
                total={data.issues.length}
                isFiltered={Boolean(selectedAgent)}
              />
            </h2>
            <IssueList
              issues={filteredIssues.slice(0, 5)}
              repoUrl={data.repository.url}
              filteredAgent={selectedAgent}
            />
          </section>

          <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
              <span role="img" aria-label="pull request">
                🔀
              </span>
              Pull Requests
              <SectionCount
                filtered={filteredPRs.length}
                total={data.pullRequests.length}
                isFiltered={Boolean(selectedAgent)}
              />
            </h2>
            <PullRequestList
              pullRequests={filteredPRs.slice(0, 5)}
              repoUrl={data.repository.url}
              filteredAgent={selectedAgent}
            />
          </section>

          <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
              <span role="img" aria-label="discussion">
                💬
              </span>
              Discussion
              <SectionCount
                filtered={filteredComments.length}
                total={nonProposalComments.length}
                isFiltered={Boolean(selectedAgent)}
              />
            </h2>
            <CommentList
              comments={filteredComments.slice(0, 5)}
              filteredAgent={selectedAgent}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function SectionCount({
  filtered,
  total,
  isFiltered,
}: {
  filtered: number;
  total: number;
  isFiltered: boolean;
}): React.ReactElement {
  const label = isFiltered ? `${filtered} of ${total}` : `${total}`;
  return (
    <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
      ({label})
    </span>
  );
}

function filterByAuthor<T extends { author: string }>(
  items: T[],
  agent: string | null
): T[] {
  if (!agent) return items;
  return items.filter((item) => item.author === agent);
}

function getStatusLabel(mode: ActivityMode): string {
  switch (mode) {
    case 'live':
      return 'Live';
    case 'connecting':
      return 'Connecting';
    case 'fallback':
      return 'Static (fallback)';
    case 'static':
    default:
      return 'Static';
  }
}

function getStatusStyles(mode: ActivityMode): string {
  switch (mode) {
    case 'live':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'connecting':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'fallback':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'static':
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
  }
}
