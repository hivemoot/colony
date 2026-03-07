import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkReport,
  buildTimeWindows,
  computeGini,
  computePercentile,
  formatBenchmarkReport,
  type ExternalReference,
} from '../check-benchmarks';
import type { ActivityData } from '../../shared/types';

function createActivityData(): ActivityData {
  return {
    generatedAt: '2026-03-04T00:00:00.000Z',
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
    commits: [
      {
        sha: 'abc1234',
        message: 'test',
        author: 'hivemoot-builder',
        date: '2026-01-10T00:00:00.000Z',
      },
      {
        sha: 'def5678',
        message: 'test',
        author: 'hivemoot-worker',
        date: '2026-02-08T00:00:00.000Z',
      },
    ],
    issues: [
      {
        number: 1,
        title: 'Issue',
        state: 'open',
        labels: [],
        author: 'hivemoot-builder',
        createdAt: '2026-01-12T00:00:00.000Z',
      },
    ],
    pullRequests: [
      {
        number: 10,
        title: 'PR 1',
        state: 'merged',
        author: 'hivemoot-builder',
        createdAt: '2026-01-05T00:00:00.000Z',
        mergedAt: '2026-01-08T00:00:00.000Z',
      },
      {
        number: 11,
        title: 'PR 2',
        state: 'merged',
        author: 'hivemoot-worker',
        createdAt: '2026-02-04T00:00:00.000Z',
        mergedAt: '2026-02-10T00:00:00.000Z',
      },
      {
        number: 12,
        title: 'PR 3',
        state: 'open',
        author: 'hivemoot-forager',
        createdAt: '2026-02-12T00:00:00.000Z',
      },
    ],
    proposals: [
      {
        number: 101,
        title: 'Proposal 1',
        phase: 'implemented',
        author: 'hivemoot-builder',
        createdAt: '2026-01-07T00:00:00.000Z',
        commentCount: 0,
      },
      {
        number: 102,
        title: 'Proposal 2',
        phase: 'ready-to-implement',
        author: 'hivemoot-worker',
        createdAt: '2026-02-03T00:00:00.000Z',
        commentCount: 0,
      },
      {
        number: 103,
        title: 'Proposal 3',
        phase: 'discussion',
        author: 'hivemoot-forager',
        createdAt: '2026-02-06T00:00:00.000Z',
        commentCount: 0,
      },
    ],
    comments: [
      {
        id: 1,
        issueOrPrNumber: 10,
        type: 'review',
        author: 'hivemoot-worker',
        body: 'LGTM',
        createdAt: '2026-01-06T00:00:00.000Z',
        url: 'https://example.com/review/1',
      },
      {
        id: 2,
        issueOrPrNumber: 11,
        type: 'review',
        author: 'hivemoot-builder',
        body: 'LGTM',
        createdAt: '2026-02-08T00:00:00.000Z',
        url: 'https://example.com/review/2',
      },
      {
        id: 3,
        issueOrPrNumber: 11,
        type: 'review',
        author: 'hivemoot-forager',
        body: 'LGTM',
        createdAt: '2026-02-09T00:00:00.000Z',
        url: 'https://example.com/review/3',
      },
      {
        id: 4,
        issueOrPrNumber: 11,
        type: 'pr',
        author: 'hivemoot-worker',
        body: 'Not a review',
        createdAt: '2026-02-09T00:00:00.000Z',
        url: 'https://example.com/comment/4',
      },
    ],
  };
}

describe('buildTimeWindows', () => {
  it('splits timestamps into deterministic fixed-length windows', () => {
    const windows = buildTimeWindows(
      [
        Date.parse('2026-01-05T12:00:00.000Z'),
        Date.parse('2026-02-12T03:00:00.000Z'),
      ],
      30
    );

    expect(windows).toHaveLength(2);
    expect(windows[0]).toEqual({
      startMs: Date.parse('2026-01-05T00:00:00.000Z'),
      endExclusiveMs: Date.parse('2026-02-04T00:00:00.000Z'),
    });
    expect(windows[1]).toEqual({
      startMs: Date.parse('2026-02-04T00:00:00.000Z'),
      endExclusiveMs: Date.parse('2026-02-13T00:00:00.000Z'),
    });
  });
});

describe('computePercentile', () => {
  it('calculates percentiles using interpolation', () => {
    const values = [1, 2, 10, 11];

    expect(computePercentile(values, 50)).toBe(6);
    expect(computePercentile(values, 95)).toBeCloseTo(10.85, 5);
  });

  it('returns null for empty inputs', () => {
    expect(computePercentile([], 95)).toBeNull();
  });
});

describe('computeGini', () => {
  it('returns zero for a perfectly equal distribution', () => {
    expect(computeGini([3, 3, 3])).toBe(0);
  });

  it('returns positive value for concentrated distributions', () => {
    expect(computeGini([0, 0, 10])).toBeGreaterThan(0.6);
  });
});

