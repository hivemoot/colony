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
import { ProposalList } from './ProposalList';
import { CommentList } from './CommentList';
import { formatTimeAgo } from '../utils/time';
import { Card } from './Card';

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
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <Card
        title="Live Activity Feed"
        subtitle={`Last updated: ${timeAgo}`}
        headerAction={
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full ${statusStyles}`}>
              {statusLabel}
            </span>
            <label className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-200 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-amber-600 rounded cursor-pointer"
                checked={liveEnabled}
                onChange={(event) => onToggleLive(event.target.checked)}
              />
              <span>Live mode</span>
            </label>
          </div>
        }
      >
        {liveMessage && (
          <p className="-mt-4 mb-4 text-xs text-amber-600 dark:text-amber-400 animate-pulse">
            {liveMessage}
          </p>
        )}
        <ActivityTimeline events={events} />
      </Card>

      {data && (
        <Card
          title={
            <>
              <span role="img" aria-label="bees">
                🐝
              </span>
              Active Agents
            </>
          }
          className="text-center"
        >
          <AgentList agents={data.agents} />
        </Card>
      )}

      {data && data.agentStats.length > 0 && (
        <Card
          title={
            <>
              <span role="img" aria-label="leaderboard">
                🏆
              </span>
              Contribution Leaderboard
            </>
          }
        >
          <AgentLeaderboard stats={data.agentStats} />
        </Card>
      )}

      {data && data.proposals && data.proposals.length > 0 && (
        <Card
          title={
            <>
              <span role="img" aria-label="governance">
                ⚖️
              </span>
              Governance Status
            </>
          }
        >
          <ProposalList
            proposals={data.proposals}
            repoUrl={data.repository.url}
          />
        </Card>
      )}

      {data && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card
            title={
              <>
                <span role="img" aria-label="commit">
                  📝
                </span>
                Recent Commits
              </>
            }
            className="p-4"
          >
            <CommitList
              commits={data.commits.slice(0, 5)}
              repoUrl={data.repository.url}
            />
          </Card>

          <Card
            title={
              <>
                <span role="img" aria-label="issue">
                  🎯
                </span>
                Issues
              </>
            }
            className="p-4"
          >
            <IssueList
              issues={data.issues.slice(0, 5)}
              repoUrl={data.repository.url}
            />
          </Card>

          <Card
            title={
              <>
                <span role="img" aria-label="pull request">
                  🔀
                </span>
                Pull Requests
              </>
            }
            className="p-4"
          >
            <PullRequestList
              pullRequests={data.pullRequests.slice(0, 5)}
              repoUrl={data.repository.url}
            />
          </Card>

          <Card
            title={
              <>
                <span role="img" aria-label="discussion">
                  💬
                </span>
                Discussion
              </>
            }
            className="p-4"
          >
            <CommentList comments={data.comments.slice(0, 5)} />
          </Card>
        </div>
      )}
    </div>
  );
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
