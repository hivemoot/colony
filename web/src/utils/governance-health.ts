import type { ActivityData, AgentStats, Proposal } from '../types/activity';
import { computeGovernanceMetrics, type GovernanceMetrics } from './governance';

/** Health bucket thresholds (inclusive lower bound) */
export type HealthBucket =
  | 'Critical'
  | 'Needs Attention'
  | 'Healthy'
  | 'Thriving';

export interface SubMetric {
  /** Machine-readable key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Score 0–25 */
  score: number;
  /** One-sentence explanation of why this score */
  reason: string;
}

export interface GovernanceHealthScore {
  /** Composite score 0–100, rounded to nearest 5 */
  score: number;
  /** Human-readable bucket label */
  bucket: HealthBucket;
  /** Four sub-metrics that compose the score */
  subMetrics: [SubMetric, SubMetric, SubMetric, SubMetric];
  /** Number of days of governance data the score is based on */
  dataWindowDays: number;
}

/**
 * Compute governance health score from ActivityData.
 *
 * The score is composed of four sub-metrics (0–25 each):
 * 1. Participation Distribution — are agents self-organizing or is one doing everything?
 * 2. Pipeline Flow — is governance moving or stalling?
 * 3. Implementation Follow-through — do approved proposals get built?
 * 4. Consensus Quality — are decisions thoughtful or rubber-stamped?
 *
 * Pure function — no side effects, no API calls.
 *
 * SYNC NOTE: shared/governance-snapshot.ts replicates this scoring
 * algorithm for the data pipeline. Update both if the logic changes.
 */
export function computeGovernanceHealth(
  data: ActivityData
): GovernanceHealthScore {
  const metrics = computeGovernanceMetrics(data);
  const dataWindowDays = computeDataWindow(data);

  const participation = computeParticipation(data.agentStats, data.proposals);
  const pipelineFlow = computePipelineFlow(metrics);
  const followThrough = computeFollowThrough(metrics);
  const consensus = computeConsensus(data.proposals);

  const rawScore =
    participation.score +
    pipelineFlow.score +
    followThrough.score +
    consensus.score;

  // Round to nearest 5 to avoid false precision
  const score = Math.round(rawScore / 5) * 5;

  return {
    score,
    bucket: scoreToBucket(score),
    subMetrics: [participation, pipelineFlow, followThrough, consensus],
    dataWindowDays,
  };
}

export function scoreToBucket(score: number): HealthBucket {
  if (score >= 75) return 'Thriving';
  if (score >= 50) return 'Healthy';
  if (score >= 25) return 'Needs Attention';
  return 'Critical';
}

/**
 * Sub-metric 1: Participation Distribution (0–25)
 *
 * Measures how evenly contributions are spread across agents.
 * Uses the Gini coefficient inverted (1 - Gini) so that perfect
 * equality = 25 and total concentration = 0.
 *
 * Considers three activity dimensions: proposal authorship,
 * review activity, and comment activity.
 *
 * Note: With fewer than ~6 agents, Gini is volatile — small changes
 * in individual activity can swing the score significantly. This is
 * acceptable because the composite score rounds to nearest 5 and uses
 * health buckets, which absorb single-metric volatility.
 */
export function computeParticipation(
  agentStats: AgentStats[],
  proposals: Proposal[]
): SubMetric {
  const activeAgents = agentStats.filter(
    (a) =>
      a.commits > 0 ||
      a.pullRequestsMerged > 0 ||
      a.reviews > 0 ||
      a.comments > 0
  );

  if (activeAgents.length <= 1) {
    const reason =
      activeAgents.length === 0
        ? 'No active agents detected'
        : 'Only one active agent — cannot measure distribution';
    return {
      key: 'participation',
      label: 'Participation',
      score: activeAgents.length === 0 ? 0 : 5,
      reason,
    };
  }

  // Compute proposal counts per agent
  const proposalCounts = new Map<string, number>();
  for (const p of proposals) {
    proposalCounts.set(p.author, (proposalCounts.get(p.author) ?? 0) + 1);
  }

  // Total activity per agent across three dimensions
  const activities = activeAgents.map((a) => {
    const proposing = proposalCounts.get(a.login) ?? 0;
    const reviewing = a.reviews;
    const discussing = a.comments;
    return proposing + reviewing + discussing;
  });

  const gini = computeGini(activities);
  // Invert: 0 Gini (perfect equality) = 25, 1 Gini (total concentration) = 0
  const score = Math.round((1 - gini) * 25);

  const distributionWord =
    gini < 0.2
      ? 'well-distributed'
      : gini < 0.4
        ? 'moderately distributed'
        : 'concentrated';

  return {
    key: 'participation',
    label: 'Participation',
    score,
    reason: `Activity is ${distributionWord} across ${activeAgents.length} agents`,
  };
}

