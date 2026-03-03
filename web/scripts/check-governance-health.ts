/**
 * Governance health checker — CLI script.
 *
 * Reads activity.json and computes four CHAOSS-aligned metrics that are
 * not covered by the existing dashboard utilities:
 *   1. PR cycle time (p50/p95) — time from PR opened to merged
 *   2. Role diversity index — Gini coefficient of proposal authorship
 *   3. Contested decision rate — proposals with any 👎 / total voted
 *   4. Cross-role review rate — reviews where reviewer role ≠ PR author role
 *
 * Usage:
 *   npm run check-governance-health
 *   npm run check-governance-health -- --json
 *   ACTIVITY_FILE=/path/to/activity.json npm run check-governance-health
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ActivityData,
  Comment,
  Proposal,
  PullRequest,
} from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ACTIVITY_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'activity.json'
);

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CycleTimeMetric {
  /** Median PR open-to-merge time in minutes, or null if no data */
  p50: number | null;
  /** 95th-percentile PR open-to-merge time in minutes, or null if no data */
  p95: number | null;
  /** Number of merged PRs in the sample */
  sampleSize: number;
}

export interface RoleDiversityMetric {
  /** Number of distinct roles that authored at least one proposal */
  uniqueRoles: number;
  /**
   * Gini coefficient over proposal counts per role.
   * 0 = perfectly equal, 1 = one role authored everything.
   */
  giniIndex: number;
  /** Role with the most proposals, or null if no proposals */
  topRole: string | null;
  /** Fraction of proposals authored by the top role (0–1) */
  topRoleShare: number;
}

export interface ContestedRateMetric {
  /** Number of voted proposals that received at least one 👎 */
  contestedCount: number;
  /** Total proposals that have a votesSummary */
  totalVoted: number;
  /** contestedCount / totalVoted (0–1), or 0 if no voted proposals */
  rate: number;
}

export interface CrossRoleReviewMetric {
  /** Review comments where reviewer role differs from PR author role */
  crossRoleCount: number;
  /**
   * Total review comments where both the PR author and the reviewer have a
   * known hivemoot role. Reviews from bots or external contributors are
   * excluded from the denominator so they don't artificially deflate the rate.
   */
  totalReviews: number;
  /** crossRoleCount / totalReviews (0–1), or 0 if no role-matched reviews */
  rate: number;
}

export interface HealthReport {
  generatedAt: string;
  /** Days spanned by the earliest to latest proposal */
  dataWindowDays: number;
  metrics: {
    prCycleTime: CycleTimeMetric;
    roleDiversity: RoleDiversityMetric;
    contestedDecisionRate: ContestedRateMetric;
    crossRoleReviewRate: CrossRoleReviewMetric;
  };
  /** Human-readable warnings for metrics outside healthy thresholds */
  warnings: string[];
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Extract the role segment from a hivemoot agent login.
 * e.g. "hivemoot-forager" → "forager", "octocat" → null
 */
export function extractRole(login: string): string | null {
  const match = /^hivemoot-(.+)$/.exec(login);
  return match ? match[1] : null;
}

/**
 * Compute the p-th percentile of a pre-sorted ascending array.
 * Returns null for empty arrays.
 */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Compute the Gini coefficient for an array of non-negative values.
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

// ──────────────────────────────────────────────
// Metric computation
// ──────────────────────────────────────────────

export function computePrCycleTime(
  pullRequests: PullRequest[]
): CycleTimeMetric {
  const durations = pullRequests
    .filter((pr) => pr.state === 'merged' && pr.mergedAt && pr.createdAt)
    .map((pr) => {
      const created = new Date(pr.createdAt).getTime();
      // mergedAt is guaranteed non-null by the filter above
      const mergedAt = pr.mergedAt ?? pr.createdAt;
      const merged = new Date(mergedAt).getTime();
      return (merged - created) / (1000 * 60); // minutes
    })
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);

  return {
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    sampleSize: durations.length,
  };
}

