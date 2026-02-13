import { describe, it, expect } from 'vitest';
import type { AgentStats, Comment, Proposal } from '../types/activity';
import {
  computePowerConcentration,
  computeRoleDiversity,
  computeResponsiveness,
  computeGovernanceBalance,
  inferRole,
} from './governance-balance';

// --- Helpers ---

function makeAgentStats(
  overrides: Partial<AgentStats> & { login: string }
): AgentStats {
  return {
    avatarUrl: undefined,
    commits: 0,
    pullRequestsMerged: 0,
    issuesOpened: 0,
    reviews: 0,
    comments: 0,
    lastActiveAt: '2026-02-13T00:00:00Z',
    ...overrides,
  };
}

function makeProposal(
  overrides: Partial<Proposal> & { number: number; author: string }
): Proposal {
  return {
    title: `Proposal #${overrides.number}`,
    phase: 'discussion',
    createdAt: '2026-02-01T10:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makeComment(
  overrides: Partial<Comment> & { author: string; issueOrPrNumber: number }
): Comment {
  return {
    id: Math.random() * 100000,
    type: 'proposal',
    body: 'Test comment',
    createdAt: '2026-02-01T12:00:00Z',
    url: 'https://example.com',
    ...overrides,
  };
}

// --- inferRole ---

describe('inferRole', () => {
  it('maps hivemoot-builder to builder', () => {
    expect(inferRole('hivemoot-builder')).toBe('builder');
  });

  it('maps hivemoot-worker to worker', () => {
    expect(inferRole('hivemoot-worker')).toBe('worker');
  });

  it('maps hivemoot-scout to scout', () => {
    expect(inferRole('hivemoot-scout')).toBe('scout');
  });

  it('maps hivemoot-polisher to polisher', () => {
    expect(inferRole('hivemoot-polisher')).toBe('polisher');
  });

  it('returns unknown for unrecognized logins', () => {
    expect(inferRole('randomuser')).toBe('unknown');
  });
});

// --- computePowerConcentration ---

describe('computePowerConcentration', () => {
  it('returns balanced for empty agents', () => {
    const result = computePowerConcentration([], []);
    expect(result.level).toBe('balanced');
    expect(result.agents).toHaveLength(0);
  });

  it('returns balanced for no governance activity', () => {
    const agents = [
      makeAgentStats({ login: 'hivemoot-builder' }),
      makeAgentStats({ login: 'hivemoot-worker' }),
    ];
    const result = computePowerConcentration(agents, []);
    expect(result.level).toBe('balanced');
  });

  it('detects balanced distribution', () => {
    const agents = [
      makeAgentStats({ login: 'hivemoot-builder', reviews: 5, comments: 3 }),
      makeAgentStats({ login: 'hivemoot-worker', reviews: 5, comments: 3 }),
      makeAgentStats({ login: 'hivemoot-scout', reviews: 5, comments: 3 }),
      makeAgentStats({ login: 'hivemoot-polisher', reviews: 5, comments: 3 }),
    ];
    const proposals = [
      makeProposal({ number: 1, author: 'hivemoot-builder' }),
      makeProposal({ number: 2, author: 'hivemoot-worker' }),
      makeProposal({ number: 3, author: 'hivemoot-scout' }),
      makeProposal({ number: 4, author: 'hivemoot-polisher' }),
    ];
    const result = computePowerConcentration(agents, proposals);
    expect(result.level).toBe('balanced');
    expect(result.topAgentShare).toBeLessThanOrEqual(0.3);
  });

  it('detects concentrated power', () => {
    const agents = [
      makeAgentStats({ login: 'hivemoot-builder', reviews: 20, comments: 10 }),
      makeAgentStats({ login: 'hivemoot-worker', reviews: 1, comments: 1 }),
      makeAgentStats({ login: 'hivemoot-scout', reviews: 1, comments: 1 }),
    ];
    const proposals = [
      makeProposal({ number: 1, author: 'hivemoot-builder' }),
      makeProposal({ number: 2, author: 'hivemoot-builder' }),
      makeProposal({ number: 3, author: 'hivemoot-builder' }),
      makeProposal({ number: 4, author: 'hivemoot-builder' }),
      makeProposal({ number: 5, author: 'hivemoot-builder' }),
    ];
    const result = computePowerConcentration(agents, proposals);
    expect(['concentrated', 'oligarchy']).toContain(result.level);
    expect(result.topAgentShare).toBeGreaterThan(0.4);
  });

  it('sorts agents by share descending', () => {
    const agents = [
      makeAgentStats({ login: 'hivemoot-scout', reviews: 1, comments: 1 }),
      makeAgentStats({ login: 'hivemoot-builder', reviews: 10, comments: 5 }),
    ];
    const proposals = [makeProposal({ number: 1, author: 'hivemoot-builder' })];
    const result = computePowerConcentration(agents, proposals);
    expect(result.agents[0].login).toBe('hivemoot-builder');
  });
});

// --- computeRoleDiversity ---

describe('computeRoleDiversity', () => {
  it('scores 100 when all roles are active in all dimensions', () => {
    const agents = [
      makeAgentStats({ login: 'hivemoot-builder', reviews: 5 }),
      makeAgentStats({ login: 'hivemoot-worker', reviews: 5 }),
      makeAgentStats({ login: 'hivemoot-scout', reviews: 5 }),
      makeAgentStats({ login: 'hivemoot-polisher', reviews: 5 }),
    ];
    const proposals = [
      makeProposal({ number: 1, author: 'hivemoot-builder' }),
      makeProposal({ number: 2, author: 'hivemoot-worker' }),
      makeProposal({ number: 3, author: 'hivemoot-scout' }),
      makeProposal({ number: 4, author: 'hivemoot-polisher' }),
    ];
    const comments = [
      makeComment({ author: 'hivemoot-builder', issueOrPrNumber: 1 }),
      makeComment({ author: 'hivemoot-worker', issueOrPrNumber: 2 }),
      makeComment({ author: 'hivemoot-scout', issueOrPrNumber: 3 }),
      makeComment({ author: 'hivemoot-polisher', issueOrPrNumber: 4 }),
    ];
    const result = computeRoleDiversity(agents, proposals, comments);
    expect(result.score).toBe(100);
    expect(result.missingCombinations).toHaveLength(0);
  });

  it('identifies missing role-activity combinations', () => {
    const agents = [
      makeAgentStats({ login: 'hivemoot-builder', reviews: 5 }),
      makeAgentStats({ login: 'hivemoot-worker', reviews: 0 }),
    ];
    const proposals = [makeProposal({ number: 1, author: 'hivemoot-builder' })];
    const comments = [
      makeComment({ author: 'hivemoot-builder', issueOrPrNumber: 1 }),
    ];
    const result = computeRoleDiversity(agents, proposals, comments);
    expect(result.score).toBeLessThan(100);
    expect(result.missingCombinations.length).toBeGreaterThan(0);
  });

  it('returns 0 score with no data', () => {
    const result = computeRoleDiversity([], [], []);
    expect(result.score).toBe(0);
  });
});

// --- computeResponsiveness ---

describe('computeResponsiveness', () => {
  it('returns no-data with no proposals', () => {
    const result = computeResponsiveness([], []);
    expect(result.bucket).toBe('no-data');
    expect(result.medianHours).toBeNull();
  });

  it('detects highly-responsive proposals', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot-scout',
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T10:30:00Z',
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('highly-responsive');
    expect(result.medianHours).toBeLessThan(2);
  });

  it('excludes author-own comments from response time', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot-builder', // same as proposal author
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T10:05:00Z',
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('no-data');
  });

  it('classifies slow response correctly', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot-worker',
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T22:00:00Z', // 12 hours later
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('slow');
  });

  it('classifies concerning response correctly', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot-worker',
        issueOrPrNumber: 1,
        createdAt: '2026-02-03T10:00:00Z', // 48 hours later
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('concerning');
  });

  it('excludes hivemoot system automation comments from first response', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot', // system automation (Queen bot)
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T10:01:00Z',
        body: 'queen workflow comment',
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('no-data');
    expect(result.proposalsWithResponses).toBe(0);
  });

  it('excludes hivemoot[bot] system automation comments from first response', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot[bot]', // system automation (app bot)
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T10:01:00Z',
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('no-data');
    expect(result.proposalsWithResponses).toBe(0);
  });

  it('uses first real agent response when system automation comment comes first', () => {
    const proposals = [
      makeProposal({
        number: 1,
        author: 'hivemoot-builder',
        createdAt: '2026-02-01T10:00:00Z',
      }),
    ];
    const comments = [
      makeComment({
        author: 'hivemoot', // system automation — should be ignored
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T10:01:00Z',
      }),
      makeComment({
        author: 'hivemoot-worker', // real agent response at +4 hours
        issueOrPrNumber: 1,
        createdAt: '2026-02-01T14:00:00Z',
      }),
    ];
    const result = computeResponsiveness(proposals, comments);
    expect(result.bucket).toBe('responsive');
    expect(result.medianHours).toBe(4);
    expect(result.proposalsWithResponses).toBe(1);
  });
});

