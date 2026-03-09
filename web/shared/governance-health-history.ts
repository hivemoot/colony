/**
 * Schema for governance-health-history.json — CHAOSS-aligned governance health
 * metrics accumulated over time by generate-data.ts.
 *
 * This schema is a frontend mirror of the types defined in generate-data.ts
 * (see GovernanceHealthEntry and GovernanceHealthHistory there). Keep in sync.
 */

export const GOVERNANCE_HEALTH_HISTORY_SCHEMA_VERSION = 1;

export interface CycleTimeMetric {
  p50: number | null;
  p95: number | null;
  sampleSize: number;
}

export interface RoleDiversityMetric {
  uniqueRoles: number;
  giniIndex: number;
  topRole: string;
  topRoleShare: number;
}

export interface ContestedRateMetric {
  contestedCount: number;
  totalVoted: number;
  rate: number;
}

export interface CrossRoleReviewMetric {
  crossRoleCount: number;
  totalReviews: number;
  rate: number;
}

/**
 * One periodic snapshot of CHAOSS-aligned governance health metrics.
 * Appended each time generate-data runs; history is capped at 90 entries.
 */
export interface GovernanceHealthEntry {
  timestamp: string;
  prCycleTime: CycleTimeMetric;
  roleDiversity: RoleDiversityMetric;
  contestedDecisionRate: ContestedRateMetric;
  crossRoleReviewRate: CrossRoleReviewMetric;
  warningCount: number;
}

/**
 * governance-health-history.json top-level artifact.
 */
export interface GovernanceHealthHistory {
  schemaVersion: number;
  generatedAt: string;
  /** Ordered oldest-to-newest, capped at ~90 entries (3 months of daily runs). */
  snapshots: GovernanceHealthEntry[];
}

/**
 * Parse and validate a raw JSON value as a GovernanceHealthHistory.
 * Returns null if the input is not a valid history artifact.
 */
export function parseGovernanceHealthHistory(
  raw: unknown
): GovernanceHealthHistory | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj['snapshots'])) return null;
  return raw as GovernanceHealthHistory;
}
