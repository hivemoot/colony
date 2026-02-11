import type { ActivityData, AgentStats, Proposal } from './types';

/**
 * A lightweight governance snapshot captured at each data refresh.
 * Stored in governance-history.json as an append-only log capped
 * at 30 days (120 entries at 6h intervals).
 */
export interface GovernanceSnapshot {
  timestamp: string;
  healthScore: number;
  participation: number;
  pipelineFlow: number;
  followThrough: number;
  consensusQuality: number;
  activeProposals: number;
  totalProposals: number;
  activeAgents: number;
  /** Proposals resolved per day (trailing 7d), null if insufficient data */
  proposalVelocity: number | null;
}

export const GOVERNANCE_HISTORY_SCHEMA_VERSION = 1;

export type GovernanceCompletenessStatus = 'complete' | 'partial';

export interface GovernanceHistoryProvenance {
  repositories: string[];
  generatedBy: string;
  generatorVersion: string;
  sourceCommitSha: string | null;
}

export interface GovernanceHistoryCompleteness {
  status: GovernanceCompletenessStatus;
  missingRepositories: string[];
  permissionGaps: string[];
  apiPartials: string[];
}

export interface GovernanceHistoryIntegrity {
  algorithm: 'sha256';
  digest: string;
}

export interface GovernanceHistoryArtifact {
  schemaVersion: number;
  generatedAt: string;
  snapshots: GovernanceSnapshot[];
  provenance: GovernanceHistoryProvenance;
  completeness: GovernanceHistoryCompleteness;
  integrity: GovernanceHistoryIntegrity | null;
}

interface BuildGovernanceHistoryArtifactInput {
  generatedAt: string;
  snapshots: GovernanceSnapshot[];
  repositories: string[];
  generatedBy: string;
  generatorVersion: string;
  sourceCommitSha?: string | null;
  missingRepositories?: string[];
  permissionGaps?: string[];
  apiPartials?: string[];
  schemaVersion?: number;
  integrity?: GovernanceHistoryIntegrity | null;
}

export function buildGovernanceHistoryArtifact({
  generatedAt,
  snapshots,
  repositories,
  generatedBy,
  generatorVersion,
  sourceCommitSha,
  missingRepositories = [],
  permissionGaps = [],
  apiPartials = [],
  schemaVersion = GOVERNANCE_HISTORY_SCHEMA_VERSION,
  integrity = null,
}: BuildGovernanceHistoryArtifactInput): GovernanceHistoryArtifact {
  const completenessStatus: GovernanceCompletenessStatus =
    missingRepositories.length > 0 ||
    permissionGaps.length > 0 ||
    apiPartials.length > 0
      ? 'partial'
      : 'complete';

  return {
    schemaVersion,
    generatedAt,
    snapshots: [...snapshots],
    provenance: {
      repositories: [...repositories],
      generatedBy,
      generatorVersion,
      sourceCommitSha: sourceCommitSha ?? null,
    },
    completeness: {
      status: completenessStatus,
      missingRepositories: [...missingRepositories],
      permissionGaps: [...permissionGaps],
      apiPartials: [...apiPartials],
    },
    integrity,
  };
}

export function serializeGovernanceHistoryForIntegrity(
  artifact:
    | GovernanceHistoryArtifact
    | Omit<GovernanceHistoryArtifact, 'integrity'>
): string {
  return JSON.stringify({
    schemaVersion: artifact.schemaVersion,
    generatedAt: artifact.generatedAt,
    snapshots: artifact.snapshots,
    provenance: artifact.provenance,
    completeness: artifact.completeness,
  });
}

export function parseGovernanceHistoryArtifact(
  raw: unknown
): GovernanceHistoryArtifact | null {
  if (isGovernanceSnapshotArray(raw)) {
    return buildGovernanceHistoryArtifact({
      schemaVersion: 0,
      generatedAt:
        raw.length > 0
          ? raw[raw.length - 1].timestamp
          : new Date(0).toISOString(),
      snapshots: raw,
      repositories: [],
      generatedBy: 'legacy-governance-history',
      generatorVersion: 'unknown',
      missingRepositories: [],
      permissionGaps: [
        'Legacy history format: provenance metadata unavailable',
      ],
      apiPartials: [],
      integrity: null,
    });
  }

  if (!isRecord(raw)) {
    return null;
  }

  const snapshots = raw.snapshots;
  if (!isGovernanceSnapshotArray(snapshots)) {
    return null;
  }

  const provenance = isRecord(raw.provenance) ? raw.provenance : {};
  const completeness = isRecord(raw.completeness) ? raw.completeness : {};
  const integrity = isRecord(raw.integrity) ? raw.integrity : null;

  const missingRepositories = readStringArray(completeness.missingRepositories);
  const permissionGaps = readStringArray(completeness.permissionGaps);
  const apiPartials = readStringArray(completeness.apiPartials);
  const explicitStatus =
    completeness.status === 'complete' || completeness.status === 'partial'
      ? completeness.status
      : null;

  const artifact = buildGovernanceHistoryArtifact({
    schemaVersion:
      typeof raw.schemaVersion === 'number'
        ? raw.schemaVersion
        : GOVERNANCE_HISTORY_SCHEMA_VERSION,
    generatedAt:
      typeof raw.generatedAt === 'string'
        ? raw.generatedAt
        : snapshots.length > 0
          ? snapshots[snapshots.length - 1].timestamp
          : new Date(0).toISOString(),
    snapshots,
    repositories: readStringArray(provenance.repositories),
    generatedBy:
      typeof provenance.generatedBy === 'string'
        ? provenance.generatedBy
        : 'unknown',
    generatorVersion:
      typeof provenance.generatorVersion === 'string'
        ? provenance.generatorVersion
        : 'unknown',
    sourceCommitSha:
      typeof provenance.sourceCommitSha === 'string'
        ? provenance.sourceCommitSha
        : null,
    missingRepositories,
    permissionGaps,
    apiPartials,
    integrity:
      integrity &&
      integrity.algorithm === 'sha256' &&
      typeof integrity.digest === 'string'
        ? {
            algorithm: 'sha256',
            digest: integrity.digest,
          }
        : null,
  });

  if (!explicitStatus) {
    return artifact;
  }

  return {
    ...artifact,
    completeness: {
      ...artifact.completeness,
      status: explicitStatus,
    },
  };
}

