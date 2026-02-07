import { describe, it, expect } from 'vitest';
import type { ActivityData, AgentStats, Proposal } from '../types/activity';
import {
  computeGovernanceMetrics,
  computePipeline,
  computeAgentRoles,
  computeTopProposers,
} from './governance';

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

function makeAgentStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    login: 'agent-a',
    commits: 0,
    pullRequestsMerged: 0,
    issuesOpened: 0,
    reviews: 0,
    comments: 0,
    lastActiveAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeActivityData(
  overrides: Partial<ActivityData> = {}
): ActivityData {
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

describe('computePipeline', () => {
  it('returns zero counts for empty proposals', () => {
    const result = computePipeline([]);
    expect(result).toEqual({
      discussion: 0,
      voting: 0,
      readyToImplement: 0,
      implemented: 0,
      rejected: 0,
      total: 0,
    });
  });

  it('counts each phase correctly', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'discussion' }),
      makeProposal({ number: 2, phase: 'discussion' }),
      makeProposal({ number: 3, phase: 'voting' }),
      makeProposal({ number: 4, phase: 'ready-to-implement' }),
      makeProposal({ number: 5, phase: 'implemented' }),
      makeProposal({ number: 6, phase: 'implemented' }),
      makeProposal({ number: 7, phase: 'implemented' }),
      makeProposal({ number: 8, phase: 'rejected' }),
    ];

    const result = computePipeline(proposals);
    expect(result).toEqual({
      discussion: 2,
      voting: 1,
      readyToImplement: 1,
      implemented: 3,
      rejected: 1,
      total: 8,
    });
  });

  it('handles all proposals in a single phase', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'implemented' }),
      makeProposal({ number: 2, phase: 'implemented' }),
    ];

    const result = computePipeline(proposals);
    expect(result.implemented).toBe(2);
    expect(result.total).toBe(2);
    expect(result.discussion).toBe(0);
  });
});

describe('computeAgentRoles', () => {
  it('returns empty array for no agents', () => {
    const result = computeAgentRoles([], []);
    expect(result).toEqual([]);
  });

  it('classifies an agent with most commits + PRs as coder', () => {
    const stats = [
      makeAgentStats({
        login: 'coder-bot',
        commits: 20,
        pullRequestsMerged: 10,
        reviews: 2,
        comments: 3,
      }),
    ];

    const result = computeAgentRoles(stats, []);
    expect(result[0].primaryRole).toBe('coder');
    expect(result[0].scores.coder).toBe(1); // max score is normalized to 1
  });

  it('classifies an agent with most reviews as reviewer', () => {
    const stats = [
      makeAgentStats({
        login: 'reviewer-bot',
        commits: 1,
        pullRequestsMerged: 0,
        reviews: 15,
        comments: 3,
      }),
    ];

    const result = computeAgentRoles(stats, []);
    expect(result[0].primaryRole).toBe('reviewer');
  });

  it('classifies an agent with most proposals as proposer', () => {
    const stats = [
      makeAgentStats({
        login: 'proposer-bot',
        commits: 1,
        pullRequestsMerged: 0,
        reviews: 1,
        comments: 2,
      }),
    ];
    const proposals = [
      makeProposal({ number: 1, author: 'proposer-bot' }),
      makeProposal({ number: 2, author: 'proposer-bot' }),
      makeProposal({ number: 3, author: 'proposer-bot' }),
      makeProposal({ number: 4, author: 'proposer-bot' }),
      makeProposal({ number: 5, author: 'proposer-bot' }),
    ];

    const result = computeAgentRoles(stats, proposals);
    expect(result[0].primaryRole).toBe('proposer');
  });

  it('classifies an agent with most comments as discussant', () => {
    const stats = [
      makeAgentStats({
        login: 'talker-bot',
        commits: 1,
        pullRequestsMerged: 0,
        reviews: 2,
        comments: 50,
      }),
    ];

    const result = computeAgentRoles(stats, []);
    expect(result[0].primaryRole).toBe('discussant');
  });

  it('handles agent with zero activity gracefully', () => {
    const stats = [makeAgentStats({ login: 'idle-bot' })];
    const result = computeAgentRoles(stats, []);

    // All scores should be 0, primary role defaults to first max (coder at 0)
    expect(result[0].scores.coder).toBe(0);
    expect(result[0].scores.reviewer).toBe(0);
    expect(result[0].scores.proposer).toBe(0);
    expect(result[0].scores.discussant).toBe(0);
  });

  it('normalizes scores relative to each agent individually', () => {
    const stats = [
      makeAgentStats({
        login: 'agent-a',
        commits: 10,
        pullRequestsMerged: 0,
        reviews: 5,
        comments: 0,
      }),
    ];

    const result = computeAgentRoles(stats, []);
    // coder = (10+0)/10 = 1.0, reviewer = 5/10 = 0.5
    expect(result[0].scores.coder).toBe(1);
    expect(result[0].scores.reviewer).toBe(0.5);
  });
});

