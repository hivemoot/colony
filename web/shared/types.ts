export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  /** "owner/name" identifier for multi-repo support */
  repo?: string;
}

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  author: string;
  createdAt: string;
  closedAt?: string | null;
  /** "owner/name" identifier for multi-repo support */
  repo?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  draft?: boolean;
  author: string;
  createdAt: string;
  closedAt?: string | null;
  mergedAt?: string | null;
  /** "owner/name" identifier for multi-repo support */
  repo?: string;
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
  /** "owner/name" identifier for multi-repo support */
  repo?: string;
}

export interface Comment {
  id: number;
  issueOrPrNumber: number;
  type: 'issue' | 'pr' | 'review' | 'proposal';
  author: string;
  body: string;
  createdAt: string;
  url: string;
  /** "owner/name" identifier for multi-repo support */
  repo?: string;
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

export type RepositoryInfo = RepositoryConfig & {
  stars: number;
  forks: number;
  openIssues: number;
  watchers?: number;
  description?: string | null;
  homepage?: string | null;
  topics?: string[];
};

export interface VisibilityCheck {
  id:
    | 'has-homepage'
    | 'has-topics'
    | 'has-structured-data'
    | 'has-sitemap-lastmod'
    | 'has-robots';
  label: string;
  ok: boolean;
  details?: string;
  blockedByAdmin?: boolean;
}

export interface ExternalVisibility {
  status: 'green' | 'yellow' | 'red';
  score: number;
  checks: VisibilityCheck[];
  blockers: string[];
}

export interface ActivityData {
  generatedAt: string;
  /** Primary repository — kept for backward compatibility */
  repository: RepositoryInfo;
  /** All tracked repositories (includes primary) */
  repositories?: RepositoryInfo[];
  agents: Agent[];
  agentStats: AgentStats[];
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
  proposals: Proposal[];
  comments: Comment[];
  externalVisibility?: ExternalVisibility;
  roadmap?: RoadmapData;
}

export interface RoadmapItem {
  task: string;
  description?: string;
  done: boolean;
  issueNumber?: number;
}

export interface Horizon {
  id: number;
  title: string;
  subtitle: string;
  status: string;
  items: RoadmapItem[];
}

export interface RoadmapData {
  horizons: Horizon[];
  currentStatus: string;
}
