import type { ActivityData, PullRequest, Proposal } from '../types/activity';

export interface VelocityMetrics {
  /** Median hours from PR creation to merge; null if no merged PRs */
  medianPrCycleHours: number | null;
  /** Median hours from proposal creation to implemented phase; null if none implemented */
  medianProposalToShipHours: number | null;
  /** Current number of open PRs */
  openPrCount: number;
  /** Number of PRs merged in the most recent 7-day window */
  weeklyMergedCount: number;
  /** Number of PRs merged in the preceding 7-day window (for trend) */
  previousWeekMergedCount: number;
  /** Ratio of governance time to total proposal-to-ship time; null if insufficient data */
  governanceOverheadRatio: number | null;
  /** Weekly merge counts for sparkline (oldest first), up to 8 weeks */
  weeklyMergeSeries: number[];
}

/**
 * Compute development velocity metrics from existing ActivityData.
 * Pure function — no side effects, no API calls.
 */
export function computeVelocityMetrics(data: ActivityData): VelocityMetrics {
  const now = new Date(data.generatedAt).getTime();
  const prs = data.pullRequests;
  const proposals = data.proposals;

  return {
    medianPrCycleHours: computeMedianPrCycleHours(prs),
    medianProposalToShipHours: computeMedianProposalToShipHours(proposals),
    openPrCount: prs.filter((pr) => pr.state === 'open').length,
    weeklyMergedCount: countMergedInWindow(prs, now, 7),
    previousWeekMergedCount: countMergedInWindow(prs, now - 7 * DAY_MS, 7),
    governanceOverheadRatio: computeGovernanceOverhead(proposals),
    weeklyMergeSeries: computeWeeklyMergeSeries(prs, now, 8),
  };
}

const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

function computeMedianPrCycleHours(prs: PullRequest[]): number | null {
  const durations: number[] = [];
  for (const pr of prs) {
    if (pr.state === 'merged' && pr.mergedAt) {
      const created = new Date(pr.createdAt).getTime();
      const merged = new Date(pr.mergedAt).getTime();
      const hours = (merged - created) / HOUR_MS;
      if (hours >= 0) durations.push(hours);
    }
  }
  return median(durations);
}

function computeMedianProposalToShipHours(
  proposals: Proposal[]
): number | null {
  const durations: number[] = [];
  for (const p of proposals) {
    if (p.phase !== 'implemented') continue;
    const transitions = p.phaseTransitions;
    if (!transitions) continue;

    const implementedTransition = transitions.find(
      (t) => t.phase === 'implemented'
    );
    if (!implementedTransition) continue;

    const created = new Date(p.createdAt).getTime();
    const implemented = new Date(implementedTransition.enteredAt).getTime();
    const hours = (implemented - created) / HOUR_MS;
    if (hours >= 0) durations.push(hours);
  }
  return median(durations);
}

function countMergedInWindow(
  prs: PullRequest[],
  windowEndMs: number,
  windowDays: number
): number {
  const windowStart = windowEndMs - windowDays * DAY_MS;
  let count = 0;
  for (const pr of prs) {
    if (pr.state === 'merged' && pr.mergedAt) {
      const merged = new Date(pr.mergedAt).getTime();
      if (merged >= windowStart && merged < windowEndMs) {
        count++;
      }
    }
  }
  return count;
}

function computeGovernanceOverhead(proposals: Proposal[]): number | null {
  const ratios: number[] = [];
  for (const p of proposals) {
    if (p.phase !== 'implemented') continue;
    const transitions = p.phaseTransitions;
    if (!transitions || transitions.length === 0) continue;

    const implementedTransition = transitions.find(
      (t) => t.phase === 'implemented'
    );
    const readyTransition = transitions.find(
      (t) => t.phase === 'ready-to-implement'
    );
    if (!implementedTransition || !readyTransition) continue;

    const created = new Date(p.createdAt).getTime();
    const ready = new Date(readyTransition.enteredAt).getTime();
    const implemented = new Date(implementedTransition.enteredAt).getTime();

    const totalTime = implemented - created;
    const governanceTime = ready - created;

    if (totalTime > 0 && governanceTime >= 0) {
      ratios.push(governanceTime / totalTime);
    }
  }
  return median(ratios);
}

function computeWeeklyMergeSeries(
  prs: PullRequest[],
  nowMs: number,
  weeks: number
): number[] {
  const series: number[] = new Array(weeks).fill(0);
  for (const pr of prs) {
    if (pr.state === 'merged' && pr.mergedAt) {
      const merged = new Date(pr.mergedAt).getTime();
      const weeksAgo = Math.floor((nowMs - merged) / (7 * DAY_MS));
      if (weeksAgo >= 0 && weeksAgo < weeks) {
        series[weeks - 1 - weeksAgo]++;
      }
    }
  }
  return series;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
