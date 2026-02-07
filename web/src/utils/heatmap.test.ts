import { describe, it, expect } from 'vitest';
import { computeActivityHeatmap, intensityLevel } from './heatmap';
import type { ActivityData } from '../types/activity';

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-07T12:00:00Z',
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

describe('computeActivityHeatmap', () => {
  const now = new Date('2026-02-07T18:00:00Z');

  it('returns one entry per day for the requested window', () => {
    const result = computeActivityHeatmap(makeData(), 7, now);
    expect(result).toHaveLength(7);
    expect(result[0].date).toBe('2026-02-01');
    expect(result[6].date).toBe('2026-02-07');
  });

  it('defaults to 14 days', () => {
    const result = computeActivityHeatmap(makeData(), undefined, now);
    expect(result).toHaveLength(14);
    expect(result[0].date).toBe('2026-01-25');
    expect(result[13].date).toBe('2026-02-07');
  });

  it('counts commits in the correct day', () => {
    const data = makeData({
      commits: [
        {
          sha: 'abc1234',
          message: 'fix bug',
          author: 'builder',
          date: '2026-02-05T10:00:00Z',
        },
        {
          sha: 'def5678',
          message: 'add feat',
          author: 'worker',
          date: '2026-02-05T14:00:00Z',
        },
      ],
    });
    const result = computeActivityHeatmap(data, 7, now);
    const feb5 = result.find((d) => d.date === '2026-02-05');
    expect(feb5?.count).toBe(2);
    expect(feb5?.breakdown.commits).toBe(2);
  });

  it('counts issues in the correct day', () => {
    const data = makeData({
      issues: [
        {
          number: 1,
          title: 'bug',
          state: 'open',
          labels: [],
          author: 'scout',
          createdAt: '2026-02-06T09:00:00Z',
        },
      ],
    });
    const result = computeActivityHeatmap(data, 7, now);
    const feb6 = result.find((d) => d.date === '2026-02-06');
    expect(feb6?.count).toBe(1);
    expect(feb6?.breakdown.issues).toBe(1);
  });

  it('counts pull requests in the correct day', () => {
    const data = makeData({
      pullRequests: [
        {
          number: 10,
          title: 'pr',
          state: 'open',
          author: 'builder',
          createdAt: '2026-02-03T12:00:00Z',
        },
      ],
    });
    const result = computeActivityHeatmap(data, 7, now);
    const feb3 = result.find((d) => d.date === '2026-02-03');
    expect(feb3?.count).toBe(1);
    expect(feb3?.breakdown.prs).toBe(1);
  });

  it('counts comments in the correct day', () => {
    const data = makeData({
      comments: [
        {
          id: 1,
          issueOrPrNumber: 5,
          type: 'issue',
          author: 'worker',
          body: 'hi',
          createdAt: '2026-02-04T08:00:00Z',
          url: 'https://example.com',
        },
        {
          id: 2,
          issueOrPrNumber: 5,
          type: 'review',
          author: 'scout',
          body: 'lgtm',
          createdAt: '2026-02-04T09:00:00Z',
          url: 'https://example.com',
        },
      ],
    });
    const result = computeActivityHeatmap(data, 7, now);
    const feb4 = result.find((d) => d.date === '2026-02-04');
    expect(feb4?.count).toBe(2);
    expect(feb4?.breakdown.comments).toBe(2);
  });

  it('aggregates mixed activity types in a single day', () => {
    const data = makeData({
      commits: [
        { sha: 'a', message: 'm', author: 'x', date: '2026-02-07T01:00:00Z' },
      ],
      issues: [
        {
          number: 1,
          title: 't',
          state: 'open',
          labels: [],
          author: 'x',
          createdAt: '2026-02-07T02:00:00Z',
        },
      ],
      pullRequests: [
        {
          number: 2,
          title: 'p',
          state: 'open',
          author: 'x',
          createdAt: '2026-02-07T03:00:00Z',
        },
      ],
      comments: [
        {
          id: 3,
          issueOrPrNumber: 1,
          type: 'issue',
          author: 'x',
          body: 'b',
          createdAt: '2026-02-07T04:00:00Z',
          url: '#',
        },
      ],
    });
    const result = computeActivityHeatmap(data, 7, now);
    const feb7 = result.find((d) => d.date === '2026-02-07');
    expect(feb7?.count).toBe(4);
    expect(feb7?.breakdown).toEqual({
      commits: 1,
      issues: 1,
      prs: 1,
      comments: 1,
    });
  });

  it('ignores events outside the window', () => {
    const data = makeData({
      commits: [
        {
          sha: 'old',
          message: 'ancient',
          author: 'x',
          date: '2025-01-01T00:00:00Z',
        },
      ],
    });
    const result = computeActivityHeatmap(data, 7, now);
    const total = result.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(0);
  });

  it('returns all zero counts when data is empty', () => {
    const result = computeActivityHeatmap(makeData(), 3, now);
    expect(result).toHaveLength(3);
    result.forEach((d) => {
      expect(d.count).toBe(0);
      expect(d.breakdown).toEqual({
        commits: 0,
        issues: 0,
        prs: 0,
        comments: 0,
      });
    });
  });

  it('returns days in oldest-first order', () => {
    const result = computeActivityHeatmap(makeData(), 5, now);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date > result[i - 1].date).toBe(true);
    }
  });
});

describe('intensityLevel', () => {
  it('returns 0 for zero count', () => {
    expect(intensityLevel(0, 10)).toBe(0);
  });

  it('returns 0 when max is zero', () => {
    expect(intensityLevel(5, 0)).toBe(0);
  });

  it('returns 1 for low activity', () => {
    expect(intensityLevel(1, 10)).toBe(1);
    expect(intensityLevel(2, 10)).toBe(1);
  });

  it('returns 2 for medium-low activity', () => {
    expect(intensityLevel(3, 10)).toBe(2);
    expect(intensityLevel(5, 10)).toBe(2);
  });

  it('returns 3 for medium-high activity', () => {
    expect(intensityLevel(6, 10)).toBe(3);
    expect(intensityLevel(7, 10)).toBe(3);
  });

  it('returns 4 for high activity', () => {
    expect(intensityLevel(8, 10)).toBe(4);
    expect(intensityLevel(10, 10)).toBe(4);
  });
});
