import { describe, it, expect } from 'vitest';
import type { ActivityData, AgentStats, Proposal } from '../types/activity';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot';
import {
  assessGovernanceHealth,
  computeTrendSummary,
  detectAlerts,
  detectPatterns,
  generateRecommendations,
  type Alert,
  type AlertType,
} from './governance-assessment';

function makeSnapshot(
  overrides: Partial<GovernanceSnapshot> = {}
): GovernanceSnapshot {
  return {
    timestamp: '2026-02-10T12:00:00Z',
    healthScore: 65,
    participation: 18,
    pipelineFlow: 15,
    followThrough: 17,
    consensusQuality: 15,
    activeProposals: 5,
    totalProposals: 20,
    activeAgents: 4,
    proposalVelocity: 1.5,
    ...overrides,
  };
}

function makeAgentStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    login: 'agent-a',
    commits: 5,
    pullRequestsMerged: 3,
    issuesOpened: 2,
    reviews: 5,
    comments: 10,
    lastActiveAt: '2026-02-10T12:00:00Z',
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

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-10T12:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [
      makeAgentStats({ login: 'agent-a', reviews: 5, comments: 10 }),
      makeAgentStats({ login: 'agent-b', reviews: 5, comments: 8 }),
      makeAgentStats({ login: 'agent-c', reviews: 4, comments: 6 }),
      makeAgentStats({ login: 'agent-d', reviews: 3, comments: 5 }),
    ],
    commits: [],
    issues: [],
    pullRequests: [],
    comments: [],
    proposals: [
      makeProposal({ number: 1, phase: 'implemented', commentCount: 5 }),
      makeProposal({ number: 2, phase: 'implemented', commentCount: 4 }),
      makeProposal({ number: 3, phase: 'voting', commentCount: 3 }),
      makeProposal({ number: 4, phase: 'discussion', commentCount: 2 }),
    ],
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    type: 'merge-queue-growth',
    severity: 'warning',
    title: 'test',
    detail: 'test',
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Trend Summary
// ──────────────────────────────────────────────

describe('computeTrendSummary', () => {
  it('returns null deltas with fewer than 2 snapshots', () => {
    const summary = computeTrendSummary([makeSnapshot()]);
    expect(summary.healthDelta7d).toBeNull();
    expect(summary.healthDelta30d).toBeNull();
    expect(summary.consecutiveDeclines).toBe(0);
  });

  it('computes 7-day delta between snapshots', () => {
    const old = makeSnapshot({
      timestamp: '2026-02-03T12:00:00Z',
      healthScore: 60,
      participation: 15,
    });
    const recent = makeSnapshot({
      timestamp: '2026-02-10T12:00:00Z',
      healthScore: 70,
      participation: 20,
    });
    const summary = computeTrendSummary([old, recent]);
    expect(summary.healthDelta7d).toBe(10);
    expect(summary.participationDelta7d).toBe(5);
  });

  it('counts consecutive declines', () => {
    const snapshots = [
      makeSnapshot({ timestamp: '2026-02-07T00:00:00Z', healthScore: 70 }),
      makeSnapshot({ timestamp: '2026-02-08T00:00:00Z', healthScore: 65 }),
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 60 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 55 }),
    ];
    const summary = computeTrendSummary(snapshots);
    expect(summary.consecutiveDeclines).toBe(3);
  });

  it('stops counting declines at first non-decline', () => {
    const snapshots = [
      makeSnapshot({ timestamp: '2026-02-07T00:00:00Z', healthScore: 70 }),
      makeSnapshot({ timestamp: '2026-02-08T00:00:00Z', healthScore: 65 }),
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 68 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 63 }),
    ];
    const summary = computeTrendSummary(snapshots);
    expect(summary.consecutiveDeclines).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Alerts
// ──────────────────────────────────────────────