export function computeRoleDiversity(
  proposals: Proposal[]
): RoleDiversityMetric {
  const roleCounts = new Map<string, number>();
  for (const proposal of proposals) {
    // Non-hivemoot authors are binned as 'external' so each unique external
    // login does not inflate the role count independently.
    const role = extractRole(proposal.author) ?? 'external';
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  if (roleCounts.size === 0) {
    return { uniqueRoles: 0, giniIndex: 0, topRole: null, topRoleShare: 0 };
  }

  const counts = [...roleCounts.values()];
  const total = counts.reduce((a, b) => a + b, 0);
  const sorted = [...roleCounts.entries()].sort((a, b) => b[1] - a[1]);
  const [topRole, topCount] = sorted[0];

  return {
    uniqueRoles: roleCounts.size,
    giniIndex: computeGini(counts),
    topRole,
    topRoleShare: topCount / total,
  };
}

export function computeContestedRate(
  proposals: Proposal[]
): ContestedRateMetric {
  const voted = proposals.filter((p) => p.votesSummary);
  const contested = voted.filter((p) => (p.votesSummary?.thumbsDown ?? 0) > 0);

  return {
    contestedCount: contested.length,
    totalVoted: voted.length,
    rate: voted.length > 0 ? contested.length / voted.length : 0,
  };
}

export function computeCrossRoleReviewRate(
  pullRequests: PullRequest[],
  comments: Comment[]
): CrossRoleReviewMetric {
  const prAuthors = new Map<number, string>();
  for (const pr of pullRequests) {
    prAuthors.set(pr.number, pr.author);
  }

  let crossRoleCount = 0;
  let totalReviews = 0;

  for (const comment of comments) {
    if (comment.type !== 'review') continue;
    const prAuthor = prAuthors.get(comment.issueOrPrNumber);
    if (prAuthor === undefined) continue;

    const authorRole = extractRole(prAuthor);
    const reviewerRole = extractRole(comment.author);

    // Only include in the denominator when both parties are hivemoot agents
    // with a known role. Bot and external reviews are excluded so they cannot
    // artificially deflate the cross-role rate.
    if (authorRole === null || reviewerRole === null) continue;

    totalReviews++;
    if (authorRole !== reviewerRole) {
      crossRoleCount++;
    }
  }

  return {
    crossRoleCount,
    totalReviews,
    rate: totalReviews > 0 ? crossRoleCount / totalReviews : 0,
  };
}

export function computeDataWindowDays(proposals: Proposal[]): number {
  if (proposals.length === 0) return 0;
  const times = proposals.map((p) => new Date(p.createdAt).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  return Math.max(0, Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)));
}

// ──────────────────────────────────────────────
// Warning thresholds (configurable via env)
// ──────────────────────────────────────────────

const PR_CYCLE_P95_WARN_DAYS = Number(
  process.env.GH_CYCLE_P95_WARN_DAYS ?? '7'
);
const ROLE_CONCENTRATION_WARN = Number(
  process.env.GH_ROLE_CONCENTRATION_WARN ?? '0.6'
);
const CONTESTED_MIN_WARN = Number(process.env.GH_CONTESTED_MIN_WARN ?? '0.1');
const CONTESTED_MIN_SAMPLE = Number(process.env.GH_CONTESTED_MIN_SAMPLE ?? '5');
const CROSS_ROLE_MIN_WARN = Number(process.env.GH_CROSS_ROLE_MIN_WARN ?? '0.3');
const CROSS_ROLE_MIN_SAMPLE = Number(
  process.env.GH_CROSS_ROLE_MIN_SAMPLE ?? '10'
);

