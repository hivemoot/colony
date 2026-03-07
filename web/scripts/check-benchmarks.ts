/**
 * Colony benchmarking CLI.
 *
 * Computes intra-Colony performance trend windows from activity.json and
 * optionally compares against external industry benchmarks.
 *
 * Usage:
 *   npm run check-benchmarks
 *   npm run check-benchmarks -- --json
 *   npm run check-benchmarks -- --compare
 *   npm run check-benchmarks -- --activity=web/public/data/activity.json --window-days=30
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ActivityData,
  Comment,
  PullRequest,
  Proposal,
} from '../shared/types';
import { computeGini } from '../shared/governance-snapshot';

export { computeGini };

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
  compare: boolean;
}

/**
 * One external benchmark reference point for a Colony metric.
 * Only metrics with verifiable, telemetry-based external data are included.
 */
export interface ExternalReference {
  metric: string;
  /** Elite threshold in days (PR open-to-merge scope). */
  eliteThresholdDays: number;
  /** Industry median in days (PR open-to-merge scope). */
  medianDays: number;
  source: string;
  sourceUrl: string;
  sampleSize: string;
  year: number;
  caveat: string;
}

/**
 * LinearB 2025 benchmark for PR pickup+review time — the sub-metric that
 * maps to Colony's prCycleTime (PR open to merge).
 *
 * LinearB's full cycle time (26h elite, 7d median) includes coding time and
 * deployment pipeline, which Colony does not measure. The pickup+review
 * sub-metrics are: elite <7h pickup + <6h review ≈ 13h combined (0.54d),
 * median ~4d in review.
 *
 * Sources:
 *   LinearB "Engineering Metrics Benchmarks: What Makes Elite Teams?" (2025)
 *   LinearB "Cycle Time Breakdown: Tactics For Reducing PR Review Time" (2025)
 */
const PR_CYCLE_TIME_EXTERNAL_REF: ExternalReference = {
  metric: 'prCycleTime',
  eliteThresholdDays: 0.54,
  medianDays: 4,
  source: 'LinearB 2025 Engineering Benchmarks (Pickup + Review Time)',
  sourceUrl:
    'https://linearb.io/blog/engineering-metrics-benchmarks-what-makes-elite-teams',
  sampleSize: '6.1M+ pull requests',
  year: 2025,
  caveat:
    'Colony agents operate 24/7 with no timezone gaps, weekends, or human review-queue latency. ' +
    'Speed advantages reflect a different operational model, not a more efficient human engineering process. ' +
    "LinearB's full cycle time (26h elite, 7d median) covers commit-to-deploy and is not directly comparable; " +
    "these values use only the pickup+review sub-metrics, which match Colony's PR open-to-merge scope.",
};

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
  /**
   * External reference points for Colony metrics. Only present when --compare
   * is active and a verifiable external baseline exists for that metric.
   */
  externalReferences?: ExternalReference[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    activityPath: DEFAULT_ACTIVITY_PATH,
    windowDays: DEFAULT_WINDOW_DAYS,
    json: false,
    compare: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--compare') {
      options.compare = true;
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
    'Usage: npm run check-benchmarks -- [--activity=web/public/data/activity.json] [--window-days=30] [--json] [--compare]'
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

/**
 * Collects event timestamps from activity data to anchor time windows.
 *
 * Windows are anchored on governance events (PR created/merged, proposal
 * created, review comments) rather than all repository events. Commit and
 * issue activity is counted toward Gini within a window but does not
 * anchor window boundaries, consistent with DORA/CHAOSS-DEX window semantics.
 */
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
  options?: {
    activityPath?: string;
    windowDays?: number;
    generatedAt?: Date;
    compare?: boolean;
  }
): BenchmarkReport {
  const windowDays = options?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const timestamps = collectBenchmarkTimestamps(data);
  const windows = buildTimeWindows(timestamps, windowDays).map((window) =>
    computeWindowMetrics(window, data)
  );

  const report: BenchmarkReport = {
    generatedAt: (options?.generatedAt ?? new Date()).toISOString(),
    source: {
      activityPath: options?.activityPath ?? DEFAULT_ACTIVITY_PATH,
      activityGeneratedAt: data.generatedAt,
    },
    windowDays,
    windows,
  };

  if (options?.compare) {
    report.externalReferences = [PR_CYCLE_TIME_EXTERNAL_REF];
  }

  return report;
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const prRef = report.externalReferences?.find(
    (ref) => ref.metric === 'prCycleTime'
  );

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

  if (prRef) {
    lines.push('');
    lines.push(
      `  External ref (${prRef.metric}): ${prRef.source} [${prRef.sampleSize}, ${prRef.year}]`
    );
    lines.push(
      `    Elite <${formatNumber(prRef.eliteThresholdDays)}d  Median ~${formatNumber(prRef.medianDays)}d`
    );
    lines.push('');
    lines.push(`  ⚠  Comparability note: ${prRef.caveat}`);
  }

  lines.push('');

  report.windows.forEach((window, index) => {
    lines.push(
      `Window: ${window.windowStart} -> ${window.windowEnd} | PRs=${window.sampleSize.pullRequests} merged=${window.sampleSize.mergedPullRequests} reviews=${window.sampleSize.reviews} proposals=${window.sampleSize.proposals}`
    );

    const prLine =
      `  PR Cycle Time: p50=${formatNumber(window.prCycleTime.p50Days)}d` +
      ` p95=${formatNumber(window.prCycleTime.p95Days)}d (n=${window.prCycleTime.sampleSize})`;

    if (prRef && window.prCycleTime.p50Days !== null) {
      const vsElite =
        window.prCycleTime.p50Days <= prRef.eliteThresholdDays
          ? 'within elite range'
          : `${formatNumber(window.prCycleTime.p50Days / prRef.eliteThresholdDays)}× elite threshold`;
      lines.push(`${prLine}  [ref: ${vsElite}]`);
    } else {
      lines.push(prLine);
    }

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
    compare: options.compare,
    generatedAt: new Date(data.generatedAt),
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
