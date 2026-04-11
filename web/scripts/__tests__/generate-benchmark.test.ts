import { describe, it, expect } from 'vitest';
import type { ActivityData } from '../../shared/types';
import {
  percentile,
  computeGini,
  computeRepoMetrics,
  computeColonyMetrics,
  buildBenchmarkArtifact,
  resolveCohortRepos,
  resolveWindowDays,
} from '../generate-benchmark';

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

interface RawPR {
  number: number;
  state: string;
  draft: boolean;
  user: { login: string };
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

function makeGitHubPR(overrides: Partial<RawPR> = {}): RawPR {
  return {
    number: 1,
    state: 'closed',
    draft: false,
    user: { login: 'alice' },
    created_at: '2026-01-01T00:00:00Z',
    closed_at: '2026-01-03T00:00:00Z',
    merged_at: '2026-01-03T00:00:00Z', // 48h cycle
    ...overrides,
  };
}

const BASE_REPO_INFO = {
  owner: 'hivemoot',
  name: 'colony',
  url: '',
  stars: 0,
  forks: 0,
  openIssues: 0,
} as const;

function makeColonyData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-01T00:00:00Z',
    repository: BASE_REPO_INFO,
    pullRequests: [],
    proposals: [],
    comments: [],
    commits: [],
    issues: [],
    agents: [],
    agentStats: [],
    ...overrides,
  } as ActivityData;
}

// ──────────────────────────────────────────────
// percentile
// ──────────────────────────────────────────────

describe('percentile', () => {
  it('returns null when sample is below minSample', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeNull(); // default minSample = 5
  });

  it('returns median for odd-length array', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('returns p50 correctly for even-length array', () => {
    expect(percentile([1, 2, 3, 4, 5, 6], 50)).toBe(3);
  });

  it('returns p95 for a 20-element array', () => {
    const sorted = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(sorted, 95)).toBe(19);
  });

  it('accepts custom minSample', () => {
    expect(percentile([10, 20, 30], 50, 3)).toBe(20);
    expect(percentile([10, 20], 50, 3)).toBeNull();
  });
});

// ──────────────────────────────────────────────
// computeGini
// ──────────────────────────────────────────────