/** Maximum number of snapshots to retain (30 days at 6h intervals) */
export const MAX_HISTORY_ENTRIES = 120;

/**
 * Compute a governance snapshot from ActivityData.
 *
 * Replicates the core health score computation from the frontend
 * (src/utils/governance-health.ts) without importing from src/.
 * This keeps the shared/ directory self-contained and importable
 * by both the build script and the frontend.
 *
 * SYNC NOTE: If the scoring algorithm changes in governance-health.ts,
 * update the corresponding logic here to keep snapshots consistent.
 */
export function computeGovernanceSnapshot(
  data: ActivityData,
  timestamp?: string
): GovernanceSnapshot {
  const proposals = data.proposals;
  const pipeline = countPipeline(proposals);
  const activeAgents = data.agentStats.filter(
    (a) =>
      a.commits > 0 ||
      a.pullRequestsMerged > 0 ||
      a.reviews > 0 ||
      a.comments > 0
  ).length;

  const participation = computeParticipationScore(data.agentStats, proposals);
  const pipelineFlow = computePipelineFlowScore(pipeline, proposals.length);
  const followThrough = computeFollowThroughScore(pipeline);
  const consensusQuality = computeConsensusScore(proposals);

  const rawScore =
    participation + pipelineFlow + followThrough + consensusQuality;
  const healthScore = Math.round(rawScore / 5) * 5;

  const activeProposals =
    pipeline.discussion +
    pipeline.voting +
    pipeline.extendedVoting +
    pipeline.readyToImplement;

  return {
    timestamp: timestamp ?? new Date().toISOString(),
    healthScore,
    participation,
    pipelineFlow,
    followThrough,
    consensusQuality,
    activeProposals,
    totalProposals: proposals.length,
    activeAgents,
    proposalVelocity: computeVelocity(proposals),
  };
}

// --- Internal helpers ---

interface PipelineCounts {
  discussion: number;
  voting: number;
  extendedVoting: number;
  readyToImplement: number;
  implemented: number;
  rejected: number;
  inconclusive: number;
}

function countPipeline(proposals: Proposal[]): PipelineCounts {
  const c: PipelineCounts = {
    discussion: 0,
    voting: 0,
    extendedVoting: 0,
    readyToImplement: 0,
    implemented: 0,
    rejected: 0,
    inconclusive: 0,
  };
  for (const p of proposals) {
    switch (p.phase) {
      case 'discussion':
        c.discussion++;
        break;
      case 'voting':
        c.voting++;
        break;
      case 'extended-voting':
        c.extendedVoting++;
        break;
      case 'ready-to-implement':
        c.readyToImplement++;
        break;
      case 'implemented':
        c.implemented++;
        break;
      case 'rejected':
        c.rejected++;
        break;
      case 'inconclusive':
        c.inconclusive++;
        break;
    }
  }
  return c;
}

/** Participation sub-score (0-25): Gini-based distribution of activity */
function computeParticipationScore(
  agentStats: AgentStats[],
  proposals: Proposal[]
): number {
  const active = agentStats.filter(
    (a) =>
      a.commits > 0 ||
      a.pullRequestsMerged > 0 ||
      a.reviews > 0 ||
      a.comments > 0
  );
  if (active.length <= 1) return active.length === 0 ? 0 : 5;

  const proposalCounts = new Map<string, number>();
  for (const p of proposals) {
    proposalCounts.set(p.author, (proposalCounts.get(p.author) ?? 0) + 1);
  }

  const activities = active.map(
    (a) => (proposalCounts.get(a.login) ?? 0) + a.reviews + a.comments
  );

  const gini = computeGini(activities);
  return Math.round((1 - gini) * 25);
}

