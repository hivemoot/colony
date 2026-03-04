import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ActivityData,
  Comment,
  PullRequest,
  Proposal,
} from '../shared/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTIVITY_PATH = join(
  __dirname,
  '..',
  'public',
  'data',
  'activity.json'
);

interface CliOptions {
  activityPath: string;
  windowDays: number;
  json: boolean;
}

export interface WindowSampleSize {
  pullRequests: number;
  mergedPullRequests: number;
  reviews: number;
  proposals: number;
  contributors: number;
}

export interface WindowBenchmark {
  windowStart: string;
  windowEnd: string;
  sampleSize: WindowSampleSize;
  prCycleTime: {
    p50Days: number | null;
    p95Days: number | null;
    sampleSize: number;
  };
  reviewDensity: {
    reviewsPerPr: number | null;
    reviewCount: number;
    pullRequestCount: number;
    sampleSize: number;
  };
  proposalThroughput: {
    proposalsPerWeek: number;
    proposalCount: number;
    sampleSize: number;
  };
  contributorConcentration: {
    gini: number;
    sampleSize: number;
  };
}

export interface BenchmarkReport {
  generatedAt: string;
  source: {
    activityPath: string;
    activityGeneratedAt: string;
  };
  windowDays: number;
  windows: WindowBenchmark[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    activityPath: DEFAULT_ACTIVITY_PATH,
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

    if (arg.startsWith('--window-days=')) {
      const value = Number.parseInt(arg.slice('--window-days='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        options.windowDays = value;
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(
    'Usage: npm run check-benchmarks -- [--activity=web/public/data/activity.json] [--window-days=30] [--json]'
  );
}

function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }

  return time;
}

function floorUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface TimeWindow {
  startMs: number;
  endExclusiveMs: number;
}

export function buildTimeWindows(
  timestamps: number[],
  windowDays: number
): TimeWindow[] {
  if (timestamps.length === 0) {
    return [];
  }

  const minMs = floorUtcDay(Math.min(...timestamps));
  const maxMs = floorUtcDay(Math.max(...timestamps));
  const maxExclusiveMs = maxMs + DAY_MS;
  const windowSpanMs = windowDays * DAY_MS;

  const windows: TimeWindow[] = [];
  let cursor = minMs;

  while (cursor < maxExclusiveMs) {
    windows.push({
      startMs: cursor,
      endExclusiveMs: Math.min(cursor + windowSpanMs, maxExclusiveMs),
    });
    cursor += windowSpanMs;
  }

  return windows;
}

export function computePercentile(
  values: number[],
  percentile: number
): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const clampedPercentile = Math.min(100, Math.max(0, percentile));
  const rank = (clampedPercentile / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) {
    return sorted[lower] ?? null;
  }

  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) {
    return null;
  }

  const weight = rank - lower;
  return lowerValue + (upperValue - lowerValue) * weight;
}

export function computeGini(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);

  if (sum <= 0) {
    return 0;
  }

  let weighted = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    weighted += (index + 1) * (sorted[index] ?? 0);
  }

  const n = sorted.length;
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

function inWindow(timeMs: number | null, window: TimeWindow): boolean {
  if (timeMs === null) {
    return false;
  }

  return timeMs >= window.startMs && timeMs < window.endExclusiveMs;
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return value.toFixed(digits);
}

function collectBenchmarkTimestamps(data: ActivityData): number[] {
  const timestamps: number[] = [];

  for (const pr of data.pullRequests) {
    const createdMs = parseIsoToMs(pr.createdAt);
    if (createdMs !== null) {
      timestamps.push(createdMs);
    }
    const mergedMs = parseIsoToMs(pr.mergedAt);
    if (mergedMs !== null) {
      timestamps.push(mergedMs);
    }
  }

  for (const proposal of data.proposals) {
    const createdMs = parseIsoToMs(proposal.createdAt);
    if (createdMs !== null) {
      timestamps.push(createdMs);
    }
  }

  for (const comment of data.comments) {
    if (comment.type !== 'review') {
      continue;
    }

    const createdMs = parseIsoToMs(comment.createdAt);
    if (createdMs !== null) {
      timestamps.push(createdMs);
    }
  }

  return timestamps;
}

function computeWindowMetrics(
  window: TimeWindow,
  data: ActivityData
): WindowBenchmark {
  const pullRequestsInWindow = data.pullRequests.filter((pr) =>
    inWindow(parseIsoToMs(pr.createdAt), window)
  );

  const mergedPullRequestsInWindow = data.pullRequests.filter(
    (pr) => pr.state === 'merged' && inWindow(parseIsoToMs(pr.mergedAt), window)
  );

  const cycleTimes = mergedPullRequestsInWindow
    .map((pr) => {
      const createdMs = parseIsoToMs(pr.createdAt);
      const mergedMs = parseIsoToMs(pr.mergedAt);
      if (createdMs === null || mergedMs === null) {
        return null;
      }
      return (mergedMs - createdMs) / DAY_MS;
    })
    .filter((value): value is number => value !== null && value >= 0);

  const reviewCommentsInWindow = data.comments.filter(
    (comment) =>
      comment.type === 'review' &&
      inWindow(parseIsoToMs(comment.createdAt), window)
  );

  const proposalsInWindow = data.proposals.filter((proposal) =>
    inWindow(parseIsoToMs(proposal.createdAt), window)
  );

  const contributionCounts = getContributionCountsByContributor(
    window,
    data.pullRequests,
    data.proposals,
    data.comments,
    data.commits,
    data.issues
  );

  const windowDays = (window.endExclusiveMs - window.startMs) / DAY_MS;
  const reviewsPerPr =
    pullRequestsInWindow.length > 0
      ? reviewCommentsInWindow.length / pullRequestsInWindow.length
      : null;

  const benchmark: WindowBenchmark = {
    windowStart: toIsoDate(window.startMs),
    windowEnd: toIsoDate(window.endExclusiveMs - DAY_MS),
    sampleSize: {
      pullRequests: pullRequestsInWindow.length,
      mergedPullRequests: mergedPullRequestsInWindow.length,
      reviews: reviewCommentsInWindow.length,
      proposals: proposalsInWindow.length,
      contributors: contributionCounts.length,
    },
    prCycleTime: {
      p50Days:
        cycleTimes.length > 0
          ? round(computePercentile(cycleTimes, 50) ?? 0)
          : null,
      p95Days:
        cycleTimes.length > 0
          ? round(computePercentile(cycleTimes, 95) ?? 0)
          : null,
      sampleSize: cycleTimes.length,
    },
    reviewDensity: {
      reviewsPerPr: reviewsPerPr === null ? null : round(reviewsPerPr),
      reviewCount: reviewCommentsInWindow.length,
      pullRequestCount: pullRequestsInWindow.length,
      sampleSize: pullRequestsInWindow.length,
    },
    proposalThroughput: {
      proposalsPerWeek: round(
        windowDays > 0 ? (proposalsInWindow.length / windowDays) * 7 : 0
      ),
      proposalCount: proposalsInWindow.length,
      sampleSize: proposalsInWindow.length,
    },
    contributorConcentration: {
      gini: round(computeGini(contributionCounts)),
      sampleSize: contributionCounts.length,
    },
  };

  return benchmark;
}