describe('computeTopProposers', () => {
  it('returns empty array for no proposals', () => {
    expect(computeTopProposers([])).toEqual([]);
  });

  it('counts proposals per author and sorts descending', () => {
    const proposals = [
      makeProposal({ number: 1, author: 'alice' }),
      makeProposal({ number: 2, author: 'bob' }),
      makeProposal({ number: 3, author: 'alice' }),
      makeProposal({ number: 4, author: 'alice' }),
      makeProposal({ number: 5, author: 'bob' }),
      makeProposal({ number: 6, author: 'charlie' }),
    ];

    const result = computeTopProposers(proposals);
    expect(result).toEqual([
      { login: 'alice', count: 3 },
      { login: 'bob', count: 2 },
      { login: 'charlie', count: 1 },
    ]);
  });

  it('handles single author', () => {
    const proposals = [
      makeProposal({ number: 1, author: 'solo' }),
      makeProposal({ number: 2, author: 'solo' }),
    ];

    const result = computeTopProposers(proposals);
    expect(result).toEqual([{ login: 'solo', count: 2 }]);
  });
});

describe('computeGovernanceMetrics', () => {
  it('returns sensible defaults for empty data', () => {
    const data = makeActivityData();
    const metrics = computeGovernanceMetrics(data);

    expect(metrics.totalProposals).toBe(0);
    expect(metrics.successRate).toBeNull();
    expect(metrics.activeProposals).toBe(0);
    expect(metrics.avgComments).toBe(0);
    expect(metrics.agentRoles).toEqual([]);
    expect(metrics.topProposers).toEqual([]);
  });

  it('computes success rate from decided proposals only', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, phase: 'implemented' }),
        makeProposal({ number: 2, phase: 'implemented' }),
        makeProposal({ number: 3, phase: 'implemented' }),
        makeProposal({ number: 4, phase: 'rejected' }),
        makeProposal({ number: 5, phase: 'voting' }),
      ],
    });

    const metrics = computeGovernanceMetrics(data);
    // 3 implemented out of 4 decided (3 implemented + 1 rejected)
    expect(metrics.successRate).toBe(0.75);
  });

  it('returns null success rate when no proposals are decided', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, phase: 'discussion' }),
        makeProposal({ number: 2, phase: 'voting' }),
      ],
    });

    const metrics = computeGovernanceMetrics(data);
    expect(metrics.successRate).toBeNull();
  });

  it('counts active proposals correctly', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, phase: 'discussion' }),
        makeProposal({ number: 2, phase: 'voting' }),
        makeProposal({ number: 3, phase: 'ready-to-implement' }),
        makeProposal({ number: 4, phase: 'implemented' }),
        makeProposal({ number: 5, phase: 'rejected' }),
      ],
    });

    const metrics = computeGovernanceMetrics(data);
    expect(metrics.activeProposals).toBe(3);
  });

  it('computes average comments across all proposals', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, commentCount: 4 }),
        makeProposal({ number: 2, commentCount: 8 }),
        makeProposal({ number: 3, commentCount: 6 }),
      ],
    });

    const metrics = computeGovernanceMetrics(data);
    expect(metrics.avgComments).toBe(6);
  });

  it('integrates pipeline, agent roles, and top proposers', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 1, phase: 'implemented', author: 'builder' }),
        makeProposal({ number: 2, phase: 'voting', author: 'builder' }),
        makeProposal({ number: 3, phase: 'discussion', author: 'scout' }),
      ],
      agentStats: [
        makeAgentStats({ login: 'builder', commits: 20, pullRequestsMerged: 5 }),
        makeAgentStats({ login: 'scout', reviews: 15 }),
      ],
    });

    const metrics = computeGovernanceMetrics(data);
    expect(metrics.totalProposals).toBe(3);
    expect(metrics.pipeline.implemented).toBe(1);
    expect(metrics.pipeline.voting).toBe(1);
    expect(metrics.pipeline.discussion).toBe(1);
    expect(metrics.agentRoles).toHaveLength(2);
    expect(metrics.topProposers[0]).toEqual({ login: 'builder', count: 2 });
    expect(metrics.topProposers[1]).toEqual({ login: 'scout', count: 1 });
  });
});
