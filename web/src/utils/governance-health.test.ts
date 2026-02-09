import { describe, it, expect } from 'vitest';
import type { ActivityData, AgentStats, Proposal } from '../types/activity';
import {
  computeGovernanceHealth,
  computeParticipation,
  computePipelineFlow,
  computeFollowThrough,
  computeConsensus,
  computeGini,
  scoreToBucket,
} from './governance-health';
import { computeGovernanceMetrics } from './governance';

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

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
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

describe('computeGini', () => {
  it('returns 0 for empty array', () => {
    expect(computeGini([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(computeGini([5])).toBe(0);
  });

  it('returns 0 for perfectly equal distribution', () => {
    expect(computeGini([10, 10, 10, 10])).toBe(0);
  });

  it('returns 0 for all-zero values', () => {
    expect(computeGini([0, 0, 0])).toBe(0);
  });

  it('returns high value for concentrated distribution', () => {
    const gini = computeGini([0, 0, 0, 100]);
    expect(gini).toBeGreaterThan(0.6);
  });

  it('returns moderate value for uneven distribution', () => {
    const gini = computeGini([1, 2, 5, 20]);
    expect(gini).toBeGreaterThan(0.3);
    expect(gini).toBeLessThan(0.7);
  });
});

describe('scoreToBucket', () => {
  it('maps 0-24 to Critical', () => {
    expect(scoreToBucket(0)).toBe('Critical');
    expect(scoreToBucket(24)).toBe('Critical');
  });

  it('maps 25-49 to Needs Attention', () => {
    expect(scoreToBucket(25)).toBe('Needs Attention');
    expect(scoreToBucket(49)).toBe('Needs Attention');
  });

  it('maps 50-74 to Healthy', () => {
    expect(scoreToBucket(50)).toBe('Healthy');
    expect(scoreToBucket(74)).toBe('Healthy');
  });

  it('maps 75-100 to Thriving', () => {
    expect(scoreToBucket(75)).toBe('Thriving');
    expect(scoreToBucket(100)).toBe('Thriving');
  });
});

describe('computeParticipation', () => {
  it('returns 0 for no active agents', () => {
    const result = computeParticipation([], []);
    expect(result.score).toBe(0);
    expect(result.key).toBe('participation');
  });

  it('returns 5 for single active agent', () => {
    const stats = [makeAgentStats({ login: 'solo', commits: 10 })];
    const result = computeParticipation(stats, []);
    expect(result.score).toBe(5);
  });

  it('gives high score for evenly distributed activity', () => {
    const stats = [
      makeAgentStats({ login: 'a', reviews: 10, comments: 10 }),
      makeAgentStats({ login: 'b', reviews: 10, comments: 10 }),
      makeAgentStats({ login: 'c', reviews: 10, comments: 10 }),
      makeAgentStats({ login: 'd', reviews: 10, comments: 10 }),
    ];
    const proposals = [
      makeProposal({ author: 'a' }),
      makeProposal({ author: 'b', number: 2 }),
      makeProposal({ author: 'c', number: 3 }),
      makeProposal({ author: 'd', number: 4 }),
    ];

    const result = computeParticipation(stats, proposals);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it('gives low score for concentrated activity', () => {
    const stats = [
      makeAgentStats({ login: 'a', reviews: 50, comments: 50 }),
      makeAgentStats({ login: 'b', reviews: 1, comments: 0 }),
      makeAgentStats({ login: 'c', reviews: 0, comments: 1 }),
      makeAgentStats({ login: 'd', reviews: 0, comments: 1 }),
    ];

    const result = computeParticipation(stats, []);
    expect(result.score).toBeLessThan(15);
  });

  it('excludes inactive agents from distribution calculation', () => {
    const stats = [
      makeAgentStats({ login: 'active', reviews: 10, comments: 10 }),
      makeAgentStats({ login: 'inactive' }),
    ];

    const result = computeParticipation(stats, []);
    expect(result.score).toBe(5); // Only 1 active agent
  });
});

describe('computePipelineFlow', () => {
  it('returns 0 for empty pipeline', () => {
    const metrics = computeGovernanceMetrics(makeActivityData());
    const result = computePipelineFlow(metrics);
    expect(result.score).toBe(0);
    expect(result.key).toBe('pipeline-flow');
  });

  it('gives low score when all proposals stuck in discussion', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'discussion' }),
      makeProposal({ number: 2, phase: 'discussion' }),
      makeProposal({ number: 3, phase: 'discussion' }),
    ];
    const data = makeActivityData({ proposals });
    const metrics = computeGovernanceMetrics(data);

    const result = computePipelineFlow(metrics);
    expect(result.score).toBe(0);
  });

  it('gives high score when proposals flow through to terminal states', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'implemented' }),
      makeProposal({ number: 2, phase: 'implemented' }),
      makeProposal({ number: 3, phase: 'rejected' }),
      makeProposal({ number: 4, phase: 'voting' }),
      makeProposal({ number: 5, phase: 'ready-to-implement' }),
    ];
    const data = makeActivityData({ proposals });
    const metrics = computeGovernanceMetrics(data);

    const result = computePipelineFlow(metrics);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it('gives moderate score when proposals are advancing but few are terminal', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'voting' }),
      makeProposal({ number: 2, phase: 'voting' }),
      makeProposal({ number: 3, phase: 'ready-to-implement' }),
      makeProposal({ number: 4, phase: 'discussion' }),
    ];
    const data = makeActivityData({ proposals });
    const metrics = computeGovernanceMetrics(data);

    const result = computePipelineFlow(metrics);
    expect(result.score).toBeGreaterThan(5);
    expect(result.score).toBeLessThan(20);
  });
});

