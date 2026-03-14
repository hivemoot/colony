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
    author: 'hivemoot-scout',
    createdAt: '2026-03-01T00:00:00Z',
    closedAt: null,
    mergedAt: null,
    state: 'open',
    ...overrides,
  };
}

function makeActivityData(
  pullRequests: ActivityData['pullRequests']
): ActivityData {
  return {
    generatedAt: '2026-03-14T00:00:00Z',
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
});

describe('computeBenchmarkMetrics', () => {
  it('computes PR cycle time, merge rate, and stale-open share', () => {
    const metrics = computeBenchmarkMetrics(
      [
        makePullRequest({
          number: 1,
          author: 'a',
          state: 'merged',
          createdAt: '2026-02-20T00:00:00Z',
          mergedAt: '2026-02-22T00:00:00Z',
          closedAt: '2026-02-22T00:00:00Z',
        }),
        makePullRequest({
          number: 2,
          author: 'b',
          state: 'merged',
          createdAt: '2026-03-01T00:00:00Z',
          mergedAt: '2026-03-02T00:00:00Z',
          closedAt: '2026-03-02T00:00:00Z',
        }),
        makePullRequest({
          number: 3,
          author: 'c',
          state: 'open',
          createdAt: '2026-03-03T00:00:00Z',
        }),
        makePullRequest({
          number: 4,
          author: 'd',
          state: 'open',
          createdAt: '2026-02-01T00:00:00Z',
        }),
      ],
      new Date('2026-03-14T00:00:00Z'),
      30
    );

    expect(metrics.openedPrs).toBe(3);
    expect(metrics.mergedPrs).toBe(2);
    expect(metrics.activeContributors).toBe(3);
    expect(metrics.prCycleTimeP50Hours).toBe(24);
    expect(metrics.mergeRate).toBeCloseTo(2 / 3);
    expect(metrics.openPrs).toBe(2);
    expect(metrics.staleOpenPrs).toBe(2);
    expect(metrics.staleOpenPrShare).toBe(1);
  });

  it('reconstructs historical open PRs for a past comparison window', () => {
    const metrics = computeBenchmarkMetrics(
      [
        makePullRequest({
          number: 1,
          state: 'merged',
          createdAt: '2026-01-02T00:00:00Z',
          mergedAt: '2026-02-10T00:00:00Z',
          closedAt: '2026-02-10T00:00:00Z',
        }),
        makePullRequest({
          number: 2,
          state: 'open',
          createdAt: '2026-01-10T00:00:00Z',
        }),
      ],
      new Date('2026-01-31T00:00:00Z'),
      30
    );

    expect(metrics.openedPrs).toBe(2);
    expect(metrics.openPrs).toBe(2);
    expect(metrics.staleOpenPrShare).toBe(1);
    expect(metrics.mergedPrs).toBe(0);
  });
});

describe('normalizeColonyPullRequests', () => {
  it('filters out pull requests from non-primary repositories', () => {
    const data = makeActivityData([
      {
        number: 1,
        title: 'Primary',
        state: 'merged',
        author: 'hivemoot-scout',
        createdAt: '2026-03-01T00:00:00Z',
        mergedAt: '2026-03-02T00:00:00Z',
        closedAt: '2026-03-02T00:00:00Z',
        repo: 'hivemoot/colony',
      },
      {
        number: 2,
        title: 'Secondary',
        state: 'merged',
        author: 'hivemoot-scout',
        createdAt: '2026-03-01T00:00:00Z',
        mergedAt: '2026-03-02T00:00:00Z',
        closedAt: '2026-03-02T00:00:00Z',
        repo: 'hivemoot/hivemoot',
      },
    ]);

    expect(normalizeColonyPullRequests(data)).toHaveLength(1);
    expect(normalizeColonyPullRequests(data)[0].number).toBe(1);
  });
});

describe('artifact builders', () => {
  it('builds a repo benchmark window around the provided end date', () => {
    const benchmark = buildRepoBenchmark(
      'chaoss/grimoirelab',
      'github-api',
      [
        makePullRequest({
          state: 'merged',
          createdAt: '2026-03-01T00:00:00Z',
          mergedAt: '2026-03-02T00:00:00Z',
          closedAt: '2026-03-02T00:00:00Z',
        }),
      ],
      new Date('2026-03-14T00:00:00Z'),
      14
    );

    expect(benchmark.window.start).toBe('2026-02-28T00:00:00.000Z');
    expect(benchmark.window.end).toBe('2026-03-14T00:00:00.000Z');
    expect(benchmark.metrics.prCycleTimeP50Hours).toBe(24);
  });

  it('builds a first-30-days self comparison from colony pull requests', () => {
    const selfComparison = buildSelfComparison('hivemoot/colony', [
      makePullRequest({
        number: 1,
        createdAt: '2026-01-05T00:00:00Z',
        mergedAt: '2026-01-06T00:00:00Z',
        closedAt: '2026-01-06T00:00:00Z',
        state: 'merged',
      }),
      makePullRequest({
        number: 2,
        createdAt: '2026-03-10T00:00:00Z',
        mergedAt: '2026-03-11T00:00:00Z',
        closedAt: '2026-03-11T00:00:00Z',
        state: 'merged',
      }),
    ]);

    expect(selfComparison.baselineLabel).toBe('first-30-days');
    expect(selfComparison.baseline.window.end).toBe('2026-02-04T00:00:00.000Z');
    expect(selfComparison.current.window.end).toBe('2026-03-10T00:00:00.000Z');
  });

  it('builds the benchmark artifact with colony, cohort, and notes', () => {
    const data = makeActivityData([
      {
        number: 1,
        title: 'One',
        state: 'merged',
        author: 'hivemoot-scout',
        createdAt: '2026-03-01T00:00:00Z',
        mergedAt: '2026-03-02T00:00:00Z',
        closedAt: '2026-03-02T00:00:00Z',
      },
    ]);
    const cohort = [
      buildRepoBenchmark(
        'chaoss/grimoirelab',
        'github-api',
        [
          makePullRequest({
            number: 10,
            author: 'alice',
            state: 'merged',
            createdAt: '2026-03-01T00:00:00Z',
            mergedAt: '2026-03-05T00:00:00Z',
            closedAt: '2026-03-05T00:00:00Z',
          }),
        ],
        new Date('2026-03-14T00:00:00Z'),
        30
      ),
    ];

    const artifact = buildBenchmarkArtifact(data, cohort, 30);

    expect(artifact.methodologyPath).toBe('docs/BENCHMARK-METHODOLOGY.md');
    expect(artifact.colony.repository).toBe('hivemoot/colony');
    expect(artifact.cohort).toHaveLength(1);
    expect(artifact.notes).toHaveLength(3);
  });
});