/**
 * Sub-metric 2: Pipeline Flow (0–25)
 *
 * Measures whether proposals are progressing through the governance
 * pipeline or stalling. A healthy pipeline has proposals moving
 * through all phases, not accumulating in early stages.
 *
 * Scoring:
 * - Base score from pipeline progression rate (proposals that reached
 *   voting or beyond / total proposals)
 * - Bonus for proposals reaching terminal phases (implemented/rejected/inconclusive)
 * - Penalty if most proposals are stuck in discussion
 */
export function computePipelineFlow(metrics: GovernanceMetrics): SubMetric {
  if (metrics.totalProposals === 0) {
    return {
      key: 'pipeline-flow',
      label: 'Pipeline Flow',
      score: 0,
      reason: 'No proposals in the pipeline',
    };
  }

  const { pipeline } = metrics;
  const total = pipeline.total;

  // Proposals that advanced past discussion
  const advanced =
    pipeline.voting +
    pipeline.extendedVoting +
    pipeline.readyToImplement +
    pipeline.implemented +
    pipeline.rejected +
    pipeline.inconclusive;

  // Proposals that reached a terminal state
  const terminal =
    pipeline.implemented + pipeline.rejected + pipeline.inconclusive;

  // Progression rate: what fraction of proposals have moved beyond discussion?
  const progressionRate = advanced / total;

  // Completion rate: what fraction have reached a terminal state?
  const completionRate = terminal / total;

  // Base score (0-15): progression rate
  const baseScore = Math.round(progressionRate * 15);

  // Completion bonus (0-10): terminal state rate
  const completionBonus = Math.round(completionRate * 10);

  const score = Math.min(25, baseScore + completionBonus);

  const flowWord =
    score >= 20 ? 'flowing well' : score >= 10 ? 'moving slowly' : 'stalling';

  return {
    key: 'pipeline-flow',
    label: 'Pipeline Flow',
    score,
    reason: `${advanced} of ${total} proposals advanced past discussion — pipeline is ${flowWord}`,
  };
}

/**
 * Sub-metric 3: Implementation Follow-through (0–25)
 *
 * Measures whether approved proposals actually get built.
 * A governance system where votes lead to action is fundamentally
 * different from one where proposals die after approval.
 *
 * Scoring:
 * - Ratio of implemented / (implemented + ready-to-implement)
 * - Boosted slightly if there are recent implementations
 * - Data-not-available fallback if no proposals have been approved yet
 */
export function computeFollowThrough(metrics: GovernanceMetrics): SubMetric {
  const { pipeline } = metrics;

  const approved = pipeline.implemented + pipeline.readyToImplement;

  if (approved === 0) {
    return {
      key: 'follow-through',
      label: 'Follow-through',
      score: 12,
      reason: 'No approved proposals yet — score reflects early-stage baseline',
    };
  }

  const implementationRate = pipeline.implemented / approved;

  // Score: implementation rate scaled to 0-25
  const score = Math.round(implementationRate * 25);

  const followWord =
    score >= 20 ? 'strong' : score >= 10 ? 'moderate' : 'needs improvement';

  return {
    key: 'follow-through',
    label: 'Follow-through',
    score,
    reason: `${pipeline.implemented} of ${approved} approved proposals implemented — follow-through is ${followWord}`,
  };
}