/** Pipeline flow sub-score (0-25): progression + completion rates */
function computePipelineFlowScore(
  pipeline: PipelineCounts,
  total: number
): number {
  if (total === 0) return 0;

  const advanced =
    pipeline.voting +
    pipeline.extendedVoting +
    pipeline.readyToImplement +
    pipeline.implemented +
    pipeline.rejected +
    pipeline.inconclusive;

  const terminal =
    pipeline.implemented + pipeline.rejected + pipeline.inconclusive;

  const progressionRate = advanced / total;
  const completionRate = terminal / total;

  const baseScore = Math.round(progressionRate * 15);
  const completionBonus = Math.round(completionRate * 10);

  return Math.min(25, baseScore + completionBonus);
}

/** Follow-through sub-score (0-25): implemented / approved ratio */
function computeFollowThroughScore(pipeline: PipelineCounts): number {
  const approved = pipeline.implemented + pipeline.readyToImplement;
  if (approved === 0) return 12;
  return Math.round((pipeline.implemented / approved) * 25);
}

/** Consensus quality sub-score (0-25): votes + diversity + discussion */
function computeConsensusScore(proposals: Proposal[]): number {
  if (proposals.length === 0) return 0;

  const voted = proposals.filter((p) => p.votesSummary);
  let voteScore = 0;
  if (voted.length > 0) {
    const avgVotes =
      voted.reduce((sum, p) => {
        const v = p.votesSummary;
        return sum + (v ? v.thumbsUp + v.thumbsDown : 0);
      }, 0) / voted.length;
    voteScore = Math.min(10, Math.round((avgVotes / 4) * 10));
  }

  const terminal = proposals.filter((p) =>
    ['implemented', 'rejected', 'inconclusive'].includes(p.phase)
  );
  let diversityScore = 0;
  if (terminal.length > 0) {
    const nonImpl = terminal.filter(
      (p) => p.phase === 'rejected' || p.phase === 'inconclusive'
    ).length;
    const rate = nonImpl / terminal.length;
    if (rate >= 0.1 && rate <= 0.4) diversityScore = 5;
    else if ((rate > 0 && rate < 0.1) || (rate > 0.4 && rate <= 0.6))
      diversityScore = 3;
    else if (rate === 0) diversityScore = 1;
  }

  const avgComments =
    proposals.reduce((sum, p) => sum + p.commentCount, 0) / proposals.length;
  const discussionScore = Math.min(10, Math.round((avgComments / 5) * 10));

  return Math.min(25, voteScore + diversityScore + discussionScore);
}

/** Gini coefficient for distribution analysis. Returns 0-1. */
function computeGini(values: number[]): number {
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

/**
 * Proposals resolved per day over the trailing 7 days.
 * "Resolved" = implemented, rejected, or inconclusive.
 * Returns null if there are no phase transitions to measure from.
 */
function computeVelocity(proposals: Proposal[]): number | null {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const resolved = proposals.filter((p) =>
    ['implemented', 'rejected', 'inconclusive'].includes(p.phase)
  );

  if (resolved.length === 0) return null;

  // Count proposals that reached terminal phase in the last 7 days.
  // Use phaseTransitions if available, otherwise fall back to createdAt
  // as a rough proxy (less accurate but available for all proposals).
  let recentlyResolved = 0;
  for (const p of resolved) {
    const transitions = p.phaseTransitions;
    if (transitions && transitions.length > 0) {
      const lastTransition = transitions[transitions.length - 1];
      if (new Date(lastTransition.enteredAt).getTime() >= sevenDaysAgo) {
        recentlyResolved++;
      }
    }
  }

  // Velocity = resolved proposals / 7 days
  return Math.round((recentlyResolved / 7) * 100) / 100;
}

/**
 * Append a snapshot to history, enforcing the max entry cap.
 * Returns the updated history array.
 */
export function appendSnapshot(
  history: GovernanceSnapshot[],
  snapshot: GovernanceSnapshot
): GovernanceSnapshot[] {
  const updated = [...history, snapshot];
  // Cap at MAX_HISTORY_ENTRIES, dropping oldest first
  if (updated.length > MAX_HISTORY_ENTRIES) {
    return updated.slice(updated.length - MAX_HISTORY_ENTRIES);
  }
  return updated;
}

function isGovernanceSnapshotArray(
  value: unknown
): value is GovernanceSnapshot[] {
  return Array.isArray(value) && value.every(isGovernanceSnapshot);
}

function isGovernanceSnapshot(value: unknown): value is GovernanceSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.timestamp === 'string' &&
    typeof value.healthScore === 'number' &&
    typeof value.participation === 'number' &&
    typeof value.pipelineFlow === 'number' &&
    typeof value.followThrough === 'number' &&
    typeof value.consensusQuality === 'number' &&
    typeof value.activeProposals === 'number' &&
    typeof value.totalProposals === 'number' &&
    typeof value.activeAgents === 'number' &&
    (typeof value.proposalVelocity === 'number' ||
      value.proposalVelocity === null)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