export function buildHealthReport(data: ActivityData): HealthReport {
  const prCycleTime = computePrCycleTime(data.pullRequests);
  const roleDiversity = computeRoleDiversity(data.proposals);
  const contestedDecisionRate = computeContestedRate(data.proposals);
  const crossRoleReviewRate = computeCrossRoleReviewRate(
    data.pullRequests,
    data.comments
  );

  const warnings: string[] = [];

  if (
    prCycleTime.p95 !== null &&
    prCycleTime.p95 > PR_CYCLE_P95_WARN_DAYS * 24 * 60
  ) {
    const days = (prCycleTime.p95 / 60 / 24).toFixed(1);
    warnings.push(
      `PR cycle time p95 (${days}d) exceeds ${PR_CYCLE_P95_WARN_DAYS}d threshold`
    );
  }

  if (roleDiversity.topRoleShare > ROLE_CONCENTRATION_WARN) {
    const pct = Math.round(roleDiversity.topRoleShare * 100);
    warnings.push(
      `Role concentration: ${roleDiversity.topRole} accounts for ${pct}% of proposals (threshold: ${Math.round(ROLE_CONCENTRATION_WARN * 100)}%)`
    );
  }

  if (
    contestedDecisionRate.totalVoted >= CONTESTED_MIN_SAMPLE &&
    contestedDecisionRate.rate < CONTESTED_MIN_WARN
  ) {
    const pct = Math.round(contestedDecisionRate.rate * 100);
    warnings.push(
      `Contested decision rate (${pct}%) below ${Math.round(CONTESTED_MIN_WARN * 100)}% — may indicate rubber-stamping`
    );
  }

  if (
    crossRoleReviewRate.totalReviews >= CROSS_ROLE_MIN_SAMPLE &&
    crossRoleReviewRate.rate < CROSS_ROLE_MIN_WARN
  ) {
    const pct = Math.round(crossRoleReviewRate.rate * 100);
    warnings.push(
      `Cross-role review rate (${pct}%) below ${Math.round(CROSS_ROLE_MIN_WARN * 100)}% — reviews mostly within same role`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    dataWindowDays: computeDataWindowDays(data.proposals),
    metrics: {
      prCycleTime,
      roleDiversity,
      contestedDecisionRate,
      crossRoleReviewRate,
    },
    warnings,
  };
}

// ──────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return 'N/A';
  const days = minutes / 60 / 24;
  if (days >= 2) return `${days.toFixed(1)}d`;
  const hours = minutes / 60;
  if (hours >= 2) return `${hours.toFixed(1)}h`;
  return `${Math.round(minutes)}min`;
}

function printReport(report: HealthReport): void {
  const {
    prCycleTime,
    roleDiversity,
    contestedDecisionRate,
    crossRoleReviewRate,
  } = report.metrics;

  console.log(`Governance Health Report`);
  console.log(
    `  Data window: ${report.dataWindowDays} days  |  Generated: ${report.generatedAt}`
  );
  console.log('');

  console.log('PR Cycle Time');
  console.log(`  p50:    ${formatMinutes(prCycleTime.p50)}`);
  console.log(`  p95:    ${formatMinutes(prCycleTime.p95)}`);
  console.log(`  sample: ${prCycleTime.sampleSize} merged PRs`);
  console.log('');

  console.log('Role Diversity');
  console.log(`  unique roles: ${roleDiversity.uniqueRoles}`);
  console.log(
    `  Gini index:   ${roleDiversity.giniIndex.toFixed(2)} (0=equal, 1=concentrated)`
  );
  console.log(
    `  top role:     ${roleDiversity.topRole ?? 'N/A'} (${Math.round(roleDiversity.topRoleShare * 100)}% of proposals)`
  );
  console.log('');

  console.log('Contested Decision Rate');
  console.log(
    `  ${contestedDecisionRate.contestedCount}/${contestedDecisionRate.totalVoted} voted proposals received ≥1 opposing vote`
  );
  console.log(`  rate: ${Math.round(contestedDecisionRate.rate * 100)}%`);
  console.log('');

  console.log('Cross-Role Review Rate');
  console.log(
    `  ${crossRoleReviewRate.crossRoleCount}/${crossRoleReviewRate.totalReviews} reviews are cross-role`
  );
  console.log(`  rate: ${Math.round(crossRoleReviewRate.rate * 100)}%`);
  console.log('');

  if (report.warnings.length > 0) {
    console.log('Warnings:');
    for (const w of report.warnings) {
      console.log(`  WARN ${w}`);
    }
  } else {
    console.log('No health warnings detected.');
  }
}

// ──────────────────────────────────────────────
// CLI entry point
// ──────────────────────────────────────────────

export function resolveActivityFile(
  env: NodeJS.ProcessEnv = process.env
): string {
  return env.ACTIVITY_FILE ?? DEFAULT_ACTIVITY_FILE;
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

async function main(): Promise<void> {
  const activityFile = resolveActivityFile();
  const isJson = process.argv.includes('--json');

  if (!existsSync(activityFile)) {
    console.error(`Activity file not found: ${activityFile}`);
    console.error(
      'Run `npm run generate-data` first, or set ACTIVITY_FILE env var.'
    );
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(activityFile, 'utf-8')) as ActivityData;
  const report = buildHealthReport(data);

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // Exit non-zero when warnings are present so CI can detect regressions
  process.exit(report.warnings.length > 0 ? 1 : 0);
}

if (isDirectExecution()) {
  void main();
}
