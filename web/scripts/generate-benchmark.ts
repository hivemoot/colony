/**
 * Benchmark artifact generator — CLI script.
 *
 * Produces `web/public/data/benchmark.json` comparing Colony pull-request
 * metrics against a configurable external OSS cohort and a self-comparison
 * baseline for Colony's own first 30 days.
 *
 * Usage:
 *   npm run generate-benchmark
 *   npm run generate-benchmark -- --json
 *   npm run generate-benchmark -- --repos=chaoss/grimoirelab,sigstore/cosign
 *   BENCHMARK_REPOSITORIES=chaoss/grimoirelab,sigstore/cosign npm run generate-benchmark
 *
 * See docs/BENCHMARK-METHODOLOGY.md for windowing, metrics, and limitations.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActivityData } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTIVITY_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'activity.json'
);
const DEFAULT_OUTPUT_PATH = join(
  __dirname,
  '..',
  'public',
  'data',
  'benchmark.json'
);
const DEFAULT_WINDOW_DAYS = 90;
const SELF_COMPARISON_DAYS = 30;
const STALE_OPEN_PR_DAYS = 7;
const DEFAULT_COHORT = [
  'chaoss/grimoirelab',
  'chaoss/augur',
  'sigstore/cosign',
];

/**
 * How many extra days to look back beyond `windowStart` when fetching
 * historical pull requests from the GitHub API.
 *
 * The GitHub API sorts PRs by `created_at` descending. We stop paging when
 * the oldest PR on a page was created before `windowStart`. However,
 * `mergedWithinWindow` is keyed to `mergedAt` — a PR created before
 * `windowStart` can still be merged inside the window. Without this buffer,
 * those PRs would be silently omitted from `mergedPrs` and
 * `prCycleTimeP50Hours`, biasing both metrics downward on repos with
 * long-lived PRs.
 *
 * 90 days is conservative: it costs at most ~1–2 extra API pages on active
 * repos and guarantees correctness for any PR that takes up to 90 days to
 * merge after creation.
 */
const PAGING_LOOKBACK_BUFFER_DAYS = 90;

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ComparablePullRequest {
  number: number;
  author: string;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  state: 'open' | 'closed' | 'merged';
}

export interface BenchmarkMetrics {
  openedPrs: number;
  mergedPrs: number;
  openPrs: number;
  staleOpenPrs: number;
  activeContributors: number;
  /** Median PR creation-to-merge duration in hours, or null if no data. */
  prCycleTimeP50Hours: number | null;
  /** Share of window-opened PRs that are merged by window end, or null. */
  mergeRate: number | null;
  /** Share of open-at-window-end PRs older than STALE_OPEN_PR_DAYS, or null. */
  staleOpenPrShare: number | null;
}

export interface RepoBenchmark {
  repository: string;
  source: 'activity-json' | 'github-api';
  window: {
    start: string;
    end: string;
    days: number;
  };
  metrics: BenchmarkMetrics;
}

export interface BenchmarkArtifact {
  generatedAt: string;
  methodologyPath: string;
  staleOpenThresholdDays: number;
  colony: RepoBenchmark;
  selfComparison: {
    baselineLabel: string;
    current: RepoBenchmark;
    baseline: RepoBenchmark;
  };
  cohort: RepoBenchmark[];
  notes: string[];
}

interface CliOptions {
  repositories: string[];
  activityPath: string;
  outputPath: string;
  windowDays: number;
  json: boolean;
}

interface GitHubPullRequestApiResponse {
  number: number;
  state: string;
  user: { login: string } | null;
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
}

// ──────────────────────────────────────────────
// CLI argument parsing
// ──────────────────────────────────────────────

export function parseRepositoryList(raw: string): string[] {
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter((r) => /^[^/]+\/[^/]+$/.test(r));
}