describe('computeFollowThrough', () => {
  it('returns baseline score when no approved proposals exist', () => {
    const metrics = computeGovernanceMetrics(makeActivityData());
    const result = computeFollowThrough(metrics);
    expect(result.score).toBe(12);
    expect(result.key).toBe('follow-through');
  });

  it('gives high score when all approved proposals are implemented', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'implemented' }),
      makeProposal({ number: 2, phase: 'implemented' }),
      makeProposal({ number: 3, phase: 'implemented' }),
    ];
    const data = makeActivityData({ proposals });
    const metrics = computeGovernanceMetrics(data);

    const result = computeFollowThrough(metrics);
    expect(result.score).toBe(25);
  });

  it('gives moderate score when some approved proposals await implementation', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'implemented' }),
      makeProposal({ number: 2, phase: 'ready-to-implement' }),
      makeProposal({ number: 3, phase: 'ready-to-implement' }),
    ];
    const data = makeActivityData({ proposals });
    const metrics = computeGovernanceMetrics(data);

    const result = computeFollowThrough(metrics);
    expect(result.score).toBe(8); // 1/3 ≈ 0.33 * 25 ≈ 8
  });

  it('gives zero when no approved proposals are implemented', () => {
    const proposals = [
      makeProposal({ number: 1, phase: 'ready-to-implement' }),
      makeProposal({ number: 2, phase: 'ready-to-implement' }),
    ];
    const data = makeActivityData({ proposals });
    const metrics = computeGovernanceMetrics(data);

    const result = computeFollowThrough(metrics);
    expect(result.score).toBe(0);
  });
});

describe('computeConsensus', () => {
  it('returns 0 for no proposals', () => {
    const result = computeConsensus([]);
    expect(result.score).toBe(0);
    expect(result.key).toBe('consensus');
  });

  it('rewards proposals with vote data', () => {
    const proposals = [
      makeProposal({
        number: 1,
        votesSummary: { thumbsUp: 4, thumbsDown: 0 },
        commentCount: 5,
        phase: 'implemented',
      }),
      makeProposal({
        number: 2,
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
        commentCount: 5,
        phase: 'rejected',
      }),
    ];

    const result = computeConsensus(proposals);
    expect(result.score).toBeGreaterThan(15);
  });

  it('rewards discussion depth', () => {
    const proposals = [
      makeProposal({ number: 1, commentCount: 10 }),
      makeProposal({ number: 2, commentCount: 8 }),
    ];

    const result = computeConsensus(proposals);
    // High comments = high discussion score
    expect(result.score).toBeGreaterThanOrEqual(10);
  });

  it('penalizes rubber-stamping (0% rejection rate)', () => {
    const proposals = [
      makeProposal({
        number: 1,
        phase: 'implemented',
        commentCount: 5,
        votesSummary: { thumbsUp: 4, thumbsDown: 0 },
      }),
      makeProposal({
        number: 2,
        phase: 'implemented',
        commentCount: 5,
        votesSummary: { thumbsUp: 4, thumbsDown: 0 },
      }),
    ];

    const withRejection = [
      ...proposals,
      makeProposal({
        number: 3,
        phase: 'rejected',
        commentCount: 5,
        votesSummary: { thumbsUp: 1, thumbsDown: 3 },
      }),
    ];

    const resultNoRejection = computeConsensus(proposals);
    const resultWithRejection = computeConsensus(withRejection);

    // The system with some rejections should score higher on diversity
    expect(resultWithRejection.score).toBeGreaterThanOrEqual(
      resultNoRejection.score
    );
  });
});

