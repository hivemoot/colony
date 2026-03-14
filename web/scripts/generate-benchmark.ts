import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const DEFAULT_OUTPUT_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'benchmark.json'
);
const DEFAULT_REPOSITORIES = [
  'chaoss/grimoirelab',
  'chaoss/augur',
  'sigstore/cosign',
] as const;
const DEFAULT_WINDOW_DAYS = 90;
const SELF_COMPARISON_DAYS = 30;
const STALE_OPEN_PR_DAYS = 7;
const REPOSITORY_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface CliOptions {
  activityPath: string;
  outputPath: string;
  repositories: string[];
  windowDays: number;
  json: boolean;
}

export interface ComparablePullRequest {
  number: number;
  author: string;
  createdAt: string;
  closedAt?: string | null;
  mergedAt?: string | null;
  state: 'open' | 'closed' | 'merged';
}

export interface BenchmarkMetrics {
  openedPrs: number;
  mergedPrs: number;
  openPrs: number;
  staleOpenPrs: number;
  activeContributors: number;
  prCycleTimeP50Hours: number | null;
  mergeRate: number | null;
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

interface GitHubPullRequestApiResponse {
  number: number;
  state: string;
  created_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  user?: {
    login?: string;
  } | null;
}

export function parseArgs(argv: string[]): CliOptions {
  const repositories = parseRepositoryList(
    process.env.BENCHMARK_REPOSITORIES
  ) ?? [...DEFAULT_REPOSITORIES];
  const options: CliOptions = {
    activityPath: DEFAULT_ACTIVITY_FILE,
    outputPath: DEFAULT_OUTPUT_FILE,
    repositories,
    windowDays: DEFAULT_WINDOW_DAYS,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith('--activity=')) {
      const value = arg.slice('--activity='.length).trim();
      if (value) {
        options.activityPath = resolve(value);
      }
      continue;
    }

    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length).trim();
      if (value) {
        options.outputPath = resolve(value);
      }
      continue;
    }

    if (arg.startsWith('--repos=')) {
      const value = arg.slice('--repos='.length);
      const parsed = parseRepositoryList(value);
      if (parsed && parsed.length > 0) {
        options.repositories = parsed;
      } else {
        console.warn(
          `Warning: --repos="${value}" did not contain any valid owner/name entries. Keeping current repository list.`
        );
      }
      continue;
    }

    if (arg.startsWith('--window-days=')) {
      const raw = arg.slice('--window-days='.length).trim();
      const value = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(value) && value > 0) {
        options.windowDays = value;
      } else {
        console.warn(
          `Warning: --window-days="${raw}" is not a valid positive integer. Keeping ${options.windowDays}.`
        );
      }
      continue;
    }

    console.warn(`Warning: Unknown argument "${arg}" ignored.`);
  }

  return options;
}

function printHelp(): void {
  console.log(
    'Usage: npm run generate-benchmark -- [--activity=web/public/data/activity.json] [--out=web/public/data/benchmark.json] [--repos=owner/name,owner/name] [--window-days=90] [--json]'
  );
}

export function parseRepositoryList(input?: string | null): string[] | null {
  if (!input) {
    return null;
  }

  const repositories = input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => REPOSITORY_REGEX.test(entry));

  return repositories.length > 0 ? repositories : null;
}

function readActivityData(activityPath: string): ActivityData {
  const raw = readFileSync(activityPath, 'utf8');
  return JSON.parse(raw) as ActivityData;
}

export function normalizeColonyPullRequests(
  data: ActivityData
): ComparablePullRequest[] {
  const primaryRepo = `${data.repository.owner}/${data.repository.name}`;
  return data.pullRequests
    .filter((pr) => !pr.repo || pr.repo === primaryRepo)
    .map((pr) => ({
      number: pr.number,
      author: pr.author,
      createdAt: pr.createdAt,
      closedAt: pr.closedAt ?? null,
      mergedAt: pr.mergedAt ?? null,
      state: pr.state,
    }));
}

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
            (pr) =>
              pr.mergedAt !== null && new Date(pr.mergedAt).getTime() <= endMs
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

export function buildSelfComparison(
  repository: string,
  pullRequests: ComparablePullRequest[]
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
  const latestTimestamp =
    sortedByCreatedAt.at(-1)?.createdAt ?? baselineEnd.toISOString();
  const currentEnd = new Date(latestTimestamp);

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
    selfComparison: buildSelfComparison(colonyRepository, colonyPullRequests),
    cohort,
    notes: [
      'This artifact only compares public GitHub pull-request metrics that can be measured consistently across non-Colony repositories.',
      'Governance-specific Colony metrics such as voting cadence, contested decisions, and role diversity are intentionally excluded from the external cohort because comparison repositories do not expose equivalent data.',
      'Default comparison repositories are seed cohorts, not a fairness claim. Override them with BENCHMARK_REPOSITORIES or --repos=owner/name,owner/name for a different study design.',
    ],
  };
}

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
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

async function fetchRepoPullRequests(
  repository: string,
  windowStart: Date
): Promise<ComparablePullRequest[]> {
  const token = resolveToken();
  const [historicalPullRequests, openPullRequests] = await Promise.all([
    fetchPullRequestPages(
      repository,
      {
        state: 'all',
        stopBefore: windowStart,
      },
      token
    ),
    fetchPullRequestPages(
      repository,
      {
        state: 'open',
      },
      token
    ),
  ]);

  const deduped = new Map<number, ComparablePullRequest>();
  for (const pullRequest of [...historicalPullRequests, ...openPullRequests]) {
    deduped.set(pullRequest.number, pullRequest);
  }
  return [...deduped.values()];
}

interface PullRequestFetchOptions {
  state: 'all' | 'open';
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

    let shouldStop = false;
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
          shouldStop = true;
        }
      }
    }

    if (shouldStop) {
      break;
    }

    page += 1;
  }

  return collected;
}

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
