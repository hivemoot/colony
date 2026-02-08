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
  draft?: boolean;
  author: string;
  createdAt: string;
  closedAt?: string | null;
  mergedAt?: string | null;
}

export interface PhaseTransition {
  phase: string;
  enteredAt: string;
}

export interface Proposal {
  number: number;
  title: string;
  phase:
    | 'discussion'
    | 'voting'
    | 'extended-voting'
    | 'ready-to-implement'
    | 'implemented'
    | 'rejected'
    | 'inconclusive';
  author: string;
  createdAt: string;
  commentCount: number;
  votesSummary?: {
    thumbsUp: number;
    thumbsDown: number;
  };
  phaseTransitions?: PhaseTransition[];
}

export interface Comment {
  id: number;
  issueOrPrNumber: number;
  type: 'issue' | 'pr' | 'review' | 'proposal';
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

export interface RepositoryConfig {
  owner: string;
  name: string;
  url: string;
}

export interface ActivityData {
  generatedAt: string;
  repository: RepositoryConfig & {
    stars: number;
    forks: number;
    openIssues: number;
  };
  agents: Agent[];
  agentStats: AgentStats[];
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
  proposals: Proposal[];
  comments: Comment[];
}
