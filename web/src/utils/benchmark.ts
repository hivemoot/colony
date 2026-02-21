/**
 * Velocity Benchmarking — compares Colony's measured GitHub metrics against
 * published industry baselines from CHAOSS, CNCF DevStats, and academic research.
 *
 * Sources:
 *   CHAOSS Lead Time metric: https://chaoss.community/kb/metric-lead-time-for-changes/
 *   CNCF DevStats (small-project cohort, 5-50 contributors):
 *     https://devstats.cncf.io/
 *   arXiv:2304.08426 — PR review latency study (2023), Dey et al.
 *   ossinsight.io — 5B+ GitHub events, open methodology.
 *
 * Baselines represent p50 for small active open-source projects (5–50 contributors,
 * 50–500 stars) from the CNCF small-project cohort and ossinsight aggregates.
 */

import type { ActivityData } from '../types/activity';
import { computeVelocityMetrics } from './velocity';

export interface IndustryBaseline {
  /** Human-readable label for the baseline */
  label: string;
  /** Median value for the comparator population */
  p50: number;
  /** Unit string for display (e.g. "hours", "PRs/week") */
  unit: string;
  /** Short citation for the source */
  source: string;
  /** Description of the comparator population */
  population: string;
}

export type BenchmarkVerdict =
  | 'much-faster' // Colony < 25% of baseline
  | 'faster' // Colony 25–75% of baseline
  | 'comparable' // Colony 75–125% of baseline
  | 'slower' // Colony 125–200% of baseline
  | 'much-slower' // Colony > 200% of baseline
  | 'unknown'; // Colony value unavailable

export interface BenchmarkComparison {
  id: string;
  metric: string;
  description: string;
  colonyValue: number | null;
  unit: string;
  baseline: IndustryBaseline;
  /** colony / baseline p50; null if colonyValue is null */
  ratio: number | null;
  verdict: BenchmarkVerdict;
  /** Human-readable summary of the result */
  summary: string;
}

export interface BenchmarkResult {
  comparisons: BenchmarkComparison[];
  /** Number of merged PRs used for PR cycle time */
  mergedPrCount: number;
  /** Number of implemented proposals used for proposal-to-ship */
  implementedProposalCount: number;
  /** Disclaimer about data completeness */
  dataNote: string;
}

// ---------------------------------------------------------------------------
// Industry baselines
// ---------------------------------------------------------------------------

const BASELINES: Record<string, IndustryBaseline> = {
  prCycleTime: {
    label: 'PR Cycle Time (p50)',
    p50: 48,
    unit: 'hours',
    source: 'CNCF DevStats / ossinsight.io',
    population: 'Active OSS projects with 5–50 contributors',
  },
  proposalToShip: {
    label: 'Issue-to-Merge Lead Time (p50)',
    p50: 168, // 7 days
    unit: 'hours',
    source: 'CHAOSS Lead Time metric',
    population: 'Active OSS projects with 5–50 contributors',
  },
  weeklyThroughputPerContributor: {
    label: 'Weekly PRs Merged per Active Contributor (p50)',
    p50: 1.0,
    unit: 'PRs/contributor/week',
    source: 'CNCF DevStats small-project cohort',
    population: 'Active OSS projects with 5–50 contributors',
  },
};

// ---------------------------------------------------------------------------
// Verdict classification
// ---------------------------------------------------------------------------

function classifyVerdict(ratio: number | null): BenchmarkVerdict {
  if (ratio === null) return 'unknown';
  if (ratio < 0.25) return 'much-faster';
  if (ratio < 0.75) return 'faster';
  if (ratio <= 1.25) return 'comparable';
  if (ratio <= 2.0) return 'slower';
  return 'much-slower';
}

function buildSummary(
  verdict: BenchmarkVerdict,
  colonyValue: number | null,
  baseline: IndustryBaseline,
  unit: string
): string {
  if (verdict === 'unknown' || colonyValue === null) {
    return 'Insufficient data — more activity needed.';
  }
  const colonySide = formatValue(colonyValue, unit);
  const baselineSide = formatValue(baseline.p50, unit);
  switch (verdict) {
    case 'much-faster':
      return `${colonySide} vs ${baselineSide} — more than 4× faster than industry median.`;
    case 'faster':
      return `${colonySide} vs ${baselineSide} — faster than industry median.`;
    case 'comparable':
      return `${colonySide} vs ${baselineSide} — in line with industry median.`;
    case 'slower':
      return `${colonySide} vs ${baselineSide} — slower than industry median.`;
    case 'much-slower':
      return `${colonySide} vs ${baselineSide} — more than 2× slower than industry median.`;
  }
}

