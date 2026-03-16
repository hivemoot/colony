/**
 * Schema for governance-health-history.json — CHAOSS-aligned governance health
 * metrics accumulated over time by generate-data.ts.
 *
 * This schema is a frontend mirror of GovernanceHealthEntry in generate-data.ts
 * (introduced in PR #673). Keep in sync.
 *
 * The flat `metrics.*` structure matches the shape written by
 * buildGovernanceHealthEntry in generate-data.ts. Do not re-nest — the
 * history file would be unreadable by this schema.
 */

export const GOVERNANCE_HEALTH_HISTORY_SCHEMA_VERSION = 1;

/**
 * One periodic snapshot of CHAOSS-aligned governance health metrics.
 * Appended each time generate-data runs; history is capped at 90 entries.
 *
 * All time values are in hours. Rate values are 0–1. Null means insufficient
 * data in the measurement window (e.g. no PRs merged → no cycle time).
 */
export interface GovernanceHealthEntry {
  timestamp: string;
  metrics: {
    prCycleTimeP50Hours: number | null;
    prCycleTimeP95Hours: number | null;
    prCycleTimeSampleSize: number;
    reviewLatencyP50Hours: number | null;
    reviewLatencyP95Hours: number | null;
    reviewLatencySampleSize: number;
    mergeLatencyP50Hours: number | null;
    mergeLatencyP95Hours: number | null;
    mergeLatencySampleSize: number;
    mergeBacklogDepth: number;
    roleDiversityGini: number;
    roleDiversityUniqueRoles: number;
    contestedDecisionRate: number | null;
    crossRoleReviewRate: number | null;
    voterParticipationRate: number | null;
  };
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
