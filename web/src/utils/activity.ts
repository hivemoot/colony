import type { ActivityData, ActivityEvent } from '../types/activity';

export const DEFAULT_EVENT_LIMIT = 30;

export interface GitHubEvent {
  id: string;
  type: string;
  actor?: { login: string };
  repo?: { name: string };
  created_at: string;
  payload?: unknown;
}

export function buildStaticEvents(
  data: ActivityData,
  maxEvents = DEFAULT_EVENT_LIMIT
): ActivityEvent[] {
  const repoUrl = data.repository.url;

  const commitEvents = data.commits.map((commit) => ({
    id: `commit-${commit.sha}`,
    type: 'commit' as const,
    summary: 'Commit pushed',
    title: `${commit.sha} ${commit.message}`.trim(),
    url: `${repoUrl}/commit/${commit.sha}`,
    actor: commit.author,
    createdAt: commit.date,
  }));

  const issueEvents = data.issues.map((issue) => {
    const summary = issue.state === 'closed' ? 'Issue Closed' : 'Issue Opened';
    const createdAt =
      issue.state === 'closed' && issue.closedAt
        ? issue.closedAt
        : issue.createdAt;

    return {
      id: `issue-${issue.number}-${issue.state}`,
      type: 'issue' as const,
      summary,
      title: `#${issue.number} ${issue.title}`,
      url: `${repoUrl}/issues/${issue.number}`,
      actor: issue.author ?? 'unknown',
      createdAt,
    };
  });

  const pullRequestEvents = data.pullRequests.map((pr) => {
    const summary =
      pr.state === 'merged'
        ? 'PR Merged'
        : pr.state === 'closed'
          ? 'PR Closed'
          : 'PR Opened';
    const createdAt =
      pr.state === 'merged' && pr.mergedAt
        ? pr.mergedAt
        : pr.state === 'closed' && pr.closedAt
          ? pr.closedAt
          : pr.createdAt;

    return {
      id: `pr-${pr.number}-${pr.state}`,
      type:
        pr.state === 'merged' ? ('merge' as const) : ('pull_request' as const),
      summary,
      title: `#${pr.number} ${pr.title}`,
      url: `${repoUrl}/pull/${pr.number}`,
      actor: pr.author,
      createdAt,
    };
  });

  const commentEvents = data.comments.map((comment) => {
    const isReview = comment.type === 'review';
    const typeLabel = comment.type === 'pr' ? 'PR' : comment.type;
    const summary = isReview
      ? 'PR review submitted'
      : `Commented on ${typeLabel}`;

    return {
      id: `comment-${comment.id}`,
      type: isReview ? ('review' as const) : ('comment' as const),
      summary,
      title: `#${comment.issueOrPrNumber}`,
      url: comment.url,
      actor: comment.author,
      createdAt: comment.createdAt,
    };
  });

  return sortAndLimit(
    [...commitEvents, ...issueEvents, ...pullRequestEvents, ...commentEvents],
    maxEvents
  );
}

export function buildLiveEvents(
  rawEvents: GitHubEvent[],
  fallbackRepoUrl: string,
  maxEvents = DEFAULT_EVENT_LIMIT
): ActivityEvent[] {
  const mapped = rawEvents
    .map((event) => mapGitHubEvent(event, fallbackRepoUrl))
    .filter((event): event is ActivityEvent => Boolean(event));

  return sortAndLimit(mapped, maxEvents);
}

function mapGitHubEvent(
  event: GitHubEvent,
  fallbackRepoUrl: string
): ActivityEvent | null {
  const actor = event.actor?.login ?? 'unknown';
  const createdAt = event.created_at;
  const repoUrl = event.repo?.name
    ? `https://github.com/${event.repo.name}`
    : fallbackRepoUrl;

  switch (event.type) {
    case 'PushEvent': {
      const payload = event.payload as {
        commits?: Array<{ sha: string; message: string }>;
      };
      const commit = payload?.commits?.[0];
      if (!commit) return null;
      const shortSha = commit.sha?.slice(0, 7);
      const message = commit.message?.split('\n')[0] ?? 'Commit';
      return {
        id: event.id,
        type: 'commit',
        summary: 'Commit pushed',
        title: `${shortSha ?? ''} ${message}`.trim(),
        url: commit.sha ? `${repoUrl}/commit/${commit.sha}` : repoUrl,
        actor,
        createdAt,
      };
    }
    case 'IssuesEvent': {
      const payload = event.payload as {
        action?: string;
        issue?: { number: number; title: string; html_url: string };
      };
      if (!payload.issue) return null;
      return {
        id: event.id,
        type: 'issue',
        summary: `Issue ${formatAction(payload.action)}`,
        title: `#${payload.issue.number} ${payload.issue.title}`,
        url: payload.issue.html_url,
        actor,
        createdAt,
      };
    }
    case 'IssueCommentEvent': {
      const payload = event.payload as {
        issue?: { number: number; title: string; html_url: string };
        comment?: { html_url: string };
      };
      if (!payload.issue) return null;
      return {
        id: event.id,
        type: 'comment',
        summary: 'Commented on issue',
        title: `#${payload.issue.number} ${payload.issue.title}`,
        url: payload.comment?.html_url ?? payload.issue.html_url,
        actor,
        createdAt,
      };
    }
    case 'PullRequestEvent': {
      const payload = event.payload as {
        action?: string;
        pull_request?: {
          number: number;
          title: string;
          html_url: string;
          merged?: boolean;
        };
      };
      if (!payload.pull_request) return null;
      const merged = payload.action === 'closed' && payload.pull_request.merged;
      return {
        id: event.id,
        type: merged ? 'merge' : 'pull_request',
        summary: merged ? 'PR Merged' : `PR ${formatAction(payload.action)}`,
        title: `#${payload.pull_request.number} ${payload.pull_request.title}`,
        url: payload.pull_request.html_url,
        actor,
        createdAt,
      };
    }
    case 'PullRequestReviewCommentEvent': {
      const payload = event.payload as {
        pull_request?: { number: number; title: string; html_url: string };
        comment?: { html_url: string };
      };
      if (!payload.pull_request) return null;
      return {
        id: event.id,
        type: 'comment',
        summary: 'Commented on PR',
        title: `#${payload.pull_request.number} ${payload.pull_request.title}`,
        url: payload.comment?.html_url ?? payload.pull_request.html_url,
        actor,
        createdAt,
      };
    }
    case 'PullRequestReviewEvent': {
      const payload = event.payload as {
        pull_request?: { number: number; title: string; html_url: string };
        review?: { state?: string };
      };
      if (!payload.pull_request) return null;
      return {
        id: event.id,
        type: 'review',
        summary: `PR review ${formatAction(payload.review?.state)}`,
        title: `#${payload.pull_request.number} ${payload.pull_request.title}`,
        url: payload.pull_request.html_url,
        actor,
        createdAt,
      };
    }
    default:
      return null;
  }
}

export function formatAction(action?: string): string {
  if (!action) return 'updated';
  const normalized = action.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sortAndLimit(
  events: ActivityEvent[],
  maxEvents: number
): ActivityEvent[] {
  return [...events]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, maxEvents);
}
