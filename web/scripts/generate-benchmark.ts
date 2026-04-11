/**
 * Benchmark artifact generator — CLI script.
 *
 * Compares Colony PR velocity metrics against an external OSS cohort using
 * public GitHub API data. Outputs public/data/benchmark.json.
 *
 * Usage:
 *   npm run generate-benchmark
 *   BENCHMARK_REPOSITORIES=vitejs/vite,prettier/prettier,sindresorhus/got \
 *     npm run generate-benchmark
 *
 * Environment variables:
 *   BENCHMARK_REPOSITORIES  Comma-separated "owner/repo" list of comparison
 *                           repos. Defaults to DEFAULT_COHORT below.
 *   BENCHMARK_WINDOW_DAYS   Rolling window in days (default: 90).
 *   ACTIVITY_FILE           Path to Colony's activity.json. Defaults to the
 *                           generated artifact in public/data/activity.json.
 *   GITHUB_TOKEN / GH_TOKEN GitHub personal access token for higher API
 *                           rate limits. Unauthenticated requests are limited
 *                           to 60/hour; authenticated to 5 000/hour.
 *
 * Methodology: docs/BENCHMARK-METHODOLOGY.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActivityData, PullRequest } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTIVITY_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'activity.json'
);
const BENCHMARK_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'benchmark.json'
);

const GITHUB_API = 'https://api.github.com';

/**
 * Default external comparison cohort.
 *
 * Selected criteria (see docs/BENCHMARK-METHODOLOGY.md):
 * - Active in a comparable time window
 * - 5–20 regular contributors
 * - Merge primarily through PRs (not direct commits)
 * - Publicly accessible GitHub repository
 */
const DEFAULT_COHORT = ['vitejs/vite', 'prettier/prettier', 'sindresorhus/got'];

/**
 * Extra days added to the window look-back when paging GitHub PR results.
 *
 * A PR opened *before* the window start may be merged *within* the window.
 * Fetching `WINDOW_DAYS + PAGING_LOOKBACK_BUFFER_DAYS` worth of PR history
 * ensures those long-lived PRs are captured in `mergedPrs` and in the cycle
 * time computation. Without this buffer, the endpoint's recency ordering
 * silently drops PRs whose `createdAt` falls before the look-back cutoff.
 */
const PAGING_LOOKBACK_BUFFER_DAYS = 90;

// ──────────────────────────────────────────────
// GitHub API helpers
// ──────────────────────────────────────────────

