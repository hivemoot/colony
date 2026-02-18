import { describe, expect, it } from 'vitest';
import {
  buildDiscoverabilityReport,
  classifyPullRequestStatus,
  parsePullRequestUrl,
  summarizePullRequestStatuses,
} from '../discoverability-report';

describe('parsePullRequestUrl', () => {
  it('parses a standard github pull request URL', () => {
    expect(
      parsePullRequestUrl(
        'https://github.com/e2b-dev/awesome-ai-agents/pull/274'
      )
    ).toEqual({
      repo: 'e2b-dev/awesome-ai-agents',
      number: 274,
      url: 'https://github.com/e2b-dev/awesome-ai-agents/pull/274',
    });
  });

  it('rejects non-github hosts and non-pull URLs', () => {
    expect(() =>
      parsePullRequestUrl('https://example.com/org/repo/pull/1')
    ).toThrow(/github.com/);
    expect(() =>
      parsePullRequestUrl('https://github.com/org/repo/issues/1')
    ).toThrow(/pull request URL format/);
  });
});

describe('classifyPullRequestStatus', () => {
  it('classifies merged, open, and closed pull requests', () => {
    expect(
      classifyPullRequestStatus({
        state: 'OPEN',
        mergedAt: '2026-02-16T00:00:00Z',
      })
    ).toBe('merged');
    expect(classifyPullRequestStatus({ state: 'OPEN', mergedAt: null })).toBe(
      'open'
    );
    expect(classifyPullRequestStatus({ state: 'CLOSED', mergedAt: null })).toBe(
      'closed'
    );
  });

  it('returns unknown when state is not recognized', () => {
    expect(classifyPullRequestStatus({ state: 'DRAFT' })).toBe('unknown');
  });
});

describe('summarizePullRequestStatuses', () => {
  it('rolls up pull request statuses into totals', () => {
    expect(
      summarizePullRequestStatuses([
        {
          url: 'https://github.com/a/b/pull/1',
          repo: 'a/b',
          number: 1,
          status: 'merged',
        },
        {
          url: 'https://github.com/a/b/pull/2',
          repo: 'a/b',
          number: 2,
          status: 'open',
        },
        {
          url: 'https://github.com/a/b/pull/3',
          repo: 'a/b',
          number: 3,
          status: 'closed',
        },
        {
          url: 'https://github.com/a/b/pull/4',
          repo: 'a/b',
          number: 4,
          status: 'unknown',
          error: 'not found',
        },
      ])
    ).toEqual({
      merged: 1,
      open: 1,
      closed: 1,
      unknown: 1,
      total: 4,
    });
  });
});

describe('buildDiscoverabilityReport', () => {
  it('computes star delta and carries pull request summary', () => {
    const report = buildDiscoverabilityReport({
      repository: 'hivemoot/colony',
      baselineStars: 2,
      currentStars: 7,
      generatedAt: '2026-02-18T00:00:00Z',
      pullRequests: [
        {
          url: 'https://github.com/a/b/pull/1',
          repo: 'a/b',
          number: 1,
          status: 'merged',
        },
        {
          url: 'https://github.com/a/b/pull/2',
          repo: 'a/b',
          number: 2,
          status: 'open',
        },
      ],
    });

    expect(report.generatedAt).toBe('2026-02-18T00:00:00Z');
    expect(report.stars).toEqual({
      baseline: 2,
      current: 7,
      delta: 5,
    });
    expect(report.awesomeListPRs).toEqual({
      merged: 1,
      open: 1,
      closed: 0,
      unknown: 0,
      total: 2,
    });
  });
});