function formatValue(value: number, unit: string): string {
  if (unit === 'hours') {
    if (value < 1) return `${Math.round(value * 60)}m`;
    if (value < 24) return `${value.toFixed(1)}h`;
    const days = value / 24;
    return days < 2 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
  }
  return `${value.toFixed(1)} ${unit}`;
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute benchmark comparisons from ActivityData.
 * Pure function — no side effects, no API calls.
 */
export function computeBenchmarkMetrics(data: ActivityData): BenchmarkResult {
  const velocity = computeVelocityMetrics(data);

  const mergedPRs = data.pullRequests.filter(
    (pr) => pr.state === 'merged' && pr.mergedAt
  );
  const implementedProposals = data.proposals.filter(
    (p) => p.phase === 'implemented'
  );

  // --- PR Cycle Time ---
  const prCycleBaseline = BASELINES.prCycleTime;
  const prCycleRatio =
    velocity.medianPrCycleHours !== null
      ? velocity.medianPrCycleHours / prCycleBaseline.p50
      : null;
  const prCycleVerdict = classifyVerdict(prCycleRatio);

  const prCycleComparison: BenchmarkComparison = {
    id: 'pr-cycle-time',
    metric: 'PR Cycle Time',
    description: 'Median time from PR creation to merge',
    colonyValue: velocity.medianPrCycleHours,
    unit: 'hours',
    baseline: prCycleBaseline,
    ratio: prCycleRatio,
    verdict: prCycleVerdict,
    summary: buildSummary(
      prCycleVerdict,
      velocity.medianPrCycleHours,
      prCycleBaseline,
      'hours'
    ),
  };

  // --- Proposal-to-Ship Lead Time ---
  const leadTimeBaseline = BASELINES.proposalToShip;
  const leadTimeRatio =
    velocity.medianProposalToShipHours !== null
      ? velocity.medianProposalToShipHours / leadTimeBaseline.p50
      : null;
  const leadTimeVerdict = classifyVerdict(leadTimeRatio);

  const leadTimeComparison: BenchmarkComparison = {
    id: 'proposal-to-ship',
    metric: 'Proposal-to-Ship Lead Time',
    description: 'Median time from proposal creation to implemented phase',
    colonyValue: velocity.medianProposalToShipHours,
    unit: 'hours',
    baseline: leadTimeBaseline,
    ratio: leadTimeRatio,
    verdict: leadTimeVerdict,
    summary: buildSummary(
      leadTimeVerdict,
      velocity.medianProposalToShipHours,
      leadTimeBaseline,
      'hours'
    ),
  };

  // --- Weekly throughput per active contributor ---
  const throughputBaseline = BASELINES.weeklyThroughputPerContributor;
  const activeContributors = data.agentStats.length;
  const weeklyPerContributor =
    activeContributors > 0
      ? velocity.weeklyMergedCount / activeContributors
      : null;
  const throughputRatio =
    weeklyPerContributor !== null
      ? // For throughput: higher colony value = better; invert ratio so verdict scale is consistent
        // (ratio < 1 means Colony is HIGHER than baseline = better)
        throughputBaseline.p50 / weeklyPerContributor
      : null;
  const throughputVerdict = classifyVerdict(throughputRatio);

  const throughputComparison: BenchmarkComparison = {
    id: 'weekly-throughput-per-contributor',
    metric: 'Weekly Throughput per Contributor',
    description: 'PRs merged per active contributor in the last 7 days',
    colonyValue: weeklyPerContributor,
    unit: 'PRs/contributor',
    baseline: throughputBaseline,
    ratio: throughputRatio,
    verdict: throughputVerdict,
    summary: buildSummary(
      throughputVerdict,
      weeklyPerContributor !== null
        ? throughputBaseline.p50 / (throughputRatio ?? 1)
        : null,
      throughputBaseline,
      'PRs/contributor'
    ),
  };

  const dataNote =
    mergedPRs.length < 10
      ? `Based on ${mergedPRs.length} merged PR${mergedPRs.length !== 1 ? 's' : ''}. Medians stabilize above 30 samples — interpret with caution.`
      : `Based on ${mergedPRs.length} merged PRs and ${implementedProposals.length} implemented proposals.`;

  return {
    comparisons: [prCycleComparison, leadTimeComparison, throughputComparison],
    mergedPrCount: mergedPRs.length,
    implementedProposalCount: implementedProposals.length,
    dataNote,
  };
}