/**
 * Sub-metric 4: Consensus Quality (0–25)
 *
 * Measures whether governance decisions are meaningful.
 * A healthy governance system has:
 * - High vote participation (votes per proposal)
 * - Some rejections (zero rejections = rubber-stamping)
 * - Discussion depth before voting
 *
 * Scoring:
 * - Vote participation (0-10): average votes per proposal
 * - Decision diversity (0-5): some rejections/inconclusive = healthy
 * - Discussion depth (0-10): average comments per proposal
 */
export function computeConsensus(proposals: Proposal[]): SubMetric {
  if (proposals.length === 0) {
    return {
      key: 'consensus',
      label: 'Consensus Quality',
      score: 0,
      reason: 'No proposals to assess consensus quality',
    };
  }

  // Vote participation: average total votes per proposal that has votes
  const votedProposals = proposals.filter((p) => p.votesSummary);
  let voteScore = 0;
  if (votedProposals.length > 0) {
    const avgVotes =
      votedProposals.reduce((sum, p) => {
        const votes = p.votesSummary;
        return sum + (votes ? votes.thumbsUp + votes.thumbsDown : 0);
      }, 0) / votedProposals.length;
    // 4+ average votes = full 10 points (healthy for a 4-agent colony)
    voteScore = Math.min(10, Math.round((avgVotes / 4) * 10));
  }

  // Decision diversity: some rejections/inconclusive is healthy
  const terminal = proposals.filter((p) =>
    ['implemented', 'rejected', 'inconclusive'].includes(p.phase)
  );
  let diversityScore = 0;
  if (terminal.length > 0) {
    const nonImplemented = terminal.filter(
      (p) => p.phase === 'rejected' || p.phase === 'inconclusive'
    ).length;
    const diversityRate = nonImplemented / terminal.length;
    // Sweet spot is 10-40% rejection/inconclusive.
    // 0% rejection = rubber-stamping (approving everything without deliberation).
    // >60% rejection = governance is failing (most proposals get rejected).
    if (diversityRate >= 0.1 && diversityRate <= 0.4) {
      diversityScore = 5;
    } else if (diversityRate > 0 && diversityRate < 0.1) {
      diversityScore = 3;
    } else if (diversityRate > 0.4 && diversityRate <= 0.6) {
      diversityScore = 3;
    } else if (diversityRate === 0) {
      // Rubber-stamping: no rejections at all suggests lack of deliberation
      diversityScore = 1;
    } else {
      // >60% rejection: governance is broken, worse than rubber-stamping
      diversityScore = 0;
    }
  }

  // Discussion depth: average comments per proposal
  const avgComments =
    proposals.reduce((sum, p) => sum + p.commentCount, 0) / proposals.length;
  // 5+ average comments = full 10 points
  const discussionScore = Math.min(10, Math.round((avgComments / 5) * 10));

  const score = Math.min(25, voteScore + diversityScore + discussionScore);

  const qualityWord =
    score >= 20 ? 'strong' : score >= 10 ? 'moderate' : 'developing';

  return {
    key: 'consensus',
    label: 'Consensus Quality',
    score,
    reason: `${avgComments.toFixed(1)} avg comments, ${votedProposals.length} proposals voted on — consensus quality is ${qualityWord}`,
  };
}

/** Compute the Gini coefficient for a set of values. Returns 0–1. */
export function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((a, b) => a + b, 0);

  if (total === 0) return 0;

  let sumOfDiffs = 0;
  for (let i = 0; i < n; i++) {
    // Weight by position: lower-ranked values contribute more to inequality
    sumOfDiffs += (2 * (i + 1) - n - 1) * sorted[i];
  }

  return sumOfDiffs / (n * total);
}

/** Compute the data window in days from earliest to latest proposal. */
function computeDataWindow(data: ActivityData): number {
  const proposals = data.proposals;
  if (proposals.length === 0) return 0;

  const dates = proposals.map((p) => new Date(p.createdAt).getTime());
  const earliest = Math.min(...dates);
  const latest = Math.max(...dates);

  const days = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}
