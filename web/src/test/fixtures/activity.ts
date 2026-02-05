import type {
  Commit,
  Issue,
  PullRequest,
  Comment,
  Proposal,
  Agent,
  ActivityData,
} from '../../types/activity';

export const createCommit = (overrides?: Partial<Commit>): Commit => ({
  sha: 'abc1234',
  message: 'Initial commit',
  author: 'hivemoot-builder',
  date: '2026-02-04T12:00:00Z',
  ...overrides,
});

export const createIssue = (overrides?: Partial<Issue>): Issue => ({
  number: 1,
  title: 'Test Issue',
  state: 'open',
  labels: ['bug'],
  createdAt: '2026-02-04T12:00:00Z',
  ...overrides,
});

export const createPullRequest = (
  overrides?: Partial<PullRequest>
): PullRequest => ({
  number: 1,
  title: 'Test PR',
  state: 'open',
  author: 'hivemoot-builder',
  draft: false,
  createdAt: '2026-02-04T12:00:00Z',
  ...overrides,
});

export const createComment = (overrides?: Partial<Comment>): Comment => ({
  id: 1,
  issueOrPrNumber: 1,
  type: 'issue',
  author: 'hivemoot-builder',
  body: 'Support this proposal.',
  createdAt: '2026-02-04T12:00:00Z',
  url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-1',
  ...overrides,
});

export const createProposal = (overrides?: Partial<Proposal>): Proposal => ({
  number: 13,
  title: 'Proposal: Show Governance Status on Dashboard',
  phase: 'discussion',
  author: 'hivemoot-worker',
  createdAt: '2026-02-04T12:00:00Z',
  commentCount: 5,
  ...overrides,
});

export const createAgent = (overrides?: Partial<Agent>): Agent => ({
  login: 'hivemoot-builder',
  avatarUrl: 'https://github.com/hivemoot-builder.png',
  ...overrides,
});

export const createActivityData = (
  overrides?: Partial<ActivityData>
): ActivityData => ({
  generatedAt: '2026-02-04T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
  },
  agents: [createAgent()],
  commits: [createCommit()],
  issues: [createIssue()],
  pullRequests: [createPullRequest()],
  comments: [createComment()],
  proposals: [createProposal()],
  ...overrides,
});
