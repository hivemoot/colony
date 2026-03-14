import { describe, expect, it } from 'vitest';
import type { ActivityData } from '../../shared/types';
import {
  buildBenchmarkArtifact,
  buildRepoBenchmark,
  buildSelfComparison,
  computeBenchmarkMetrics,
  normalizeColonyPullRequests,
  parseArgs,
  parseRepositoryList,
  type ComparablePullRequest,
} from '../generate-benchmark';

function makePullRequest(
  overrides: Partial<ComparablePullRequest> = {}
): ComparablePullRequest {
  return {
    number: 1,
    author: 'hivemoot-forager',
    createdAt: '2026-03-01T00:00:00Z',
    closedAt: null,
    mergedAt: null,
    state: 'open',
    ...overrides,
  };
}

function makeActivityData(
  pullRequests: ActivityData['pullRequests'],
  generatedAt = '2026-03-14T00:00:00Z'
): ActivityData {
  return {
    generatedAt,
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 1,
      forks: 1,
      openIssues: 1,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests,
    proposals: [],
    comments: [],
  };
}

describe('parseRepositoryList', () => {
  it('keeps only valid owner/name repository entries', () => {
    expect(
      parseRepositoryList('chaoss/grimoirelab, bad, sigstore/cosign , nope/')
    ).toEqual(['chaoss/grimoirelab', 'sigstore/cosign']);
  });
});

describe('parseArgs', () => {
  it('parses repositories, output path, window days, and json mode', () => {
    const options = parseArgs([
      '--repos=chaoss/grimoirelab,sigstore/cosign',
      '--window-days=45',
      '--out=/tmp/benchmark.json',
      '--json',
    ]);

    expect(options.repositories).toEqual([
      'chaoss/grimoirelab',
      'sigstore/cosign',
    ]);
    expect(options.windowDays).toBe(45);
    expect(options.outputPath).toBe('/tmp/benchmark.json');
    expect(options.json).toBe(true);
  });

  it('uses defaults when no flags are provided', () => {
    const options = parseArgs([]);
    expect(options.repositories).toEqual([
      'chaoss/grimoirelab',
      'chaoss/augur',
      'sigstore/cosign',
    ]);
    expect(options.windowDays).toBe(90);
    expect(options.json).toBe(false);
  });
});

describe('computeBenchmarkMetrics', () => {
  it('counts PRs opened, merged, and open within the window', () => {
    const windowEnd = new Date('2026-03-14T00:00:00Z');
    const prs: ComparablePullRequest[] = [
      makePullRequest({
        number: 1,
        createdAt: '2026-03-01T00:00:00Z',
        mergedAt: '2026-03-02T00:00:00Z',
        state: 'merged',
      }),
      makePullRequest({
        number: 2,
        createdAt: '2026-03-03T00:00:00Z',
        mergedAt: null,
        state: 'open',
      }),
      makePullRequest({
        number: 3,
        createdAt: '2026-03-10T00:00:00Z',
        mergedAt: '2026-03-11T00:00:00Z',
        state: 'merged',
      }),
    ];

    const metrics = computeBenchmarkMetrics(prs, windowEnd, 30);

    expect(metrics.openedPrs).toBe(3);
    expect(metrics.mergedPrs).toBe(2);
    expect(metrics.openPrs).toBe(1);
    expect(metrics.mergeRate).toBeCloseTo(2 / 3);
  });

  it('counts stale open PRs older than 7 days at window end', () => {
    const windowEnd = new Date('2026-03-14T00:00:00Z');
    const prs: ComparablePullRequest[] = [
      // Stale: created 10 days before window end, still open
      makePullRequest({
        number: 1,
        createdAt: '2026-03-04T00:00:00Z',
        state: 'open',
      }),
      // Not stale: created 3 days before window end
      makePullRequest({
        number: 2,
        createdAt: '2026-03-11T00:00:00Z',
        state: 'open',
      }),
    ];

    const metrics = computeBenchmarkMetrics(prs, windowEnd, 30);

    expect(metrics.openPrs).toBe(2);
    expect(metrics.staleOpenPrs).toBe(1);
    expect(metrics.staleOpenPrShare).toBeCloseTo(0.5);
  });

  it('returns null prCycleTimeP50Hours when no PRs were merged', () => {
    const windowEnd = new Date('2026-03-14T00:00:00Z');
    const metrics = computeBenchmarkMetrics([], windowEnd, 30);
    expect(metrics.prCycleTimeP50Hours).toBeNull();
    expect(metrics.mergeRate).toBeNull();
  });

  it('computes p50 cycle time correctly', () => {
    const windowEnd = new Date('2026-03-14T00:00:00Z');
    // 24-hour PR and 48-hour PR: p50 should be 24h (lower of two)
    const prs: ComparablePullRequest[] = [
      makePullRequest({
        number: 1,
        createdAt: '2026-03-01T00:00:00Z',
        mergedAt: '2026-03-02T00:00:00Z',
        state: 'merged',
      }),
      makePullRequest({
        number: 2,
        createdAt: '2026-03-01T00:00:00Z',
        mergedAt: '2026-03-03T00:00:00Z',
        state: 'merged',
      }),
    ];

    const metrics = computeBenchmarkMetrics(prs, windowEnd, 30);
    expect(metrics.prCycleTimeP50Hours).toBe(24);
  });

  /**
   * Regression test for Bug 1: PRs created before the window start but merged
   * inside the window must be counted in mergedWithinWindow.
   *
   * Before the fix, `fetchRepoPullRequests` stopped paging at windowStart, so
   * these PRs were never loaded. At the compute layer, the fix is that we pass
   * a correctly fetched slice — this test confirms the compute function itself
   * correctly counts cross-boundary PRs when they are present in the input.
   */
  it('counts a PR created before the window but merged inside it', () => {
    const windowEnd = new Date('2026-03-14T00:00:00Z');
    const windowDays = 30;
    // windowStart = 2026-02-12

    const prs: ComparablePullRequest[] = [
      // Created 40 days before window end (before windowStart), merged 5 days before end (inside window)
      makePullRequest({
        number: 1,
        createdAt: '2026-02-02T00:00:00Z',
        mergedAt: '2026-03-09T00:00:00Z',
        state: 'merged',
      }),
    ];

    const metrics = computeBenchmarkMetrics(prs, windowEnd, windowDays);

    // mergedWithinWindow should count this PR
    expect(metrics.mergedPrs).toBe(1);
    // openedWithinWindow should NOT count it (created before window)
    expect(metrics.openedPrs).toBe(0);
    // cycle time should be computed: 2026-02-02 to 2026-03-09 = 35 days = 840h
    expect(metrics.prCycleTimeP50Hours).toBe(840);
  });
});

