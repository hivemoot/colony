/**
 * Governance health checker — CLI script.
 *
 * Reads activity.json and computes governance throughput and collaboration
 * metrics that are not covered by the existing dashboard utilities:
 *   1. PR cycle time (p50/p95) — time from PR opened to merged
 *   2. Review latency (p50/p95) — time from PR opened to first approval
 *   3. Merge latency (p50/p95) — time from first approval to merge
 *   4. Merge backlog depth — approved-but-unmerged open PRs
 *   5. Role diversity index — Gini coefficient of proposal authorship
 *   6. Contested decision rate — proposals with any 👎 / total voted
 *   7. Cross-role review rate — reviews where reviewer role ≠ PR author role
 *
 * Usage:
 *   npm run check-governance-health
 *   npm run check-governance-health -- --json
 *   ACTIVITY_FILE=/path/to/activity.json npm run check-governance-health
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGini } from '../shared/governance-snapshot';
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

export type LatencyMetric = CycleTimeMetric;

export interface MergeBacklogMetric {
  /** Number of open PRs that have already received a first approval */
  depth: number;
  /** Age in hours of the oldest approved-but-unmerged PR, or null if none */
  eldestApprovedHours: number | null;
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

/**
 * Voter participation metric — approximates CHAOSS "Governance Responsiveness".
 *
 * x-chaoss-note: Colony uses a defined voter list while CHAOSS defines
 * "eligible" more broadly. The metric here captures participation relative
 * to the peak observed or configured eligible voter count.
 */
export interface VoterParticipationMetric {
  /** Number of proposals that reached the voting phase (have a votesSummary) */
  votingCyclesAnalyzed: number;
  /**
   * Average fraction of eligible voters who cast a vote across all cycles.
   * 0–1. Null when no voting cycles are available.
   */
  averageParticipationRate: number | null;
  /**
   * Fraction of voting cycles that required extended voting (quorum failure).
   * 0–1. 0 when no voting cycles are available.
   */
  quorumFailureRate: number;
  /**
   * Eligible voter count used as the denominator.
   * Sourced from COLONY_ELIGIBLE_VOTERS env var, or inferred as the maximum
   * observed total votes in any single voting cycle.
   */
  eligibleVoterCount: number;
}

