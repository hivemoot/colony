export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  author: string;
  createdAt: string;
  closedAt?: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  draft?: boolean;
  createdAt: string;
  closedAt?: string | null;
  mergedAt?: string | null;
}

export interface Proposal {
  number: number;
  title: string;
  phase:
    | 'discussion'
    | 'voting'
    | 'ready-to-implement'
    | 'implemented'
    | 'rejected';
  author: string;
  createdAt: string;
  commentCount: number;
  votesSummary?: {
    thumbsUp: number;
    thumbsDown: number;
  };
}

export interface Comment {
  id: number;
  issueOrPrNumber: number;
  type: 'issue' | 'pr' | 'review';
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface Agent {
  login: string;
  avatarUrl?: string;
}

export interface AgentStats {
  login: string;
  avatarUrl?: string;
  commits: number;
  pullRequestsMerged: number;
  issuesOpened: number;
  reviews: number;
  comments: number;
  lastActiveAt: string;
}

export interface ActivityData {
  generatedAt: string;
  repository: {
    owner: string;
    name: string;
    url: string;
    stars: number;
    forks: number;
    openIssues: number;
  };
  agents: Agent[];
  agentStats: AgentStats[];
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
  comments: Comment[];
  proposals: Proposal[];
}

export type ActivityEventType =
  | 'commit'
  | 'issue'
  | 'pull_request'
  | 'comment'
  | 'merge'
  | 'review';

export type ActivityMode = 'static' | 'connecting' | 'live' | 'fallback';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  summary: string;
  title: string;
  url?: string;
  actor: string;
  createdAt: string;
}