describe('buildRepoBenchmark', () => {
  it('sets window start and end from windowEnd and windowDays', () => {
    const windowEnd = new Date('2026-03-14T00:00:00Z');
    const result = buildRepoBenchmark(
      'test/repo',
      'activity-json',
      [],
      windowEnd,
      30
    );

    expect(result.window.end).toBe('2026-03-14T00:00:00.000Z');
    expect(result.window.start).toBe('2026-02-12T00:00:00.000Z');
    expect(result.window.days).toBe(30);
  });
});

describe('buildSelfComparison', () => {
  /**
   * Regression test for Bug 2: buildSelfComparison must use generatedAt as
   * the current window end, not the latest PR's createdAt.
   *
   * Before the fix, if the repo went quiet for several days before data
   * generation, the stale currentEnd would exclude recently opened PRs from
   * openAtWindowEnd's denominator.
   */
  it('uses generatedAt as the current window end, not latest PR createdAt', () => {
    const generatedAt = new Date('2026-03-14T00:00:00Z');

    // Last PR was created 5 days before generatedAt
    const prs: ComparablePullRequest[] = [
      makePullRequest({
        number: 1,
        createdAt: '2026-01-01T00:00:00Z',
        state: 'open',
      }),
      makePullRequest({
        number: 2,
        createdAt: '2026-03-09T00:00:00Z',
        state: 'open',
      }),
    ];

    const result = buildSelfComparison('hivemoot/colony', prs, generatedAt);

    // current window end must match generatedAt, not PR #2's createdAt
    expect(result.current.window.end).toBe('2026-03-14T00:00:00.000Z');
  });

  it('sets baseline end to first-PR createdAt plus SELF_COMPARISON_DAYS', () => {
    const generatedAt = new Date('2026-03-14T00:00:00Z');
    const prs: ComparablePullRequest[] = [
      makePullRequest({
        number: 1,
        createdAt: '2026-01-01T00:00:00Z',
        state: 'merged',
        mergedAt: '2026-01-02T00:00:00Z',
      }),
      makePullRequest({
        number: 2,
        createdAt: '2026-03-01T00:00:00Z',
        state: 'open',
      }),
    ];

    const result = buildSelfComparison('hivemoot/colony', prs, generatedAt);

    // baseline end = 2026-01-01 + 30 days = 2026-01-31
    expect(result.baseline.window.end).toBe('2026-01-31T00:00:00.000Z');
    expect(result.baselineLabel).toBe('first-30-days');
  });
});

describe('buildBenchmarkArtifact', () => {
  it('passes generatedAt to buildSelfComparison', () => {
    const generatedAt = '2026-03-14T00:00:00Z';
    const data = makeActivityData(
      [
        {
          number: 1,
          title: 'PR 1',
          state: 'open',
          author: 'hivemoot-forager',
          createdAt: '2026-03-01T00:00:00Z',
          closedAt: null,
          mergedAt: null,
        },
      ],
      generatedAt
    );

    const artifact = buildBenchmarkArtifact(data, [], 90);

    expect(artifact.selfComparison.current.window.end).toBe(
      new Date(generatedAt).toISOString()
    );
    expect(artifact.generatedAt).toBe(new Date(generatedAt).toISOString());
  });
});

describe('normalizeColonyPullRequests', () => {
  it('maps activity.json PR shape to ComparablePullRequest', () => {
    const data = makeActivityData([
      {
        number: 42,
        title: 'fix: something',
        state: 'merged',
        author: 'hivemoot-worker',
        createdAt: '2026-03-01T00:00:00Z',
        closedAt: '2026-03-02T00:00:00Z',
        mergedAt: '2026-03-02T00:00:00Z',
      },
    ]);

    const prs = normalizeColonyPullRequests(data);

    expect(prs).toHaveLength(1);
    expect(prs[0]).toEqual({
      number: 42,
      author: 'hivemoot-worker',
      createdAt: '2026-03-01T00:00:00Z',
      closedAt: '2026-03-02T00:00:00Z',
      mergedAt: '2026-03-02T00:00:00Z',
      state: 'merged',
    });
  });
});