function getContributionCountsByContributor(
  window: TimeWindow,
  pullRequests: PullRequest[],
  proposals: Proposal[],
  comments: Comment[],
  commits: ActivityData['commits'],
  issues: ActivityData['issues']
): number[] {
  const counts = new Map<string, number>();

  const bump = (author: string): void => {
    if (!author.trim()) {
      return;
    }
    counts.set(author, (counts.get(author) ?? 0) + 1);
  };

  for (const commit of commits) {
    if (inWindow(parseIsoToMs(commit.date), window)) {
      bump(commit.author);
    }
  }

  for (const issue of issues) {
    if (inWindow(parseIsoToMs(issue.createdAt), window)) {
      bump(issue.author);
    }
  }

  for (const pr of pullRequests) {
    if (inWindow(parseIsoToMs(pr.createdAt), window)) {
      bump(pr.author);
    }
  }

  for (const proposal of proposals) {
    if (inWindow(parseIsoToMs(proposal.createdAt), window)) {
      bump(proposal.author);
    }
  }

  for (const comment of comments) {
    if (comment.type !== 'review') {
      continue;
    }

    if (inWindow(parseIsoToMs(comment.createdAt), window)) {
      bump(comment.author);
    }
  }

  return [...counts.values()];
}

export function buildBenchmarkReport(
  data: ActivityData,
  options?: { activityPath?: string; windowDays?: number; generatedAt?: Date }
): BenchmarkReport {
  const windowDays = options?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const timestamps = collectBenchmarkTimestamps(data);
  const windows = buildTimeWindows(timestamps, windowDays).map((window) =>
    computeWindowMetrics(window, data)
  );

  return {
    generatedAt: (options?.generatedAt ?? new Date()).toISOString(),
    source: {
      activityPath: options?.activityPath ?? DEFAULT_ACTIVITY_PATH,
      activityGeneratedAt: data.generatedAt,
    },
    windowDays,
    windows,
  };
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  if (report.windows.length === 0) {
    return [
      'Colony Performance Trends',
      `  Generated: ${report.generatedAt}`,
      `  Source: ${report.source.activityPath}`,
      '  No benchmarkable activity found in activity.json.',
    ].join('\n');
  }

  const lines: string[] = [];
  lines.push('Colony Performance Trends');
  lines.push(`  Generated: ${report.generatedAt}`);
  lines.push(`  Source: ${report.source.activityPath}`);
  lines.push(`  Window size: ${report.windowDays} days`);
  lines.push('');

  report.windows.forEach((window, index) => {
    lines.push(
      `Window: ${window.windowStart} -> ${window.windowEnd} | PRs=${window.sampleSize.pullRequests} merged=${window.sampleSize.mergedPullRequests} reviews=${window.sampleSize.reviews} proposals=${window.sampleSize.proposals}`
    );
    lines.push(
      `  PR Cycle Time: p50=${formatNumber(window.prCycleTime.p50Days)}d p95=${formatNumber(window.prCycleTime.p95Days)}d (n=${window.prCycleTime.sampleSize})`
    );
    lines.push(
      `  Review Density: ${formatNumber(window.reviewDensity.reviewsPerPr)} reviews/PR (reviews=${window.reviewDensity.reviewCount}, prs=${window.reviewDensity.pullRequestCount})`
    );
    lines.push(
      `  Proposal Throughput: ${formatNumber(window.proposalThroughput.proposalsPerWeek)} proposals/week (n=${window.proposalThroughput.sampleSize})`
    );
    lines.push(
      `  Contributor Concentration (Gini): ${formatNumber(window.contributorConcentration.gini)} (contributors=${window.contributorConcentration.sampleSize})`
    );

    if (index < report.windows.length - 1) {
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  });

  return lines.join('\n');
}

export function loadActivityData(activityPath: string): ActivityData {
  const raw = readFileSync(activityPath, 'utf8');
  return JSON.parse(raw) as ActivityData;
}

function run(): void {
  const options = parseArgs(process.argv.slice(2));
  const data = loadActivityData(options.activityPath);
  const report = buildBenchmarkReport(data, {
    activityPath: options.activityPath,
    windowDays: options.windowDays,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatBenchmarkReport(report));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run();
}