describe('computeGovernanceHealth', () => {
  it('returns a valid score structure for empty data', () => {
    const data = makeActivityData();
    const health = computeGovernanceHealth(data);

    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(health.score % 5).toBe(0);
    expect(['Critical', 'Needs Attention', 'Healthy', 'Thriving']).toContain(
      health.bucket
    );
    expect(health.subMetrics).toHaveLength(4);
    expect(health.dataWindowDays).toBeGreaterThanOrEqual(0);
  });

  it('produces consistent score = sum of sub-metrics (rounded to 5)', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 1,
          phase: 'implemented',
          author: 'a',
          commentCount: 5,
          votesSummary: { thumbsUp: 4, thumbsDown: 0 },
        }),
        makeProposal({
          number: 2,
          phase: 'voting',
          author: 'b',
          commentCount: 3,
          createdAt: '2026-02-03T09:00:00Z',
        }),
      ],
      agentStats: [
        makeAgentStats({ login: 'a', commits: 10, reviews: 5, comments: 10 }),
        makeAgentStats({ login: 'b', commits: 8, reviews: 7, comments: 8 }),
      ],
    });

    const health = computeGovernanceHealth(data);
    const rawSum = health.subMetrics.reduce((sum, m) => sum + m.score, 0);
    const expected = Math.round(rawSum / 5) * 5;
    expect(health.score).toBe(expected);
  });

  it('each sub-metric has correct keys', () => {
    const data = makeActivityData({
      proposals: [makeProposal()],
      agentStats: [makeAgentStats({ login: 'a', comments: 1 })],
    });

    const health = computeGovernanceHealth(data);
    expect(health.subMetrics[0].key).toBe('participation');
    expect(health.subMetrics[1].key).toBe('pipeline-flow');
    expect(health.subMetrics[2].key).toBe('follow-through');
    expect(health.subMetrics[3].key).toBe('consensus');
  });

  it('computes data window from proposal date range', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 1,
          createdAt: '2026-02-01T00:00:00Z',
        }),
        makeProposal({
          number: 2,
          createdAt: '2026-02-08T00:00:00Z',
        }),
      ],
    });

    const health = computeGovernanceHealth(data);
    expect(health.dataWindowDays).toBe(7);
  });

  it('scores a healthy colony with active governance', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 1,
          phase: 'implemented',
          author: 'a',
          commentCount: 6,
          votesSummary: { thumbsUp: 4, thumbsDown: 0 },
          createdAt: '2026-02-01T00:00:00Z',
        }),
        makeProposal({
          number: 2,
          phase: 'implemented',
          author: 'b',
          commentCount: 8,
          votesSummary: { thumbsUp: 3, thumbsDown: 1 },
          createdAt: '2026-02-02T00:00:00Z',
        }),
        makeProposal({
          number: 3,
          phase: 'rejected',
          author: 'c',
          commentCount: 5,
          votesSummary: { thumbsUp: 1, thumbsDown: 3 },
          createdAt: '2026-02-03T00:00:00Z',
        }),
        makeProposal({
          number: 4,
          phase: 'voting',
          author: 'd',
          commentCount: 4,
          createdAt: '2026-02-04T00:00:00Z',
        }),
        makeProposal({
          number: 5,
          phase: 'ready-to-implement',
          author: 'a',
          commentCount: 7,
          votesSummary: { thumbsUp: 4, thumbsDown: 0 },
          createdAt: '2026-02-05T00:00:00Z',
        }),
      ],
      agentStats: [
        makeAgentStats({
          login: 'a',
          commits: 10,
          reviews: 8,
          comments: 15,
        }),
        makeAgentStats({
          login: 'b',
          commits: 8,
          reviews: 10,
          comments: 12,
        }),
        makeAgentStats({
          login: 'c',
          commits: 5,
          reviews: 7,
          comments: 10,
        }),
        makeAgentStats({
          login: 'd',
          commits: 7,
          reviews: 6,
          comments: 11,
        }),
      ],
    });

    const health = computeGovernanceHealth(data);

    // A well-functioning colony should score Healthy or Thriving
    expect(health.score).toBeGreaterThanOrEqual(50);
    expect(['Healthy', 'Thriving']).toContain(health.bucket);
  });

  it('sub-metric scores are each capped at 25', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 1,
          phase: 'implemented',
          author: 'a',
          commentCount: 20,
          votesSummary: { thumbsUp: 10, thumbsDown: 0 },
        }),
      ],
      agentStats: [makeAgentStats({ login: 'a', reviews: 100, comments: 100 })],
    });

    const health = computeGovernanceHealth(data);
    for (const metric of health.subMetrics) {
      expect(metric.score).toBeLessThanOrEqual(25);
      expect(metric.score).toBeGreaterThanOrEqual(0);
    }
  });
});
