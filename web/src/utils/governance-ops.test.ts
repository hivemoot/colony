import { describe, expect, it, vi } from 'vitest';
import type { ActivityData } from '../types/activity';
import { computeGovernanceOpsReport } from './governance-ops';

function makeBaseData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-11T12:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 1,
      forks: 1,
      openIssues: 1,
    },
    agents: [{ login: 'hivemoot-builder' }],
    agentStats: [
      {
        login: 'hivemoot-builder',
        commits: 1,
        pullRequestsMerged: 1,
        issuesOpened: 1,
        reviews: 1,
        comments: 1,
        lastActiveAt: '2026-02-11T11:00:00Z',
      },
    ],
    commits: [
      {
        sha: 'abc1234',
        message: 'test',
        author: 'hivemoot-builder',
        date: '2026-02-11T10:00:00Z',
      },
    ],
    issues: [
      {
        number: 1,
        title: 'issue',
        state: 'open',
        labels: [],
        author: 'hivemoot-builder',
        createdAt: '2026-02-10T00:00:00Z',
      },
    ],
    pullRequests: [],
    proposals: [],
    comments: [],
    externalVisibility: {
      status: 'green',
      score: 90,
      checks: [],
      blockers: [],
    },
    governanceIncidents: [],
    ...overrides,
  };
}

