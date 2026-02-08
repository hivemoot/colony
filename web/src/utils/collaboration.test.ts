import { describe, it, expect } from 'vitest';
import type {
  ActivityData,
  AgentStats,
  Comment,
  PullRequest,
  Proposal,
} from '../types/activity';
import {
  computeCollaborationNetwork,
  getAgentPairInteraction,
} from './collaboration';

function makeAgentStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    login: 'agent-a',
    commits: 1,
    pullRequestsMerged: 0,
    issuesOpened: 0,
    reviews: 0,
    comments: 0,
    lastActiveAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    issueOrPrNumber: 10,
    type: 'issue',
    author: 'agent-a',
    body: 'Test comment',
    createdAt: '2026-02-05T09:00:00Z',
    url: 'https://github.com/hivemoot/colony/issues/10#comment-1',
    ...overrides,
  };
}

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 10,
    title: 'Test PR',
    state: 'merged',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Test proposal',
    phase: 'discussion',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-05T10:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
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
  };
}

describe('computeCollaborationNetwork', () => {
  it('returns empty network for empty data', () => {
    const result = computeCollaborationNetwork(makeData());

    expect(result.agents).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.totalInteractions).toBe(0);
  });

  it('returns agents sorted alphabetically', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'charlie' }),
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    expect(result.agents).toEqual(['alice', 'bob', 'charlie']);
  });

  it('extracts review edges from review comments', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'reviewer' }),
        makeAgentStats({ login: 'author' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'author' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'reviewer',
        }),
        makeComment({
          id: 2,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'reviewer',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    const edge = getAgentPairInteraction(result, 'reviewer', 'author');

    expect(edge).toEqual(
      expect.objectContaining({ review: 2, from: 'reviewer', to: 'author' })
    );
    expect(edge?.total).toBeGreaterThanOrEqual(2);
  });

  it('ignores self-reviews', () => {
    const data = makeData({
      agentStats: [makeAgentStats({ login: 'agent-a' })],
      pullRequests: [makePR({ number: 10, author: 'agent-a' })],
      comments: [
        makeComment({
          issueOrPrNumber: 10,
          type: 'review',
          author: 'agent-a',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    expect(result.edges).toHaveLength(0);
  });

  it('extracts co-discussion edges between thread participants', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 5,
          author: 'alice',
          type: 'issue',
        }),
        makeComment({
          id: 2,
          issueOrPrNumber: 5,
          author: 'bob',
          type: 'issue',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);

    const ab = getAgentPairInteraction(result, 'alice', 'bob');
    const ba = getAgentPairInteraction(result, 'bob', 'alice');

    expect(ab).toEqual(expect.objectContaining({ coDiscussion: 1 }));
    expect(ba).toEqual(expect.objectContaining({ coDiscussion: 1 }));
  });

  it('creates co-discussion edges for all participant pairs in a thread', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
        makeAgentStats({ login: 'charlie' }),
      ],
      comments: [
        makeComment({ id: 1, issueOrPrNumber: 5, author: 'alice' }),
        makeComment({ id: 2, issueOrPrNumber: 5, author: 'bob' }),
        makeComment({ id: 3, issueOrPrNumber: 5, author: 'charlie' }),
      ],
    });

    const result = computeCollaborationNetwork(data);

    // 3 agents = 3 pairs, each bidirectional = 6 co-discussion edges
    expect(getAgentPairInteraction(result, 'alice', 'bob')).not.toBeNull();
    expect(getAgentPairInteraction(result, 'alice', 'charlie')).not.toBeNull();
    expect(getAgentPairInteraction(result, 'bob', 'charlie')).not.toBeNull();
    expect(getAgentPairInteraction(result, 'bob', 'alice')).not.toBeNull();
    expect(getAgentPairInteraction(result, 'charlie', 'alice')).not.toBeNull();
    expect(getAgentPairInteraction(result, 'charlie', 'bob')).not.toBeNull();
  });

  it('extracts implementation edges from PR titles referencing proposals', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'implementer' }),
        makeAgentStats({ login: 'proposer' }),
      ],
      proposals: [makeProposal({ number: 42, author: 'proposer' })],
      pullRequests: [
        makePR({
          number: 100,
          title: 'feat: add feature (#42)',
          author: 'implementer',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    const edge = getAgentPairInteraction(result, 'implementer', 'proposer');

    expect(edge).toEqual(expect.objectContaining({ implementation: 1 }));
  });

  it('ignores implementation edges when PR author is the proposer', () => {
    const data = makeData({
      agentStats: [makeAgentStats({ login: 'agent-a' })],
      proposals: [makeProposal({ number: 42, author: 'agent-a' })],
      pullRequests: [
        makePR({
          number: 100,
          title: 'feat: add feature (#42)',
          author: 'agent-a',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    expect(result.edges).toHaveLength(0);
  });

  it('aggregates multiple interaction types between the same pair', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'bob' })],
      proposals: [makeProposal({ number: 20, author: 'bob' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
        // alice and bob co-discuss issue #5
        makeComment({ id: 2, issueOrPrNumber: 5, author: 'alice' }),
        makeComment({ id: 3, issueOrPrNumber: 5, author: 'bob' }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    const edge = getAgentPairInteraction(result, 'alice', 'bob');

    expect(edge).toEqual(
      expect.objectContaining({ review: 1, coDiscussion: 1, total: 2 })
    );
  });

  it('ignores comments from agents not in agentStats', () => {
    const data = makeData({
      agentStats: [makeAgentStats({ login: 'alice' })],
      comments: [
        makeComment({ id: 1, issueOrPrNumber: 5, author: 'alice' }),
        makeComment({ id: 2, issueOrPrNumber: 5, author: 'unknown-bot' }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    expect(result.edges).toHaveLength(0);
  });

  it('computes totalInteractions as sum of all edge totals', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'bob' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
        makeComment({
          id: 2,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    const expected = result.edges.reduce((sum, e) => sum + e.total, 0);
    expect(result.totalInteractions).toBe(expected);
  });
});

describe('getAgentPairInteraction', () => {
  it('returns null for non-existent pair', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    expect(getAgentPairInteraction(result, 'alice', 'bob')).toBeNull();
  });

  it('returns the correct pair summary', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'bob' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
      ],
    });

    const result = computeCollaborationNetwork(data);
    const pair = getAgentPairInteraction(result, 'alice', 'bob');

    expect(pair).toEqual({
      from: 'alice',
      to: 'bob',
      review: 1,
      coDiscussion: 0,
      implementation: 0,
      total: 1,
    });
  });
});