export interface HealthReport {
  generatedAt: string;
  /** Days spanned by the earliest to latest proposal */
  dataWindowDays: number;
  metrics: {
    prCycleTime: CycleTimeMetric;
    reviewLatency: LatencyMetric;
    mergeLatency: LatencyMetric;
    mergeBacklogDepth: MergeBacklogMetric;
    roleDiversity: RoleDiversityMetric;
    contestedDecisionRate: ContestedRateMetric;
    crossRoleReviewRate: CrossRoleReviewMetric;
    voterParticipationRate: VoterParticipationMetric;
  };
  /** Human-readable warnings for metrics outside healthy thresholds */
  warnings: string[];
  /** Actionable recommendations paired to each warning, in the same order */
  recommendations: string[];
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
// ──────────────────────────────────────────────
// Metric computation
// ──────────────────────────────────────────────

export function computePrCycleTime(
  pullRequests: PullRequest[]
): CycleTimeMetric {
  return computeLatencyMetric(
    pullRequests
      .filter((pr) => pr.state === 'merged')
      .map((pr) => [pr.createdAt, pr.mergedAt] as const)
  );
}

export function computeReviewLatency(
  pullRequests: PullRequest[]
): LatencyMetric {
  return computeLatencyMetric(
    pullRequests
      .filter((pr) => pr.state === 'merged')
      .map((pr) => [pr.createdAt, pr.firstApprovalAt] as const)
  );
}

export function computeMergeLatency(
  pullRequests: PullRequest[]
): LatencyMetric {
  return computeLatencyMetric(
    pullRequests
      .filter((pr) => pr.state === 'merged')
      .map((pr) => [pr.firstApprovalAt, pr.mergedAt] as const)
  );
}

export function computeMergeBacklogDepth(
  pullRequests: PullRequest[],
  anchorTime: string | number = Date.now()
): MergeBacklogMetric {
  const anchor =
    typeof anchorTime === 'number'
      ? anchorTime
      : new Date(anchorTime).getTime();
  const approvedOpenPrs = pullRequests.filter(
    (pr) => pr.state === 'open' && typeof pr.firstApprovalAt === 'string'
  );
  const oldestApproval = approvedOpenPrs
    .map((pr) => new Date(pr.firstApprovalAt ?? '').getTime())
    .filter((time) => Number.isFinite(time) && anchor >= time)
    .sort((a, b) => a - b)[0];

  return {
    depth: approvedOpenPrs.length,
    eldestApprovedHours:
      oldestApproval === undefined ? null : (anchor - oldestApproval) / 3600000,
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

/**
 * Returns true when a proposal passed through the extended-voting phase,
 * indicating a quorum failure in the original voting window.
 */
export function hadQuorumFailure(proposal: Proposal): boolean {
  if (proposal.phase === 'extended-voting') return true;
  return (
    proposal.phaseTransitions?.some((t) => t.phase === 'extended-voting') ??
    false
  );
}

/**
 * Compute voter participation rate across all proposals that reached voting.
 *
 * Eligible voter count is taken from the `eligibleVoterCount` parameter,
 * which callers should source from the COLONY_ELIGIBLE_VOTERS env var or
 * infer from the data (see `inferEligibleVoterCount`).
 */
export function computeVoterParticipationRate(
  proposals: Proposal[],
  eligibleVoterCount: number
): VoterParticipationMetric {
  const voted = proposals.filter((p) => p.votesSummary !== undefined);
  const failures = voted.filter(hadQuorumFailure);

  if (voted.length === 0) {
    return {
      votingCyclesAnalyzed: 0,
      averageParticipationRate: null,
      quorumFailureRate: 0,
      eligibleVoterCount,
    };
  }

  const participationRates = voted.map((p) => {
    const total =
      (p.votesSummary?.thumbsUp ?? 0) + (p.votesSummary?.thumbsDown ?? 0);
    return eligibleVoterCount > 0 ? Math.min(1, total / eligibleVoterCount) : 0;
  });

  const averageParticipationRate =
    participationRates.reduce((a, b) => a + b, 0) / participationRates.length;

  return {
    votingCyclesAnalyzed: voted.length,
    averageParticipationRate,
    quorumFailureRate: failures.length / voted.length,
    eligibleVoterCount,
  };
}

/**
 * Infer eligible voter count from the peak observed total votes in any cycle.
 * Falls back to 1 if no voted proposals exist.
 */
export function inferEligibleVoterCount(proposals: Proposal[]): number {
  const voted = proposals.filter((p) => p.votesSummary !== undefined);
  if (voted.length === 0) return 1;
  return Math.max(
    1,
    ...voted.map(
      (p) => (p.votesSummary?.thumbsUp ?? 0) + (p.votesSummary?.thumbsDown ?? 0)
    )
  );
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
const MERGE_LATENCY_P95_WARN_HOURS = Number(
  process.env.GH_MERGE_LATENCY_P95_WARN_HOURS ?? '48'
);
const MERGE_BACKLOG_WARN = Number(process.env.GH_MERGE_BACKLOG_WARN ?? '10');
const ROLE_CONCENTRATION_WARN = Number(
  process.env.GH_ROLE_CONCENTRATION_WARN ?? '0.6'
);
const CONTESTED_MIN_WARN = Number(process.env.GH_CONTESTED_MIN_WARN ?? '0.1');
const CONTESTED_MIN_SAMPLE = Number(process.env.GH_CONTESTED_MIN_SAMPLE ?? '5');
const CROSS_ROLE_MIN_WARN = Number(process.env.GH_CROSS_ROLE_MIN_WARN ?? '0.3');
const CROSS_ROLE_MIN_SAMPLE = Number(
  process.env.GH_CROSS_ROLE_MIN_SAMPLE ?? '10'
);
const VOTER_PARTICIPATION_WARN = Number(
  process.env.GH_VOTER_PARTICIPATION_WARN ?? '0.5'
);
const VOTER_PARTICIPATION_MIN_SAMPLE = Number(
  process.env.GH_VOTER_PARTICIPATION_MIN_SAMPLE ?? '3'
);

export function buildHealthReport(
  data: ActivityData,
  env: NodeJS.ProcessEnv = process.env
): HealthReport {
  const prCycleTime = computePrCycleTime(data.pullRequests);
  const reviewLatency = computeReviewLatency(data.pullRequests);
  const mergeLatency = computeMergeLatency(data.pullRequests);
  const mergeBacklogDepth = computeMergeBacklogDepth(
    data.pullRequests,
    data.generatedAt
  );
  const roleDiversity = computeRoleDiversity(data.proposals);
  const contestedDecisionRate = computeContestedRate(data.proposals);
  const crossRoleReviewRate = computeCrossRoleReviewRate(
    data.pullRequests,
    data.comments
  );

  const rawEligible = Number(env.COLONY_ELIGIBLE_VOTERS);
  const eligibleVoterCount =
    Number.isFinite(rawEligible) && rawEligible > 0
      ? rawEligible
      : Math.max(1, data.agents.length);

  const voterParticipationRate = computeVoterParticipationRate(
    data.proposals,
    eligibleVoterCount
  );

  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (
    prCycleTime.p95 !== null &&
    prCycleTime.p95 > PR_CYCLE_P95_WARN_DAYS * 24 * 60
  ) {
    const days = (prCycleTime.p95 / 60 / 24).toFixed(1);
    warnings.push(
      `PR cycle time p95 (${days}d) exceeds ${PR_CYCLE_P95_WARN_DAYS}d threshold`
    );
    recommendations.push(
      `Run 'gh pr list --label hivemoot:merge-ready' to identify approved PRs waiting for merge. High p95 often means a small number of PRs have been stuck for weeks.`
    );
  }

  if (
    mergeLatency.p95 !== null &&
    mergeLatency.p95 > MERGE_LATENCY_P95_WARN_HOURS * 60
  ) {
    warnings.push(
      `Merge latency p95 (${formatMinutes(mergeLatency.p95)}) exceeds ${MERGE_LATENCY_P95_WARN_HOURS}h threshold`
    );
  }

  if (mergeBacklogDepth.depth > MERGE_BACKLOG_WARN) {
    warnings.push(
      `Merge backlog depth (${mergeBacklogDepth.depth}) exceeds ${MERGE_BACKLOG_WARN} PR threshold`
    );
  }

  if (roleDiversity.topRoleShare > ROLE_CONCENTRATION_WARN) {
    const pct = Math.round(roleDiversity.topRoleShare * 100);
    warnings.push(
      `Role concentration: ${roleDiversity.topRole} accounts for ${pct}% of proposals (threshold: ${Math.round(ROLE_CONCENTRATION_WARN * 100)}%)`
    );
    recommendations.push(
      `Encourage agents from underrepresented roles to submit proposals. Check 'gh issue list --label hivemoot:discussion' to see if roles other than ${roleDiversity.topRole} are participating.`
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
    recommendations.push(
      `Low contested rate may indicate rubber-stamping. Review recent voting comment threads to see if concerns are being raised in comments but not registered as votes.`
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
    recommendations.push(
      `Assign cross-role reviewers to active PRs: 'gh pr list --label hivemoot:candidate' shows candidates accepting new reviews. Cross-role review strengthens governance legitimacy.`
    );
  }

  if (
    voterParticipationRate.votingCyclesAnalyzed >=
      VOTER_PARTICIPATION_MIN_SAMPLE &&
    voterParticipationRate.averageParticipationRate !== null &&
    voterParticipationRate.averageParticipationRate < VOTER_PARTICIPATION_WARN
  ) {
    const pct = Math.round(
      voterParticipationRate.averageParticipationRate * 100
    );
    warnings.push(
      `Voter participation rate (${pct}%) below ${Math.round(VOTER_PARTICIPATION_WARN * 100)}% — fewer than half of eligible voters participating on average`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    dataWindowDays: computeDataWindowDays(data.proposals),
    metrics: {
      prCycleTime,
      reviewLatency,
      mergeLatency,
      mergeBacklogDepth,
      roleDiversity,
      contestedDecisionRate,
      crossRoleReviewRate,
      voterParticipationRate,
    },
    warnings,
    recommendations,
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

function formatHours(hours: number | null): string {
  if (hours === null) return 'N/A';
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 2) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours * 60)}min`;
}

function computeLatencyMetric(
  pairs: Array<readonly [string | null | undefined, string | null | undefined]>
): LatencyMetric {
  const durations = pairs
    .map(([start, end]) => durationInMinutes(start, end))
    .filter((duration): duration is number => duration !== null)
    .sort((a, b) => a - b);

  return {
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    sampleSize: durations.length,
  };
}

function durationInMinutes(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  const minutes = (endTime - startTime) / 60000;
  return minutes >= 0 ? minutes : null;
}

function printReport(report: HealthReport): void {
  const {
    prCycleTime,
    reviewLatency,
    mergeLatency,
    mergeBacklogDepth,
    roleDiversity,
    contestedDecisionRate,
    crossRoleReviewRate,
    voterParticipationRate,
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

  console.log('Review Latency');
  console.log(`  p50:    ${formatMinutes(reviewLatency.p50)}`);
  console.log(`  p95:    ${formatMinutes(reviewLatency.p95)}`);
  console.log(`  sample: ${reviewLatency.sampleSize} merged PRs`);
  console.log('');

  console.log('Merge Latency');
  console.log(`  p50:    ${formatMinutes(mergeLatency.p50)}`);
  console.log(`  p95:    ${formatMinutes(mergeLatency.p95)}`);
  console.log(`  sample: ${mergeLatency.sampleSize} merged PRs`);
  console.log('');

  console.log('Merge Backlog');
  console.log(`  depth:  ${mergeBacklogDepth.depth} approved open PRs`);
  console.log(
    `  eldest: ${formatHours(mergeBacklogDepth.eldestApprovedHours)}`
  );
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

  console.log('Voter Participation Rate');
  console.log(
    `  cycles analyzed: ${voterParticipationRate.votingCyclesAnalyzed}`
  );
  console.log(
    `  eligible voters: ${voterParticipationRate.eligibleVoterCount}`
  );
  const avgPct =
    voterParticipationRate.averageParticipationRate !== null
      ? `${Math.round(voterParticipationRate.averageParticipationRate * 100)}%`
      : 'N/A';
  console.log(`  avg participation: ${avgPct}`);
  console.log(
    `  quorum failure rate: ${Math.round(voterParticipationRate.quorumFailureRate * 100)}%`
  );
  console.log('');

  if (report.warnings.length > 0) {
    console.log('Warnings:');
    for (const w of report.warnings) {
      console.log(`  WARN ${w}`);
    }
    console.log('');
    console.log('Recommendations:');
    for (const r of report.recommendations) {
      console.log(`  → ${r}`);
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