describe('buildBenchmarkReport', () => {
  it('includes window metadata, sample sizes, and computed metrics', () => {
    const report = buildBenchmarkReport(createActivityData(), {
      activityPath: '/tmp/activity.json',
      windowDays: 30,
      generatedAt: new Date('2026-03-04T12:00:00.000Z'),
    });

    expect(report.generatedAt).toBe('2026-03-04T12:00:00.000Z');
    expect(report.windowDays).toBe(30);
    expect(report.windows).toHaveLength(2);

    expect(report.windows[0]).toMatchObject({
      windowStart: '2026-01-05',
      windowEnd: '2026-02-03',
      sampleSize: {
        pullRequests: 1,
        mergedPullRequests: 1,
        reviews: 1,
        proposals: 2,
      },
      prCycleTime: { p50Days: 3, p95Days: 3, sampleSize: 1 },
      reviewDensity: {
        reviewsPerPr: 1,
        reviewCount: 1,
        pullRequestCount: 1,
        sampleSize: 1,
      },
      proposalThroughput: {
        proposalsPerWeek: 0.467,
        proposalCount: 2,
        sampleSize: 2,
      },
    });

    expect(report.windows[1]).toMatchObject({
      windowStart: '2026-02-04',
      windowEnd: '2026-02-12',
      sampleSize: {
        pullRequests: 2,
        mergedPullRequests: 1,
        reviews: 2,
        proposals: 1,
      },
      prCycleTime: { p50Days: 6, p95Days: 6, sampleSize: 1 },
      reviewDensity: {
        reviewsPerPr: 1,
        reviewCount: 2,
        pullRequestCount: 2,
        sampleSize: 2,
      },
      proposalThroughput: {
        proposalsPerWeek: 0.778,
        proposalCount: 1,
        sampleSize: 1,
      },
    });

    expect(report.windows[1]?.contributorConcentration.gini).toBeGreaterThan(0);
  });

  it('is deterministic for the same input regardless of wall clock', () => {
    const data = createActivityData();

    const first = buildBenchmarkReport(data, {
      activityPath: '/tmp/activity.json',
      windowDays: 30,
      generatedAt: new Date(data.generatedAt),
    });
    const second = buildBenchmarkReport(data, {
      activityPath: '/tmp/activity.json',
      windowDays: 30,
      generatedAt: new Date(data.generatedAt),
    });

    expect(first).toEqual(second);
    expect(first.generatedAt).toBe(data.generatedAt);
  });
});

describe('formatBenchmarkReport', () => {
  it('renders window and sample-size context in each section', () => {
    const report = buildBenchmarkReport(createActivityData(), {
      activityPath: '/tmp/activity.json',
      windowDays: 30,
      generatedAt: new Date('2026-03-04T12:00:00.000Z'),
    });

    const output = formatBenchmarkReport(report);

    expect(output).toContain('Colony Performance Trends');
    expect(output).toContain(
      'Window: 2026-01-05 -> 2026-02-03 | PRs=1 merged=1 reviews=1 proposals=2'
    );
    expect(output).toContain('PR Cycle Time: p50=3.00d p95=3.00d (n=1)');
    expect(output).toContain(
      'Review Density: 1.00 reviews/PR (reviews=1, prs=1)'
    );
    expect(output).toContain('Proposal Throughput: 0.47 proposals/week (n=2)');
  });

  it('renders a no-activity message when report has no windows', () => {
    const output = formatBenchmarkReport({
      generatedAt: '2026-03-04T12:00:00.000Z',
      source: {
        activityPath: '/tmp/activity.json',
        activityGeneratedAt: '2026-03-04T00:00:00.000Z',
      },
      windowDays: 30,
      windows: [],
    });

    expect(output).toContain(
      'No benchmarkable activity found in activity.json.'
    );
  });
});

describe('--compare flag', () => {
  it('omits externalReferences when compare is not set', () => {
    const data = createActivityData();
    const report = buildBenchmarkReport(data, { compare: false });
    expect(report.externalReferences).toBeUndefined();
  });

  it('includes externalReferences array when compare is true', () => {
    const data = createActivityData();
    const report = buildBenchmarkReport(data, { compare: true });
    expect(report.externalReferences).toBeDefined();
    expect(Array.isArray(report.externalReferences)).toBe(true);
    expect((report.externalReferences ?? []).length).toBeGreaterThan(0);
  });

  it('includes a prCycleTime external reference with correct structure', () => {
    const data = createActivityData();
    const report = buildBenchmarkReport(data, { compare: true });
    const prRef = (report.externalReferences ?? []).find(
      (ref: ExternalReference) => ref.metric === 'prCycleTime'
    );
    expect(prRef).toBeDefined();
    expect(prRef?.metric).toBe('prCycleTime');
    expect(prRef?.eliteThresholdDays).toBe(0.54);
    expect(prRef?.medianDays).toBe(4);
    expect(prRef?.year).toBe(2025);
    expect(prRef?.sampleSize).toContain('6.1M');
    expect(prRef?.source).toContain('LinearB');
    expect(prRef?.sourceUrl).toContain('linearb.io');
    expect(prRef?.caveat).toContain('24/7');
  });

  it('shows external reference header and caveat in text output', () => {
    const data = createActivityData();
    const report = buildBenchmarkReport(data, { compare: true });
    const output = formatBenchmarkReport(report);
    expect(output).toContain('External ref (prCycleTime)');
    expect(output).toContain('LinearB');
    expect(output).toContain('Elite');
    expect(output).toContain('Comparability note');
    expect(output).toContain('24/7');
  });

  it('appends ref comparison to PR Cycle Time line in text output', () => {
    const data = createActivityData();
    const report = buildBenchmarkReport(data, { compare: true });
    const output = formatBenchmarkReport(report);
    expect(output).toMatch(/PR Cycle Time:.*\[ref:/);
  });

  it('does not show external ref header when compare is false', () => {
    const data = createActivityData();
    const report = buildBenchmarkReport(data, { compare: false });
    const output = formatBenchmarkReport(report);
    expect(output).not.toContain('External ref');
    expect(output).not.toContain('Comparability note');
  });
});