export function parseArgs(argv: string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
generate-benchmark — produce benchmark.json comparing Colony against an external OSS cohort.

Usage:
  npm run generate-benchmark [-- options]

Options:
  --repos=owner/name,...     External repositories to include (default: ${DEFAULT_COHORT.join(', ')})
  --window-days=N            Benchmark window in days (default: ${DEFAULT_WINDOW_DAYS})
  --out=<path>               Output path (default: public/data/benchmark.json)
  --json                     Write JSON to stdout instead of file
  --help, -h                 Show this help message

Environment variables:
  ACTIVITY_FILE              Path to activity.json (default: public/data/activity.json)
  BENCHMARK_REPOSITORIES     Comma-separated repository list (overridden by --repos)
  GITHUB_TOKEN / GH_TOKEN    GitHub API token for higher rate limits
`);
    process.exit(0);
  }

  const get = (prefix: string): string | undefined =>
    argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);

  const rawRepos =
    get('--repos=') ??
    process.env.BENCHMARK_REPOSITORIES ??
    DEFAULT_COHORT.join(',');

  const windowDaysRaw = get('--window-days=');
  const windowDays = windowDaysRaw
    ? parseInt(windowDaysRaw, 10)
    : DEFAULT_WINDOW_DAYS;

  if (
    windowDaysRaw !== undefined &&
    (!Number.isInteger(windowDays) || windowDays <= 0)
  ) {
    console.error(
      `generate-benchmark: --window-days must be a positive integer, got: ${windowDaysRaw}`
    );
    process.exit(1);
  }

  return {
    repositories: parseRepositoryList(rawRepos),
    activityPath: process.env.ACTIVITY_FILE ?? DEFAULT_ACTIVITY_FILE,
    outputPath: get('--out=') ?? DEFAULT_OUTPUT_PATH,
    windowDays,
    json: argv.includes('--json'),
  };
}

// ──────────────────────────────────────────────
// Data loading
// ──────────────────────────────────────────────

function readActivityData(path: string): ActivityData {
  if (!existsSync(path)) {
    throw new Error(`activity.json not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ActivityData;
}

// ──────────────────────────────────────────────
// Colony PR normalization
// ──────────────────────────────────────────────

export function normalizeColonyPullRequests(
  data: ActivityData
): ComparablePullRequest[] {
  return data.pullRequests.map((pr) => ({
    number: pr.number,
    author: pr.author,
    createdAt: pr.createdAt,
    closedAt: pr.closedAt ?? null,
    mergedAt: pr.mergedAt ?? null,
    state: pr.state,
  }));
}

// ──────────────────────────────────────────────
// Metric computation
// ──────────────────────────────────────────────

export function computeBenchmarkMetrics(
  pullRequests: ComparablePullRequest[],
  windowEnd: Date,
  windowDays: number
): BenchmarkMetrics {
  const endMs = windowEnd.getTime();
  const startMs = endMs - windowDays * 24 * 60 * 60 * 1000;
  const staleCutoffMs = endMs - STALE_OPEN_PR_DAYS * 24 * 60 * 60 * 1000;

  const openedWithinWindow = pullRequests.filter((pr) => {
    const createdMs = new Date(pr.createdAt).getTime();
    return (
      Number.isFinite(createdMs) && createdMs >= startMs && createdMs <= endMs
    );
  });

  const mergedWithinWindow = pullRequests.filter((pr) => {
    if (!pr.mergedAt) {
      return false;
    }
    const mergedMs = new Date(pr.mergedAt).getTime();
    return (
      Number.isFinite(mergedMs) && mergedMs >= startMs && mergedMs <= endMs
    );
  });

  const openAtWindowEnd = pullRequests.filter((pr) => {
    const createdMs = new Date(pr.createdAt).getTime();
    if (!Number.isFinite(createdMs) || createdMs > endMs) {
      return false;
    }

    const terminalAt = pr.mergedAt ?? pr.closedAt ?? null;
    if (!terminalAt) {
      return true;
    }

    const terminalMs = new Date(terminalAt).getTime();
    return !Number.isFinite(terminalMs) || terminalMs > endMs;
  });

  const staleOpenAtWindowEnd = openAtWindowEnd.filter((pr) => {
    const createdMs = new Date(pr.createdAt).getTime();
    return Number.isFinite(createdMs) && createdMs <= staleCutoffMs;
  });

  const cycleTimeHours = mergedWithinWindow
    .map((pr) => diffHours(pr.createdAt, pr.mergedAt ?? null))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const activeContributors = new Set(
    openedWithinWindow.map((pr) => pr.author).filter(Boolean)
  );

  return {
    openedPrs: openedWithinWindow.length,
    mergedPrs: mergedWithinWindow.length,
    openPrs: openAtWindowEnd.length,
    staleOpenPrs: staleOpenAtWindowEnd.length,
    activeContributors: activeContributors.size,
    prCycleTimeP50Hours: percentile(cycleTimeHours, 50),
    mergeRate:
      openedWithinWindow.length > 0
        ? openedWithinWindow.filter(
            (pr) => pr.mergedAt && new Date(pr.mergedAt).getTime() <= endMs
          ).length / openedWithinWindow.length
        : null,
    staleOpenPrShare:
      openAtWindowEnd.length > 0
        ? staleOpenAtWindowEnd.length / openAtWindowEnd.length
        : null,
  };
}

