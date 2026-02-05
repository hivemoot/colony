import type {
  ActivityData,
  Commit,
  Issue,
  PullRequest,
  Agent,
  AgentStats,
  Proposal,
  Comment,
} from '../../types/activity';

export const createCommit = (overrides?: Partial<Commit>): Commit => ({
  sha: 'abc1234',
  message: 'feat: test commit',
  author: 'test-agent',
  date: '2026-02-05T12:00:00Z',
  ...overrides,
});

export const createIssue = (overrides?: Partial<Issue>): Issue => ({
  number: 1,
  title: 'Test Issue',
  state: 'open',
  labels: [],
  author: 'test-agent',
  createdAt: '2026-02-05T10:00:00Z',
  ...overrides,
});

export const createPullRequest = (
  overrides?: Partial<PullRequest>
): PullRequest => ({
  number: 1,
  title: 'Test PR',
  state: 'open',
  author: 'test-agent',
  createdAt: '2026-02-05T08:00:00Z',
  ...overrides,
});

export const createAgent = (overrides?: Partial<Agent>): Agent => ({
  login: 'test-agent',
  avatarUrl: 'https://github.com/test-agent.png',
  ...overrides,
});

export const createAgentStats = (
  overrides?: Partial<AgentStats>
): AgentStats => ({
  login: 'test-agent',
  commits: 0,
  pullRequestsMerged: 0,
  issuesOpened: 0,
  reviews: 0,
  comments: 0,
  lastActiveAt: '2026-02-05T12:00:00Z',
  ...overrides,
});

export const createProposal = (overrides?: Partial<Proposal>): Proposal => ({
  number: 1,
  title: 'Test Proposal',
  phase: 'discussion',
  author: 'test-agent',
  createdAt: '2026-02-05T12:00:00Z',
  commentCount: 0,
  ...overrides,
});

export const createComment = (overrides?: Partial<Comment>): Comment => ({
  id: 1,
  issueOrPrNumber: 1,
  type: 'issue',
  author: 'test-agent',
  body: 'Test comment',
  createdAt: '2026-02-05T12:00:00Z',
  url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-1',
  ...overrides,
});

export const createActivityData = (
  overrides?: Partial<ActivityData>
): ActivityData => ({
  generatedAt: '2026-02-05T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  agents: [],
  agentStats: [],
  commits: [],
  issues: [],
  pullRequests: [],
  comments: [],
  proposals: [],
  ...overrides,
});

export const mockActivityData: ActivityData = createActivityData({
  agents: [createAgent({ login: 'hivemoot-builder' })],
  agentStats: [
    createAgentStats({
      login: 'hivemoot-builder',
      commits: 1,
      pullRequestsMerged: 1,
      issuesOpened: 1,
      lastActiveAt: '2026-02-05T12:00:00Z',
    }),
  ],
  commits: [
    createCommit({
      sha: 'abc1234',
      message: 'Initial commit',
      author: 'hivemoot-builder',
    }),
  ],
  issues: [
    createIssue({ number: 1, title: 'Test Issue', author: 'hivemoot-scout' }),
  ],
  pullRequests: [
    createPullRequest({
      number: 1,
      title: 'Test PR',
      author: 'hivemoot-builder',
    }),
  ],
  comments: [createComment({ id: 1, author: 'hivemoot-builder' })],
  proposals: [
    createProposal({
      number: 13,
      title: 'Proposal: Show Governance Status on Dashboard',
      author: 'hivemoot-worker',
      commentCount: 5,
    }),
  ],
});