describe('computeGini', () => {
  it('returns 0 for a single value', () => {
    expect(computeGini([5])).toBe(0);
  });

  it('returns 0 for perfectly equal distribution', () => {
    expect(computeGini([3, 3, 3])).toBe(0);
  });

  it('returns 1 for maximum concentration (all mass in one)', () => {
    // With [0, 0, 6]: Gini approaches 1 as n grows; for n=3 it equals 2/3
    expect(computeGini([0, 0, 6])).toBeCloseTo(2 / 3, 5);
  });

  it('returns 0 for all-zero array', () => {
    expect(computeGini([0, 0, 0])).toBe(0);
  });

  it('returns a value between 0 and 1 for mixed distribution', () => {
    const g = computeGini([1, 3, 6, 10]);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
});

// ──────────────────────────────────────────────
// computeRepoMetrics
// ──────────────────────────────────────────────

describe('computeRepoMetrics', () => {
  const windowStart = new Date('2026-01-01T00:00:00Z');
  const currentEnd = new Date('2026-04-01T00:00:00Z'); // 90 days

  it('returns zero metrics for empty PR list', () => {
    const m = computeRepoMetrics([], 'test/repo', windowStart, currentEnd);
    expect(m.repository).toBe('test/repo');
    expect(m.mergedPrCount).toBe(0);
    expect(m.prCycleTimeP50Hours).toBeNull();
    expect(m.mergedPrsPerWeek).toBe(0);
    expect(m.giniCoefficient).toBe(0);
    expect(m.uniqueContributorCount).toBe(0);
    expect(m.openAtWindowEnd).toBe(0);
  });

  it('counts merged PRs within window only', () => {
    const prs = [
      makeGitHubPR({
        merged_at: '2026-01-15T00:00:00Z',
        created_at: '2026-01-10T00:00:00Z',
      }),
      makeGitHubPR({
        number: 2,
        merged_at: '2025-12-15T00:00:00Z', // before window
        created_at: '2025-12-10T00:00:00Z',
      }),
      makeGitHubPR({
        number: 3,
        merged_at: '2026-04-10T00:00:00Z', // after window
        created_at: '2026-04-05T00:00:00Z',
      }),
    ];
    const m = computeRepoMetrics(prs, 'test/repo', windowStart, currentEnd);
    expect(m.mergedPrCount).toBe(1);
  });

  it('computes cycle time from PRs opened before window start', () => {
    // PR created before window start but merged inside — should be included in
    // mergedPrs and contribute to cycle time
    const prs = [
      makeGitHubPR({
        created_at: '2025-12-01T00:00:00Z', // 31 days before window
        merged_at: '2026-01-15T00:00:00Z', // within window
      }),
    ];
    const m = computeRepoMetrics(prs, 'test/repo', windowStart, currentEnd);
    expect(m.mergedPrCount).toBe(1);
    // cycle = (Jan 15 - Dec 01) = 45 days = 1080 hours; too few for p50 (need 5)
    expect(m.prCycleTimeP50Hours).toBeNull();
  });

  it('computes p50 cycle time when 5+ merged PRs exist', () => {
    const prs = [24, 48, 72, 96, 120].map((hours, i) => {
      const created = new Date('2026-01-01T00:00:00Z');
      const merged = new Date(created.getTime() + hours * 3600000);
      return makeGitHubPR({
        number: i + 1,
        created_at: created.toISOString(),
        merged_at: merged.toISOString(),
      });
    });
    const m = computeRepoMetrics(prs, 'test/repo', windowStart, currentEnd);
    expect(m.prCycleTimeP50Hours).toBe(72); // median of [24,48,72,96,120]
  });

  it('counts open PRs at window end using currentEnd as anchor', () => {
    const prs = [
      // open PR created before currentEnd → counted
      makeGitHubPR({
        number: 10,
        state: 'open',
        merged_at: null,
        closed_at: null,
        created_at: '2026-03-01T00:00:00Z',
      }),
      // open PR created after currentEnd → not counted
      makeGitHubPR({
        number: 11,
        state: 'open',
        merged_at: null,
        closed_at: null,
        created_at: '2026-04-05T00:00:00Z',
      }),
    ];
    const m = computeRepoMetrics(prs, 'test/repo', windowStart, currentEnd);
    expect(m.openAtWindowEnd).toBe(1);
  });

  it('computes Gini correctly for unequal merge distribution', () => {
    const prs = [
      makeGitHubPR({
        number: 1,
        user: { login: 'alice' },
        merged_at: '2026-02-01T00:00:00Z',
        created_at: '2026-01-30T00:00:00Z',
      }),
      makeGitHubPR({
        number: 2,
        user: { login: 'alice' },
        merged_at: '2026-02-02T00:00:00Z',
        created_at: '2026-01-31T00:00:00Z',
      }),
      makeGitHubPR({
        number: 3,
        user: { login: 'bob' },
        merged_at: '2026-02-03T00:00:00Z',
        created_at: '2026-02-01T00:00:00Z',
      }),
    ];
    const m = computeRepoMetrics(prs, 'test/repo', windowStart, currentEnd);
    expect(m.uniqueContributorCount).toBe(2);
    // alice has 2, bob has 1 → some inequality
    expect(m.giniCoefficient).toBeGreaterThan(0);
    expect(m.giniCoefficient).toBeLessThan(1);
  });
});

// ──────────────────────────────────────────────
// computeColonyMetrics
// ──────────────────────────────────────────────

describe('computeColonyMetrics', () => {
  const windowStart = new Date('2026-01-01T00:00:00Z');
  const currentEnd = new Date('2026-04-01T00:00:00Z');

  it('uses repository from data.repository', () => {
    const data = makeColonyData({
      repository: { ...BASE_REPO_INFO, owner: 'myorg', name: 'myrepo' },
    });
    const m = computeColonyMetrics(data, windowStart, currentEnd);
    expect(m.repository).toBe('myorg/myrepo');
  });

  it('counts open PRs at window end using currentEnd, not latest createdAt', () => {
    // This tests the stale-currentEnd bug: if we accidentally used the latest
    // PR's createdAt as the anchor instead of the generation time, a PR opened
    // after the latest PR but before currentEnd would be missed.
    const data = makeColonyData({
      pullRequests: [
        {
          number: 1,
          title: 'merged',
          state: 'merged',
          author: 'hivemoot-builder',
          createdAt: '2026-02-01T00:00:00Z',
          mergedAt: '2026-02-02T00:00:00Z',
        },
        {
          // Open PR created after the merged PR's createdAt — should still
          // be counted when currentEnd is used as the anchor
          number: 2,
          title: 'open after latest PR',
          state: 'open',
          author: 'hivemoot-nurse',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ],
    });
    const m = computeColonyMetrics(data, windowStart, currentEnd);
    expect(m.openAtWindowEnd).toBe(1);
  });

  it('excludes merged PRs outside the window', () => {
    const data = makeColonyData({
      pullRequests: [
        {
          number: 1,
          title: 'old merged PR',
          state: 'merged',
          author: 'hivemoot-builder',
          createdAt: '2025-11-01T00:00:00Z',
          mergedAt: '2025-11-15T00:00:00Z', // before window
        },
      ],
    });
    const m = computeColonyMetrics(data, windowStart, currentEnd);
    expect(m.mergedPrCount).toBe(0);
  });
});

// ──────────────────────────────────────────────
// resolveCohortRepos
// ──────────────────────────────────────────────

describe('resolveCohortRepos', () => {
  it('returns default cohort when env var is unset', () => {
    const repos = resolveCohortRepos({});
    expect(repos.length).toBeGreaterThan(0);
    for (const r of repos) {
      expect(r).toMatch(/^[^/]+\/[^/]+$/);
    }
  });

  it('parses comma-separated repos from env', () => {
    const repos = resolveCohortRepos({
      BENCHMARK_REPOSITORIES: 'facebook/react,vercel/next.js',
    });
    expect(repos).toEqual(['facebook/react', 'vercel/next.js']);
  });

  it('filters invalid entries', () => {
    const repos = resolveCohortRepos({
      BENCHMARK_REPOSITORIES: 'facebook/react,not-a-repo,vercel/next.js',
    });
    expect(repos).toEqual(['facebook/react', 'vercel/next.js']);
  });

  it('returns default cohort when all entries are invalid', () => {
    const repos = resolveCohortRepos({
      BENCHMARK_REPOSITORIES: 'invalid,also-invalid',
    });
    expect(repos.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// resolveWindowDays
// ──────────────────────────────────────────────

describe('resolveWindowDays', () => {
  it('defaults to 90 when unset', () => {
    expect(resolveWindowDays({})).toBe(90);
  });

  it('parses numeric env var', () => {
    expect(resolveWindowDays({ BENCHMARK_WINDOW_DAYS: '60' })).toBe(60);
  });

  it('falls back to 90 for invalid values', () => {
    expect(resolveWindowDays({ BENCHMARK_WINDOW_DAYS: 'abc' })).toBe(90);
    expect(resolveWindowDays({ BENCHMARK_WINDOW_DAYS: '-10' })).toBe(90);
    expect(resolveWindowDays({ BENCHMARK_WINDOW_DAYS: '0' })).toBe(90);
  });
});

// ──────────────────────────────────────────────
// buildBenchmarkArtifact (unit — no network)
// ──────────────────────────────────────────────

describe('buildBenchmarkArtifact', () => {
  it('produces a valid artifact with empty cohort', async () => {
    const data = makeColonyData();
    const generatedAt = '2026-04-01T00:00:00Z';
    const artifact = await buildBenchmarkArtifact(data, [], 90, generatedAt);

    expect(artifact.generatedAt).toBe(generatedAt);
    expect(artifact.windowDays).toBe(90);
    expect(artifact.colony.repository).toBe('hivemoot/colony');
    expect(artifact.cohort).toEqual([]);
    expect(artifact.methodology).toBe('docs/BENCHMARK-METHODOLOGY.md');
    expect(artifact.limitations.length).toBeGreaterThan(0);
  });

  it('uses generatedAt as the currentEnd anchor', async () => {
    // If the bug existed, openAtWindowEnd would use the latest PR's createdAt
    // instead of generatedAt — causing recently-opened PRs to be missed.
    const generatedAt = '2026-04-01T00:00:00Z';
    const data = makeColonyData({
      pullRequests: [
        {
          number: 1,
          title: 'open PR',
          state: 'open',
          author: 'hivemoot-builder',
          // Created 10 days before generatedAt — should be in openAtWindowEnd
          createdAt: '2026-03-22T00:00:00Z',
        },
      ],
    });
    const artifact = await buildBenchmarkArtifact(data, [], 90, generatedAt);
    expect(artifact.colony.openAtWindowEnd).toBe(1);
  });
});