export function buildRepoBenchmark(
  repository: string,
  source: RepoBenchmark['source'],
  pullRequests: ComparablePullRequest[],
  windowEnd: Date,
  windowDays: number
): RepoBenchmark {
  const windowStart = new Date(
    windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000
  );
  return {
    repository,
    source,
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      days: windowDays,
    },
    metrics: computeBenchmarkMetrics(pullRequests, windowEnd, windowDays),
  };
}

/**
 * Build the self-comparison block comparing Colony's current 30-day window
 * against its first 30-day baseline.
 *
 * @param generatedAt  The artifact generation timestamp from `activity.json`.
 *   This is the authoritative "now" for the current window end. Using the
 *   latest PR's `createdAt` instead would produce a stale window end on repos
 *   that went quiet before data generation.
 */
export function buildSelfComparison(
  repository: string,
  pullRequests: ComparablePullRequest[],
  generatedAt: Date
): BenchmarkArtifact['selfComparison'] {
  const currentPullRequests = pullRequests.filter((pr) =>
    isValidDate(pr.createdAt)
  );
  const sortedByCreatedAt = [...currentPullRequests].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const baselineStart = sortedByCreatedAt[0]
    ? new Date(sortedByCreatedAt[0].createdAt)
    : new Date();
  const baselineEnd = new Date(
    baselineStart.getTime() + SELF_COMPARISON_DAYS * 24 * 60 * 60 * 1000
  );

  // Use `generatedAt` as the current window end — not the latest PR's
  // `createdAt`. On a repo that goes quiet for several days before the data
  // run, the latest PR timestamp is stale and `openAtWindowEnd` would silently
  // exclude recently opened PRs from its denominator.
  const currentEnd = generatedAt;

  return {
    baselineLabel: `first-${SELF_COMPARISON_DAYS}-days`,
    current: buildRepoBenchmark(
      repository,
      'activity-json',
      currentPullRequests,
      currentEnd,
      SELF_COMPARISON_DAYS
    ),
    baseline: buildRepoBenchmark(
      repository,
      'activity-json',
      currentPullRequests,
      baselineEnd,
      SELF_COMPARISON_DAYS
    ),
  };
}

export function buildBenchmarkArtifact(
  data: ActivityData,
  cohort: RepoBenchmark[],
  windowDays: number
): BenchmarkArtifact {
  const colonyRepository = `${data.repository.owner}/${data.repository.name}`;
  const colonyPullRequests = normalizeColonyPullRequests(data);
  const generatedAt = new Date(data.generatedAt);

  return {
    generatedAt: generatedAt.toISOString(),
    methodologyPath: 'docs/BENCHMARK-METHODOLOGY.md',
    staleOpenThresholdDays: STALE_OPEN_PR_DAYS,
    colony: buildRepoBenchmark(
      colonyRepository,
      'activity-json',
      colonyPullRequests,
      generatedAt,
      windowDays
    ),
    selfComparison: buildSelfComparison(
      colonyRepository,
      colonyPullRequests,
      generatedAt
    ),
    cohort,
    notes: [
      'This artifact only compares public GitHub pull-request metrics that can be measured consistently across non-Colony repositories.',
      'Governance-specific Colony metrics such as voting cadence, contested decisions, and role diversity are intentionally excluded from the external cohort because comparison repositories do not expose equivalent data.',
      'Default comparison repositories are seed cohorts, not a fairness claim. Override them with BENCHMARK_REPOSITORIES or --repos=owner/name,owner/name for a different study design.',
    ],
  };
}

// ──────────────────────────────────────────────
// Math helpers
// ──────────────────────────────────────────────

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function diffHours(start: string, end: string | null): number | null {
  if (!end) {
    return null;
  }
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return (endMs - startMs) / (60 * 60 * 1000);
}

function isValidDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function resolveToken(): string | undefined {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? undefined;
}

// ──────────────────────────────────────────────
// GitHub API fetching
// ──────────────────────────────────────────────

/**
 * Fetch all pull requests for `repository` that are relevant to a benchmark
 * window starting at `windowStart`.
 *
 * Two separate fetches are combined to ensure completeness:
 *
 * 1. `state=all` sorted `created desc`, stopping when the oldest page entry
 *    was created more than `PAGING_LOOKBACK_BUFFER_DAYS` before `windowStart`.
 *    The buffer captures PRs that were created before the window but merged
 *    inside it (e.g. a 60-day-old PR merged yesterday).
 *
 * 2. `state=open` without a stop — open PRs are not returned by `state=all`
 *    unless their `created_at` falls in the paged range, so we fetch them
 *    separately and deduplicate.
 */