// --- computeGovernanceBalance ---

describe('computeGovernanceBalance', () => {
  it('returns insufficient-data with minimal activity', () => {
    const data = {
      generatedAt: '2026-02-13T00:00:00Z',
      repository: {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 0,
        forks: 0,
        openIssues: 0,
      },
      agents: [],
      agentStats: [],
      commits: [],
      issues: [],
      pullRequests: [],
      proposals: [],
      comments: [],
    };
    const result = computeGovernanceBalance(data);
    expect(result.verdict).toBe('insufficient-data');
  });

  it('computes a full assessment with rich data', () => {
    const data = {
      generatedAt: '2026-02-13T00:00:00Z',
      repository: {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 10,
        forks: 2,
        openIssues: 5,
      },
      agents: [
        { login: 'hivemoot-builder' },
        { login: 'hivemoot-worker' },
        { login: 'hivemoot-scout' },
        { login: 'hivemoot-polisher' },
      ],
      agentStats: [
        makeAgentStats({
          login: 'hivemoot-builder',
          reviews: 10,
          comments: 8,
          commits: 5,
          pullRequestsMerged: 3,
        }),
        makeAgentStats({
          login: 'hivemoot-worker',
          reviews: 8,
          comments: 6,
          commits: 4,
          pullRequestsMerged: 2,
        }),
        makeAgentStats({
          login: 'hivemoot-scout',
          reviews: 7,
          comments: 5,
          commits: 3,
          pullRequestsMerged: 1,
        }),
        makeAgentStats({
          login: 'hivemoot-polisher',
          reviews: 6,
          comments: 4,
          commits: 2,
          pullRequestsMerged: 1,
        }),
      ],
      commits: [],
      issues: [],
      pullRequests: [],
      proposals: [
        makeProposal({
          number: 1,
          author: 'hivemoot-builder',
          createdAt: '2026-02-01T10:00:00Z',
        }),
        makeProposal({
          number: 2,
          author: 'hivemoot-worker',
          createdAt: '2026-02-02T10:00:00Z',
        }),
        makeProposal({
          number: 3,
          author: 'hivemoot-scout',
          createdAt: '2026-02-03T10:00:00Z',
        }),
        makeProposal({
          number: 4,
          author: 'hivemoot-polisher',
          createdAt: '2026-02-04T10:00:00Z',
        }),
      ],
      comments: [
        makeComment({
          author: 'hivemoot-worker',
          issueOrPrNumber: 1,
          createdAt: '2026-02-01T11:00:00Z',
        }),
        makeComment({
          author: 'hivemoot-builder',
          issueOrPrNumber: 2,
          createdAt: '2026-02-02T11:00:00Z',
        }),
        makeComment({
          author: 'hivemoot-polisher',
          issueOrPrNumber: 3,
          createdAt: '2026-02-03T10:30:00Z',
        }),
        makeComment({
          author: 'hivemoot-scout',
          issueOrPrNumber: 4,
          createdAt: '2026-02-04T10:45:00Z',
        }),
      ],
    };
    const result = computeGovernanceBalance(data);
    expect(result.verdict).not.toBe('insufficient-data');
    expect(result.powerConcentration.agents).toHaveLength(4);
    expect(result.roleDiversity.score).toBeGreaterThan(0);
    expect(result.responsiveness.medianHours).not.toBeNull();
  });
});
