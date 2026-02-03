import type { ActivityData } from '../types/activity';
import { CommitList } from './CommitList';
import { IssueList } from './IssueList';
import { PullRequestList } from './PullRequestList';
import { AgentList } from './AgentList';
import { CommentList } from './CommentList';

interface ActivityFeedProps {
  data: ActivityData;
}

export function ActivityFeed({ data }: ActivityFeedProps): React.ReactElement {
  const generatedDate = new Date(data.generatedAt);
  const timeAgo = formatTimeAgo(generatedDate);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <div className="text-center">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Last updated: {timeAgo}
        </p>
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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

        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-4 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
            <span role="img" aria-label="discussion">
              💬
            </span>
            Discussion
          </h2>
          <CommentList comments={data.comments.slice(0, 5)} />
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