interface GitHubPR {
  number: number;
  state: string;
  draft: boolean;
  user: { login: string };
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

async function fetchJson<T>(endpoint: string): Promise<T> {
  const url = `${GITHUB_API}${endpoint}`;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'colony-benchmark-generator',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText} for ${endpoint}`
    );
  }
  return response.json() as Promise<T>;
}

/**
 * Fetch the most recent `pages` pages of closed+open PRs for a repo.
 * Uses two pages of closed PRs (100 each) plus the first page of open PRs to
 * get a representative sample of recent activity.
 */
async function fetchRepoPRs(
  owner: string,
  repo: string,
  pages: number = 2
): Promise<GitHubPR[]> {
  const closedPages = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetchJson<GitHubPR[]>(
        `/repos/${owner}/${repo}/pulls?state=closed&per_page=100&page=${i + 1}`
      )
    )
  );

  const openPRs = await fetchJson<GitHubPR[]>(
    `/repos/${owner}/${repo}/pulls?state=open&per_page=100&page=1`
  );

  return [...openPRs, ...closedPages.flat()];
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface RepoMetrics {
  /** "owner/repo" */
  repository: string;
  /** Median PR cycle time in hours (open → merge), or null if < 5 samples */
  prCycleTimeP50Hours: number | null;
  /** PRs merged per week within the measurement window */
  mergedPrsPerWeek: number;
  /** Gini coefficient of per-contributor PR merge counts (0=equal, 1=concentrated) */
  giniCoefficient: number;
  /** Number of merged PRs used for cycle time computation */
  mergedPrCount: number;
  /** Unique contributors who merged at least one PR in the window */
  uniqueContributorCount: number;
  /** PRs that were open at the end of the measurement window */
  openAtWindowEnd: number;
}

export interface BenchmarkArtifact {
  /** ISO timestamp of when this artifact was generated */
  generatedAt: string;
  /** Rolling window used for all metrics */
  windowDays: number;
  /** Colony's own metrics for the same window */
  colony: RepoMetrics;
  /** External comparison repos */
  cohort: RepoMetrics[];
  /** Pointer to the human-readable methodology doc */
  methodology: string;
  /** Explicit limitations that consumers must understand */
  limitations: string[];
}

// ──────────────────────────────────────────────
// Metric computation (pure functions, exportable for testing)
// ──────────────────────────────────────────────

/**
 * Compute the p-th percentile of a pre-sorted ascending array.
 * Returns null for arrays shorter than MIN_SAMPLE.
 */
export function percentile(
  sorted: number[],
  p: number,
  minSample: number = 5
): number | null {
  if (sorted.length < minSample) return null;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Compute the Gini coefficient of an array of non-negative values.
 * Returns 0 for arrays of length ≤ 1 or all-zero arrays.
 */
export function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let sumOfDiffs = 0;
  for (let i = 0; i < n; i++) {
    sumOfDiffs += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return sumOfDiffs / (n * total);
}

/**
 * Derive RepoMetrics from a flat list of GitHub PR objects.
 *
 * @param prs        Raw PR list for the repo (open + closed pages)
 * @param repository "owner/repo" identifier
 * @param windowStart Window start (inclusive) — PRs merged before this are excluded
 * @param currentEnd  Anchor for "open at window end" — should be the generation
 *                    timestamp so recently opened PRs are not silently excluded
 */
export function computeRepoMetrics(
  prs: GitHubPR[],
  repository: string,
  windowStart: Date,
  currentEnd: Date
): RepoMetrics {
  const windowMs = currentEnd.getTime() - windowStart.getTime();
  const windowWeeks = windowMs / (1000 * 60 * 60 * 24 * 7);

  // PRs merged within the window
  const mergedPrs = prs.filter((pr) => {
    if (!pr.merged_at) return false;
    const mergedAt = new Date(pr.merged_at).getTime();
    return (
      mergedAt >= windowStart.getTime() && mergedAt <= currentEnd.getTime()
    );
  });

  // Cycle time: open → merge, in hours
  // merged_at is guaranteed non-null here because mergedPrs filtered for it above
  const cycleTimes = mergedPrs
    .map((pr) => {
      const openMs = new Date(pr.created_at).getTime();
      const mergeMs = new Date(pr.merged_at ?? '').getTime();
      return (mergeMs - openMs) / (1000 * 60 * 60);
    })
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);

  // Per-contributor merge counts for Gini coefficient
  const mergesByContributor = new Map<string, number>();
  for (const pr of mergedPrs) {
    const login = pr.user.login;
    mergesByContributor.set(login, (mergesByContributor.get(login) ?? 0) + 1);
  }

  // PRs open at the end of the window (non-merged, created before currentEnd)
  const openAtWindowEnd = prs.filter((pr) => {
    if (pr.merged_at !== null) return false;
    if (pr.state !== 'open') return false;
    const createdAt = new Date(pr.created_at).getTime();
    return createdAt <= currentEnd.getTime();
  }).length;

  return {
    repository,
    prCycleTimeP50Hours: percentile(cycleTimes, 50),
    mergedPrsPerWeek:
      windowWeeks > 0
        ? parseFloat((mergedPrs.length / windowWeeks).toFixed(2))
        : 0,
    giniCoefficient: parseFloat(
      computeGini([...mergesByContributor.values()]).toFixed(3)
    ),
    mergedPrCount: mergedPrs.length,
    uniqueContributorCount: mergesByContributor.size,
    openAtWindowEnd,
  };
}

/**
 * Derive RepoMetrics from Colony's own ActivityData.
 * Colony uses a richer data model; this maps it to the same shape as external
 * repos to ensure a fair apples-to-apples comparison.
 */
export function computeColonyMetrics(
  data: ActivityData,
  windowStart: Date,
  currentEnd: Date
): RepoMetrics {
  const windowMs = currentEnd.getTime() - windowStart.getTime();
  const windowWeeks = windowMs / (1000 * 60 * 60 * 24 * 7);

  const mergedPrs: PullRequest[] = data.pullRequests.filter((pr) => {
    if (pr.state !== 'merged' || !pr.mergedAt) return false;
    const mergedAt = new Date(pr.mergedAt).getTime();
    return (
      mergedAt >= windowStart.getTime() && mergedAt <= currentEnd.getTime()
    );
  });

  const cycleTimes = mergedPrs
    .map((pr) => {
      const openMs = new Date(pr.createdAt).getTime();
      // mergedAt is guaranteed non-null because mergedPrs filtered for it above
      const mergeMs = new Date(pr.mergedAt ?? '').getTime();
      return (mergeMs - openMs) / (1000 * 60 * 60);
    })
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);

  const mergesByContributor = new Map<string, number>();
  for (const pr of mergedPrs) {
    mergesByContributor.set(
      pr.author,
      (mergesByContributor.get(pr.author) ?? 0) + 1
    );
  }

  const openAtWindowEnd = data.pullRequests.filter((pr) => {
    if (pr.state !== 'open') return false;
    const createdAt = new Date(pr.createdAt).getTime();
    return createdAt <= currentEnd.getTime();
  }).length;

  const colonyRepo = data.repository
    ? `${data.repository.owner}/${data.repository.name}`
    : 'hivemoot/colony';

  return {
    repository: colonyRepo,
    prCycleTimeP50Hours: percentile(cycleTimes, 50),
    mergedPrsPerWeek:
      windowWeeks > 0
        ? parseFloat((mergedPrs.length / windowWeeks).toFixed(2))
        : 0,
    giniCoefficient: parseFloat(
      computeGini([...mergesByContributor.values()]).toFixed(3)
    ),
    mergedPrCount: mergedPrs.length,
    uniqueContributorCount: mergesByContributor.size,
    openAtWindowEnd,
  };
}

// ──────────────────────────────────────────────
// Artifact assembly
// ──────────────────────────────────────────────

export async function buildBenchmarkArtifact(
  colonyData: ActivityData,
  cohortRepos: string[],
  windowDays: number,
  generatedAt: string
): Promise<BenchmarkArtifact> {
  const currentEnd = new Date(generatedAt);
  const windowStart = new Date(
    currentEnd.getTime() - windowDays * 24 * 60 * 60 * 1000
  );
  const fetchStart = new Date(
    currentEnd.getTime() -
      (windowDays + PAGING_LOOKBACK_BUFFER_DAYS) * 24 * 60 * 60 * 1000
  );

  // Colony metrics derived from local activity.json
  const colony = computeColonyMetrics(colonyData, windowStart, currentEnd);

  // External cohort — fetched from GitHub API
  const cohort: RepoMetrics[] = [];
  for (const repoSlug of cohortRepos) {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) {
      console.warn(`  Skipping invalid repo slug: ${repoSlug}`);
      continue;
    }

    console.log(`  Fetching ${repoSlug}...`);
    try {
      const prs = await fetchRepoPRs(owner, repo);

      // Filter to PRs created on or after the extended fetch start date
      const recentPrs = prs.filter(
        (pr) => new Date(pr.created_at).getTime() >= fetchStart.getTime()
      );

      cohort.push(
        computeRepoMetrics(recentPrs, repoSlug, windowStart, currentEnd)
      );
    } catch (err) {
      console.warn(
        `  Warning: failed to fetch ${repoSlug}: ${String(err)}. Skipping.`
      );
    }
  }

  return {
    generatedAt,
    windowDays,
    colony,
    cohort,
    methodology: 'docs/BENCHMARK-METHODOLOGY.md',
    limitations: [
      'Colony uses autonomous agents with no human review latency, no timezone coordination overhead, and no meeting/async-communication delays. PR cycle times are structurally lower for Colony than for human-staffed projects.',
      'External cohort repos were selected for comparable size (PR volume, contributor count) within the measurement window, not for governance model similarity. The comparison is directionally useful, not causally conclusive.',
      'GitHub API results use recency-ordered pagination (100 PRs/page, 2 pages for closed PRs). Long-running repos with high PR volume may have activity outside this window that affects baseline metrics.',
      'Gini coefficient measures merge concentration among contributors. Colony agents each have a designated role; contributor "concentration" has a different meaning than in community open-source projects.',
    ],
  };
}

// ──────────────────────────────────────────────
// CLI entry point
// ──────────────────────────────────────────────

function parseOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const parts = slug.trim().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function resolveCohortRepos(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const raw = env.BENCHMARK_REPOSITORIES;
  if (!raw) return DEFAULT_COHORT;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = parsed.filter((s) => parseOwnerRepo(s) !== null);
  if (valid.length === 0) {
    console.warn(
      'BENCHMARK_REPOSITORIES contained no valid "owner/repo" entries. Using default cohort.'
    );
    return DEFAULT_COHORT;
  }
  return valid;
}

export function resolveWindowDays(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = Number(env.BENCHMARK_WINDOW_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
}

function resolveActivityFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.ACTIVITY_FILE ?? DEFAULT_ACTIVITY_FILE;
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

async function main(): Promise<void> {
  const activityFile = resolveActivityFile();

  if (!existsSync(activityFile)) {
    console.error(`Activity file not found: ${activityFile}`);
    console.error(
      'Run `npm run generate-data` first, or set ACTIVITY_FILE env var.'
    );
    process.exit(1);
  }

  const colonyData = JSON.parse(
    readFileSync(activityFile, 'utf-8')
  ) as ActivityData;

  const cohortRepos = resolveCohortRepos();
  const windowDays = resolveWindowDays();
  const generatedAt = new Date().toISOString();

  console.log(`Generating benchmark artifact`);
  console.log(`  Window:  ${windowDays} days`);
  console.log(`  Cohort:  ${cohortRepos.join(', ')}`);
  console.log(`  Colony data: ${activityFile}`);
  console.log('');

  const artifact = await buildBenchmarkArtifact(
    colonyData,
    cohortRepos,
    windowDays,
    generatedAt
  );

  mkdirSync(dirname(BENCHMARK_FILE), { recursive: true });
  writeFileSync(BENCHMARK_FILE, JSON.stringify(artifact, null, 2), 'utf-8');

  console.log('');
  console.log(`Benchmark artifact written to: ${BENCHMARK_FILE}`);
  console.log(`  Colony:  ${artifact.colony.mergedPrCount} merged PRs`);
  console.log(`  Cohort:  ${artifact.cohort.length} repos`);
  for (const repo of artifact.cohort) {
    console.log(
      `    ${repo.repository}: ${repo.mergedPrCount} merged PRs, ` +
        `p50 cycle ${repo.prCycleTimeP50Hours !== null ? `${repo.prCycleTimeP50Hours.toFixed(1)}h` : 'N/A'}`
    );
  }
}

if (isDirectExecution()) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