describe('detectAlerts', () => {
  it('detects health-declining with 3+ consecutive drops', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({ timestamp: '2026-02-07T00:00:00Z', healthScore: 70 }),
      makeSnapshot({ timestamp: '2026-02-08T00:00:00Z', healthScore: 65 }),
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 60 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 55 }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    const declining = alerts.find((a) => a.type === 'health-declining');
    expect(declining).toBeDefined();
    expect(declining?.severity).toBe('warning');
  });

  it('does not fire health-declining with only 2 drops', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({ timestamp: '2026-02-08T00:00:00Z', healthScore: 70 }),
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 65 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 60 }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    expect(alerts.find((a) => a.type === 'health-declining')).toBeUndefined();
  });

  it('detects health-critical when score stays below 25', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 20 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 15 }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    const critical = alerts.find((a) => a.type === 'health-critical');
    expect(critical).toBeDefined();
    expect(critical?.severity).toBe('critical');
  });

  it('does not fire health-critical when only one snapshot is low', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 50 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 20 }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    expect(alerts.find((a) => a.type === 'health-critical')).toBeUndefined();
  });

  it('detects participation collapse', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({
        timestamp: '2026-02-03T00:00:00Z',
        participation: 22,
      }),
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        participation: 10,
      }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    const collapse = alerts.find((a) => a.type === 'participation-collapse');
    expect(collapse).toBeDefined();
    expect(collapse?.severity).toBe('warning');
  });

  it('detects pipeline stall', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        pipelineFlow: 0,
        totalProposals: 10,
      }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    expect(alerts.find((a) => a.type === 'pipeline-stall')).toBeDefined();
  });

  it('does not fire pipeline stall with zero proposals', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        pipelineFlow: 0,
        totalProposals: 0,
      }),
    ];
    const trend = computeTrendSummary(history);
    const alerts = detectAlerts(data, history, trend);
    expect(alerts.find((a) => a.type === 'pipeline-stall')).toBeUndefined();
  });

  it('detects merge queue growth', () => {
    const openPRs = Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-02-09T00:00:00Z',
    }));
    const data = makeActivityData({ pullRequests: openPRs });
    const alerts = detectAlerts(data, [], computeTrendSummary([]));
    const queue = alerts.find((a) => a.type === 'merge-queue-growth');
    expect(queue).toBeDefined();
    expect(queue?.severity).toBe('warning');
  });

  it('anchors merge recency to generatedAt, not wall-clock time', () => {
    // generatedAt is Feb 1. Merged PRs are within 48h of that timestamp.
    // Without the fix (Date.now()), these merges would appear stale and trigger
    // a false merge-queue-growth alert.
    const openPRs = Array.from({ length: 11 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-01-30T00:00:00Z',
    }));
    const mergedPRs = Array.from({ length: 4 }, (_, i) => ({
      number: 100 + i,
      title: `Merged PR ${i}`,
      state: 'merged' as const,
      author: 'agent-b',
      createdAt: '2026-01-30T00:00:00Z',
      mergedAt: '2026-01-31T12:00:00Z',
    }));
    const data = makeActivityData({
      generatedAt: '2026-02-01T00:00:00Z',
      pullRequests: [...openPRs, ...mergedPRs],
    });
    const alerts = detectAlerts(data, [], computeTrendSummary([]));
    const queue = alerts.find((a) => a.type === 'merge-queue-growth');
    // 4 merged within 48h of generatedAt → 11 > 4*3=12 is false → no alert
    expect(queue).toBeUndefined();
  });

  it('counts Refs #n as linked for follow-through-gap detection', () => {
    // 6 ready-to-implement proposals (>5 threshold for alert)
    const proposals = Array.from({ length: 6 }, (_, i) =>
      makeProposal({
        number: i + 200,
        phase: 'ready-to-implement',
        commentCount: 5,
      })
    );
    // One PR uses "Refs #200" (not a closing keyword) — should still count as linked
    const pullRequests = [
      {
        number: 50,
        title: 'feat: implement widget',
        body: 'Refs #200',
        state: 'open' as const,
        author: 'agent-a',
        createdAt: '2026-02-09T00:00:00Z',
      },
    ];
    const data = makeActivityData({ proposals, pullRequests });
    const alerts = detectAlerts(data, [], computeTrendSummary([]));
    const gap = alerts.find((a) => a.type === 'follow-through-gap');
    // 6 proposals, 1 linked via Refs → 5 unclaimed, which is not >5, so no alert
    expect(gap).toBeUndefined();
  });

  it('fires follow-through-gap when no PRs reference ready proposals', () => {
    const proposals = Array.from({ length: 6 }, (_, i) =>
      makeProposal({
        number: i + 300,
        phase: 'ready-to-implement',
        commentCount: 5,
      })
    );
    const data = makeActivityData({ proposals, pullRequests: [] });
    const alerts = detectAlerts(data, [], computeTrendSummary([]));
    const gap = alerts.find((a) => a.type === 'follow-through-gap');
    expect(gap).toBeDefined();
    expect(gap?.detail).toContain('6');
  });

  it('detects review concentration', () => {
    const data = makeActivityData({
      agentStats: [
        makeAgentStats({ login: 'agent-a', reviews: 20 }),
        makeAgentStats({ login: 'agent-b', reviews: 3 }),
        makeAgentStats({ login: 'agent-c', reviews: 2 }),
        makeAgentStats({ login: 'agent-d', reviews: 1 }),
      ],
    });
    const alerts = detectAlerts(data, [], computeTrendSummary([]));
    const concentration = alerts.find((a) => a.type === 'review-concentration');
    expect(concentration).toBeDefined();
    expect(concentration?.severity).toBe('info');
    expect(concentration?.detail).toContain('agent-a');
  });
});

// ──────────────────────────────────────────────
// Patterns
// ──────────────────────────────────────────────