async function fetchRepoPullRequests(
  repository: string,
  windowStart: Date
): Promise<ComparablePullRequest[]> {
  const token = resolveToken();

  // Extend the historical lookback by PAGING_LOOKBACK_BUFFER_DAYS so that PRs
  // created before windowStart but merged inside the window are captured.
  const pagingCutoff = new Date(
    windowStart.getTime() - PAGING_LOOKBACK_BUFFER_DAYS * 24 * 60 * 60 * 1000
  );

  const [historicalPullRequests, openPullRequests] = await Promise.all([
    fetchPullRequestPages(
      repository,
      { state: 'all', stopBefore: pagingCutoff },
      token
    ),
    fetchPullRequestPages(repository, { state: 'open' }, token),
  ]);

  const deduped = new Map<number, ComparablePullRequest>();
  for (const pr of [...historicalPullRequests, ...openPullRequests]) {
    deduped.set(pr.number, pr);
  }
  return [...deduped.values()];
}

interface PullRequestFetchOptions {
  state: 'all' | 'open';
  /** Stop paging when the oldest PR on a page was created before this date. */
  stopBefore?: Date;
}

async function fetchPullRequestPages(
  repository: string,
  options: PullRequestFetchOptions,
  token?: string
): Promise<ComparablePullRequest[]> {
  const collected: ComparablePullRequest[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`https://api.github.com/repos/${repository}/pulls`);
    url.searchParams.set('state', options.state);
    url.searchParams.set('sort', 'created');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error for ${repository}: ${response.status} ${response.statusText}`
      );
    }

    const pageData = (await response.json()) as GitHubPullRequestApiResponse[];
    if (pageData.length === 0) {
      break;
    }

    for (const pr of pageData) {
      if (!pr.user?.login || !isValidDate(pr.created_at)) {
        continue;
      }

      collected.push({
        number: pr.number,
        author: pr.user.login,
        createdAt: pr.created_at,
        closedAt: pr.closed_at ?? null,
        mergedAt: pr.merged_at ?? null,
        state:
          pr.merged_at !== null
            ? 'merged'
            : pr.state === 'open'
              ? 'open'
              : 'closed',
      });
    }

    if (options.stopBefore) {
      const oldestCreatedAt = pageData.at(-1)?.created_at;
      if (oldestCreatedAt) {
        const oldestCreatedMs = new Date(oldestCreatedAt).getTime();
        if (
          Number.isFinite(oldestCreatedMs) &&
          oldestCreatedMs < options.stopBefore.getTime()
        ) {
          break;
        }
      }
    }

    page += 1;
  }

  return collected;
}

// ──────────────────────────────────────────────
// Orchestration
// ──────────────────────────────────────────────

async function generateBenchmark(
  options: CliOptions
): Promise<BenchmarkArtifact> {
  const data = readActivityData(options.activityPath);
  const generatedAt = new Date(data.generatedAt);
  const windowStart = new Date(
    generatedAt.getTime() - options.windowDays * 24 * 60 * 60 * 1000
  );
  const cohort: RepoBenchmark[] = [];

  for (const repository of options.repositories) {
    const pullRequests = await fetchRepoPullRequests(repository, windowStart);
    cohort.push(
      buildRepoBenchmark(
        repository,
        'github-api',
        pullRequests,
        generatedAt,
        options.windowDays
      )
    );
  }

  return buildBenchmarkArtifact(data, cohort, options.windowDays);
}

// ──────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────

function writeArtifact(outputPath: string, artifact: BenchmarkArtifact): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

function formatHours(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }
  if (value < 24) {
    return `${value.toFixed(1)}h`;
  }
  return `${(value / 24).toFixed(1)}d`;
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function printSummary(outputPath: string, artifact: BenchmarkArtifact): void {
  console.log(`Benchmark artifact written to ${outputPath}`);
  console.log(
    `Window: ${artifact.colony.window.days} days ending ${artifact.colony.window.end}`
  );
  console.log(
    `Colony: p50 PR cycle ${formatHours(artifact.colony.metrics.prCycleTimeP50Hours)}, merge rate ${formatPercent(artifact.colony.metrics.mergeRate)}, stale-open share ${formatPercent(artifact.colony.metrics.staleOpenPrShare)}`
  );

  for (const repo of artifact.cohort) {
    console.log(
      `${repo.repository}: p50 PR cycle ${formatHours(repo.metrics.prCycleTimeP50Hours)}, merge rate ${formatPercent(repo.metrics.mergeRate)}, stale-open share ${formatPercent(repo.metrics.staleOpenPrShare)}`
    );
  }
}

export async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await generateBenchmark(options);

  if (options.json) {
    console.log(JSON.stringify(artifact, null, 2));
    return;
  }

  writeArtifact(options.outputPath, artifact);
  printSummary(options.outputPath, artifact);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`generate-benchmark failed: ${message}`);
    process.exit(1);
  });
}