describe('computeGovernanceOpsReport', () => {
  it('reports healthy budget when all five SLO checks pass', () => {
    const data = makeBaseData({
      proposals: [
        {
          number: 1,
          title: 'Ship ops layer',
          phase: 'implemented',
          author: 'hivemoot-builder',
          createdAt: '2026-02-09T00:00:00Z',
          commentCount: 3,
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-09T00:00:00Z' },
            { phase: 'voting', enteredAt: '2026-02-09T12:00:00Z' },
            {
              phase: 'ready-to-implement',
              enteredAt: '2026-02-10T00:00:00Z',
            },
            { phase: 'implemented', enteredAt: '2026-02-10T06:00:00Z' },
          ],
        },
      ],
      pullRequests: [
        {
          number: 101,
          title: 'feat: governance ops',
          body: 'Fixes #1',
          state: 'merged',
          author: 'hivemoot-builder',
          createdAt: '2026-02-10T06:00:00Z',
          mergedAt: '2026-02-10T09:00:00Z',
        },
      ],
    });

    const report = computeGovernanceOpsReport(
      data,
      new Date('2026-02-11T12:00:00Z')
    );

    expect(report.checks).toHaveLength(5);
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
    expect(report.reliabilityBudget.passCount).toBe(5);
    expect(report.reliabilityBudget.warnCount).toBe(0);
    expect(report.reliabilityBudget.failCount).toBe(0);
    expect(report.reliabilityBudget.mode).toBe('healthy');
    expect(report.reliabilityBudget.remaining).toBe(100);
  });

  it('flags stale ready work, stale dashboard data, and low discoverability', () => {
    const data = makeBaseData({
      generatedAt: '2026-02-10T00:00:00Z',
      proposals: [
        {
          number: 2,
          title: 'Blocked item A',
          phase: 'ready-to-implement',
          author: 'hivemoot-worker',
          createdAt: '2026-02-08T00:00:00Z',
          commentCount: 1,
          phaseTransitions: [
            {
              phase: 'ready-to-implement',
              enteredAt: '2026-02-09T00:00:00Z',
            },
          ],
        },
        {
          number: 3,
          title: 'Blocked item B',
          phase: 'ready-to-implement',
          author: 'hivemoot-scout',
          createdAt: '2026-02-08T00:00:00Z',
          commentCount: 1,
          phaseTransitions: [
            {
              phase: 'ready-to-implement',
              enteredAt: '2026-02-09T00:00:00Z',
            },
          ],
        },
      ],
      externalVisibility: {
        status: 'red',
        score: 40,
        checks: [],
        blockers: ['Repository homepage URL configured'],
      },
    });

    const report = computeGovernanceOpsReport(
      data,
      new Date('2026-02-11T12:00:00Z')
    );

    const blocked = report.checks.find(
      (check) => check.id === 'blocked-ready-work'
    );
    const freshness = report.checks.find(
      (check) => check.id === 'dashboard-freshness'
    );
    const discoverability = report.checks.find(
      (check) => check.id === 'discoverability-health'
    );

    expect(blocked?.status).toBe('fail');
    expect(blocked?.value).toBe('2 blocked');
    expect(freshness?.status).toBe('fail');
    expect(discoverability?.status).toBe('fail');
    expect(report.reliabilityBudget.mode).toBe('stabilize');
    expect(report.reliabilityBudget.failCount).toBeGreaterThanOrEqual(3);
  });

  it('counts only open incidents in taxonomy buckets', () => {
    const data = makeBaseData({
      governanceIncidents: [
        {
          id: 'i-1',
          category: 'permissions',
          severity: 'high',
          title: 'Push blocked',
          detectedAt: '2026-02-11T10:00:00Z',
          status: 'open',
        },
        {
          id: 'i-2',
          category: 'automation-failure',
          severity: 'medium',
          title: 'CI failed',
          detectedAt: '2026-02-11T09:00:00Z',
          status: 'mitigated',
        },
      ],
    });

    const report = computeGovernanceOpsReport(data);

    expect(report.incidents.open).toHaveLength(1);
    expect(report.incidents.byCategory.permissions).toBe(1);
    expect(report.incidents.byCategory['automation-failure']).toBe(0);
    expect(report.incidents.byCategory['ci-regression']).toBe(0);
    expect(report.incidents.byCategory['governance-deadlock']).toBe(0);
    expect(report.incidents.byCategory['maintainer-gate']).toBe(0);
  });

  it('links proposals to PRs by repo and issue number in multi-repo mode', () => {
    const data = makeBaseData({
      proposals: [
        {
          number: 42,
          title: 'Colony proposal',
          phase: 'ready-to-implement',
          author: 'hivemoot-builder',
          createdAt: '2026-02-09T00:00:00Z',
          commentCount: 1,
          repo: 'hivemoot/colony',
          phaseTransitions: [
            {
              phase: 'ready-to-implement',
              enteredAt: '2026-02-10T00:00:00Z',
            },
          ],
        },
        {
          number: 42,
          title: 'Companion proposal',
          phase: 'ready-to-implement',
          author: 'hivemoot-scout',
          createdAt: '2026-02-09T00:00:00Z',
          commentCount: 1,
          repo: 'hivemoot/companion',
          phaseTransitions: [
            {
              phase: 'ready-to-implement',
              enteredAt: '2026-02-09T00:00:00Z',
            },
          ],
        },
      ],
      pullRequests: [
        {
          number: 420,
          title: 'feat: implement colony ops',
          body: 'Fixes #42',
          state: 'open',
          author: 'hivemoot-builder',
          createdAt: '2026-02-10T02:00:00Z',
          repo: 'hivemoot/colony',
        },
      ],
    });

    const report = computeGovernanceOpsReport(
      data,
      new Date('2026-02-11T12:00:00Z')
    );

    const leadTime = report.checks.find(
      (check) => check.id === 'implementation-lead-time'
    );
    const blocked = report.checks.find(
      (check) => check.id === 'blocked-ready-work'
    );

    expect(leadTime?.value).toBe('2h');
    expect(blocked?.value).toBe('1 blocked');
    expect(blocked?.status).toBe('warn');
  });

  it('uses wall-clock time by default for freshness checks', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-02-11T12:00:00Z'));

      const report = computeGovernanceOpsReport(
        makeBaseData({
          generatedAt: '2026-02-10T00:00:00Z',
        })
      );

      const freshness = report.checks.find(
        (check) => check.id === 'dashboard-freshness'
      );

      expect(freshness?.status).toBe('fail');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails freshness check when generatedAt is in the future', () => {
    const report = computeGovernanceOpsReport(
      makeBaseData({
        generatedAt: '2026-02-11T18:00:00Z',
      }),
      new Date('2026-02-11T12:00:00Z')
    );

    const freshness = report.checks.find(
      (check) => check.id === 'dashboard-freshness'
    );

    expect(freshness?.status).toBe('fail');
    expect(freshness?.detail).toContain('in the future');
  });

  it('fails freshness check when generatedAt is invalid', () => {
    const report = computeGovernanceOpsReport(
      makeBaseData({
        generatedAt: 'not-a-date',
      }),
      new Date('2026-02-11T12:00:00Z')
    );

    const freshness = report.checks.find(
      (check) => check.id === 'dashboard-freshness'
    );

    expect(freshness?.status).toBe('fail');
    expect(freshness?.value).toBe('Invalid timestamp');
  });
});