describe('detectPatterns', () => {
  it('detects rubber-stamping with high approval and low comments', () => {
    const proposals = [
      makeProposal({ phase: 'implemented', commentCount: 1 }),
      makeProposal({ phase: 'implemented', commentCount: 1 }),
      makeProposal({ phase: 'implemented', commentCount: 1 }),
      makeProposal({ phase: 'implemented', commentCount: 1 }),
    ];
    const data = makeActivityData({ proposals });
    const patterns = detectPatterns(data, [], computeTrendSummary([]));
    const rubber = patterns.find((p) => p.type === 'rubber-stamping');
    expect(rubber).toBeDefined();
    expect(rubber?.positive).toBe(false);
  });

  it('does not detect rubber-stamping with healthy discussion', () => {
    const proposals = [
      makeProposal({ phase: 'implemented', commentCount: 5 }),
      makeProposal({ phase: 'implemented', commentCount: 6 }),
      makeProposal({ phase: 'rejected', commentCount: 4 }),
    ];
    const data = makeActivityData({ proposals });
    const patterns = detectPatterns(data, [], computeTrendSummary([]));
    expect(patterns.find((p) => p.type === 'rubber-stamping')).toBeUndefined();
  });

  it('detects governance debt with growing backlog', () => {
    const history = [
      makeSnapshot({
        timestamp: '2026-02-08T00:00:00Z',
        activeProposals: 3,
      }),
      makeSnapshot({
        timestamp: '2026-02-09T00:00:00Z',
        activeProposals: 5,
      }),
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        activeProposals: 8,
      }),
    ];
    const data = makeActivityData();
    const patterns = detectPatterns(
      data,
      history,
      computeTrendSummary(history)
    );
    expect(patterns.find((p) => p.type === 'governance-debt')).toBeDefined();
  });

  it('detects velocity cliff', () => {
    const history = [
      makeSnapshot({
        timestamp: '2026-02-09T00:00:00Z',
        proposalVelocity: 2.0,
      }),
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        proposalVelocity: 0.5,
      }),
    ];
    const data = makeActivityData();
    const patterns = detectPatterns(
      data,
      history,
      computeTrendSummary(history)
    );
    const cliff = patterns.find((p) => p.type === 'velocity-cliff');
    expect(cliff).toBeDefined();
    expect(cliff?.positive).toBe(false);
  });

  it('detects healthy growth', () => {
    const history = [
      makeSnapshot({
        timestamp: '2026-02-03T00:00:00Z',
        healthScore: 55,
        activeAgents: 3,
      }),
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        healthScore: 70,
        activeAgents: 4,
      }),
    ];
    const data = makeActivityData();
    const patterns = detectPatterns(
      data,
      history,
      computeTrendSummary(history)
    );
    const growth = patterns.find((p) => p.type === 'healthy-growth');
    expect(growth).toBeDefined();
    expect(growth?.positive).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Recommendations
// ──────────────────────────────────────────────

describe('generateRecommendations', () => {
  it('generates recommendations from alerts sorted by priority', () => {
    const alerts = [
      makeAlert({ type: 'review-concentration', severity: 'info' }),
      makeAlert({ type: 'merge-queue-growth', severity: 'warning' }),
    ];
    const data = makeActivityData({
      pullRequests: Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        state: 'open' as const,
        author: 'agent-a',
        createdAt: '2026-02-09T00:00:00Z',
      })),
    });
    const recs = generateRecommendations(alerts, [], data);
    expect(recs.length).toBeGreaterThanOrEqual(2);
    expect(recs[0].priority).toBe('high');
  });

  it('limits to 5 recommendations', () => {
    const alertTypes: AlertType[] = [
      'merge-queue-growth',
      'health-critical',
      'pipeline-stall',
      'follow-through-gap',
      'participation-collapse',
      'review-concentration',
    ];
    const manyAlerts = alertTypes.map((type) => makeAlert({ type }));
    const data = makeActivityData({
      pullRequests: Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        state: 'open' as const,
        author: 'agent-a',
        createdAt: '2026-02-09T00:00:00Z',
      })),
    });
    const recs = generateRecommendations(manyAlerts, [], data);
    expect(recs.length).toBeLessThanOrEqual(5);
  });
});

// ──────────────────────────────────────────────
// Integration
// ──────────────────────────────────────────────

describe('assessGovernanceHealth', () => {
  it('returns a complete assessment', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({ timestamp: '2026-02-03T00:00:00Z', healthScore: 60 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 65 }),
    ];
    const assessment = assessGovernanceHealth(data, history);
    expect(assessment.alerts).toBeDefined();
    expect(assessment.patterns).toBeDefined();
    expect(assessment.recommendations).toBeDefined();
    expect(assessment.trendSummary).toBeDefined();
    expect(assessment.trendSummary.healthDelta7d).toBe(5);
  });

  it('handles empty history gracefully', () => {
    const data = makeActivityData();
    const assessment = assessGovernanceHealth(data, []);
    expect(assessment.alerts).toBeDefined();
    expect(assessment.patterns).toBeDefined();
    expect(assessment.trendSummary.healthDelta7d).toBeNull();
  });

  it('handles empty data gracefully', () => {
    const data = makeActivityData({
      agentStats: [],
      proposals: [],
      pullRequests: [],
      comments: [],
    });
    const assessment = assessGovernanceHealth(data, []);
    expect(assessment.alerts).toEqual([]);
    expect(assessment.patterns).toEqual([]);
  });
});
