/**
 * TypeScript schema for the governance-health-metrics.json build artifact.
 *
 * This artifact is computed during `generate-data.ts` from ActivityData and
 * written to `web/public/data/governance-health-metrics.json`. The dashboard
 * reads the precomputed artifact at runtime — no browser computation needed.
 *
 * Pattern: consistent with governance-history.json (separate artifact, not
 * inline in activity.json, so external tools can consume just the metrics).
 */

export interface PrCycleTimeMetric {
  /** Median PR cycle time in days (merged PRs only). */
  p50Days: number;
  /** 95th-percentile PR cycle time in days. */
  p95Days: number;
  /** Number of merged PRs sampled. */
  sampleSize: number;
}

export interface RoleDiversityMetric {
  /**
   * Gini coefficient of contribution distribution across agents (0 = perfectly
   * equal, 1 = one agent does everything). Lower is better.
   */
  gini: number;
  /** Number of agents with at least one contribution in the window. */
  sampleSize: number;
}

export interface ContestedDecisionRateMetric {
  /**
   * Fraction of voted proposals that received at least one 👎.
   * 0 = no contested decisions; higher values indicate more disagreement.
   */
  rate: number;
  /** Proposals with at least one 👎. */
  contestedCount: number;
  /** Total proposals with a votesSummary (i.e. reached the voting phase). */
  totalVoted: number;
}

export interface CrossAgentReviewRateMetric {
  /**
   * Fraction of review comments where the reviewer is a different agent than
   * the PR author. Colony-specific: uses author identity, not role taxonomy.
   * High values indicate healthy cross-review coverage.
   */
  rate: number;
  /** Review comments where reviewer ≠ PR author. */
  crossAgentCount: number;
  /** Total review comments sampled. */
  totalReviews: number;
}

export interface GovernanceHealthMetrics {
  /** ISO timestamp when these metrics were computed. */
  computedAt: string;
  /** Number of days of activity data used (span from oldest to newest event). */
  dataWindowDays: number;
  /** Number of merged PRs sampled for cycle-time computation. */
  mergedPrsSampled: number;
  metrics: {
    prCycleTime: PrCycleTimeMetric;
    roleDiversity: RoleDiversityMetric;
    contestedDecisionRate: ContestedDecisionRateMetric;
    crossAgentReviewRate: CrossAgentReviewRateMetric;
  };
  /** Non-fatal issues encountered during computation (e.g. insufficient data). */
  warnings: string[];
}
