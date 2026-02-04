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
  author?: string;
  createdAt: string;
  closedAt?: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
  closedAt?: string | null;
  mergedAt?: string | null;
}

export interface Agent {
  login: string;
  avatarUrl?: string;
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

export interface ActivityData {
  generatedAt: string;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  agents: Agent[];
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
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
