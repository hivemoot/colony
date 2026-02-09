import type { ActivityData, AgentStats, Proposal } from '../types/activity';

export interface ProposalPipelineCounts {
  discussion: number;
  voting: number;
  extendedVoting: number;
  readyToImplement: number;
  implemented: number;
  rejected: number;
  inconclusive: number;
  total: number;
}

export type AgentRole = 'coder' | 'reviewer' | 'proposer' | 'discussant';

export interface AgentRoleProfile {
  login: string;
  avatarUrl?: string;
  /** null when the agent has zero activity across all categories */
  primaryRole: AgentRole | null;
  /** Scores normalized 0–1 within this agent's own activities */
  scores: Record<AgentRole, number>;
}

export interface ThroughputMetrics {
  /** Median hours from discussion start to voting start; null if no proposals have transitioned */
  medianDiscussionHours: number | null;
  /** Median hours from voting start to terminal phase; null if no proposals have resolved from voting */
  medianVotingHours: number | null;
  /** Median hours from proposal creation to terminal phase; null if no resolved proposals */
  medianCycleHours: number | null;
  /** Number of proposals that reached a terminal phase */
  resolvedCount: number;
  /** Number of proposals still in active phases */
  activeCount: number;
}

export interface GovernanceMetrics {
  totalProposals: number;
  /** implemented / (implemented + rejected); null when no decided proposals exist */
  successRate: number | null;
  activeProposals: number;
  avgComments: number;
  pipeline: ProposalPipelineCounts;
  agentRoles: AgentRoleProfile[];
  topProposers: Array<{ login: string; count: number }>;
  throughput: ThroughputMetrics;
}

/**
 * Compute governance analytics from existing ActivityData.
 * All computation is pure — no side effects, no API calls.
 */
export function computeGovernanceMetrics(
  data: ActivityData
): GovernanceMetrics {
  const proposals = data.proposals;
  const pipeline = computePipeline(proposals);
  const agentRoles = computeAgentRoles(data.agentStats, proposals);
  const topProposers = computeTopProposers(proposals);

  const decided =
    pipeline.implemented + pipeline.rejected + pipeline.inconclusive;
  const successRate = decided > 0 ? pipeline.implemented / decided : null;

  const totalComments = proposals.reduce((sum, p) => sum + p.commentCount, 0);
  const avgComments =
    proposals.length > 0 ? totalComments / proposals.length : 0;

  const activeProposals =
    pipeline.discussion +
    pipeline.voting +
    pipeline.extendedVoting +
    pipeline.readyToImplement;

  const throughput = computeThroughput(proposals);

  return {
    totalProposals: pipeline.total,
    successRate,
    activeProposals,
    avgComments,
    pipeline,
    agentRoles,
    topProposers,
    throughput,
  };
}

export function computePipeline(proposals: Proposal[]): ProposalPipelineCounts {
  const counts: ProposalPipelineCounts = {
    discussion: 0,
    voting: 0,
    extendedVoting: 0,
    readyToImplement: 0,
    implemented: 0,
    rejected: 0,
    inconclusive: 0,
    total: proposals.length,
  };

  for (const p of proposals) {
    switch (p.phase) {
      case 'discussion':
        counts.discussion++;
        break;
      case 'voting':
        counts.voting++;
        break;
      case 'extended-voting':
        counts.extendedVoting++;
        break;
      case 'ready-to-implement':
        counts.readyToImplement++;
        break;
      case 'implemented':
        counts.implemented++;
        break;
      case 'rejected':
        counts.rejected++;
        break;
      case 'inconclusive':
        counts.inconclusive++;
        break;
    }
  }

  return counts;
}

/**
 * Classify each agent by their dominant activity type.
 *
 * Scoring uses raw counts from AgentStats plus proposal authorship.
 * Each agent's scores are normalized relative to their own maximum
 * so the role reflects their personal emphasis, not absolute volume.
 */
export function computeAgentRoles(
  agentStats: AgentStats[],
  proposals: Proposal[]
): AgentRoleProfile[] {
  // Count proposals per author
  const proposalCounts = new Map<string, number>();
  for (const p of proposals) {
    proposalCounts.set(p.author, (proposalCounts.get(p.author) ?? 0) + 1);
  }

  return agentStats.map((agent) => {
    const coderScore = agent.commits + agent.pullRequestsMerged;
    const reviewerScore = agent.reviews;
    const proposerScore = proposalCounts.get(agent.login) ?? 0;
    const discussantScore = agent.comments;

    const rawMax = Math.max(
      coderScore,
      reviewerScore,
      proposerScore,
      discussantScore
    );
    const maxScore = Math.max(rawMax, 1); // avoid division by zero

    const scores: Record<AgentRole, number> = {
      coder: coderScore / maxScore,
      reviewer: reviewerScore / maxScore,
      proposer: proposerScore / maxScore,
      discussant: discussantScore / maxScore,
    };

    // Agents with zero activity across all categories have no meaningful role
    const primaryRole: AgentRole | null =
      rawMax === 0
        ? null
        : ((Object.entries(scores) as Array<[AgentRole, number]>).reduce(
            (best, [role, score]) => (score > best[1] ? [role, score] : best)
          )[0] as AgentRole);

    return {
      login: agent.login,
      avatarUrl: agent.avatarUrl,
      primaryRole,
      scores,
    };
  });
}

export function computeTopProposers(
  proposals: Proposal[]
): Array<{ login: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of proposals) {
    counts.set(p.author, (counts.get(p.author) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count);
}

const TERMINAL_PHASES = new Set([
  'ready-to-implement',
  'implemented',
  'rejected',
  'inconclusive',
]);

const ACTIVE_PHASES = new Set(['discussion', 'voting', 'extended-voting']);

/**
 * Compute governance throughput from proposal phase transitions.
 *
 * Derives median durations for each governance stage by measuring
 * the time between phase transition timestamps. Uses median (not mean)
 * to resist outlier proposals that stall or get extended voting.
 */
export function computeThroughput(proposals: Proposal[]): ThroughputMetrics {
  const discussionDurations: number[] = [];
  const votingDurations: number[] = [];
  const cycleDurations: number[] = [];

  let resolvedCount = 0;
  let activeCount = 0;

  for (const p of proposals) {
    if (ACTIVE_PHASES.has(p.phase)) {
      activeCount++;
    }

    const transitions = p.phaseTransitions;
    if (!transitions || transitions.length === 0) continue;

    const phaseTimestamps = new Map<string, number>();
    for (const t of transitions) {
      // Keep the earliest timestamp for each phase
      if (!phaseTimestamps.has(t.phase)) {
        phaseTimestamps.set(t.phase, new Date(t.enteredAt).getTime());
      }
    }

    const discussionStart = phaseTimestamps.get('discussion');
    const votingStart =
      phaseTimestamps.get('voting') ?? phaseTimestamps.get('extended-voting');

    // Find the terminal phase timestamp
    let terminalTime: number | undefined;
    for (const t of transitions) {
      if (TERMINAL_PHASES.has(t.phase)) {
        terminalTime = new Date(t.enteredAt).getTime();
        break;
      }
    }

    if (discussionStart !== undefined && votingStart !== undefined) {
      const hours = (votingStart - discussionStart) / (1000 * 60 * 60);
      if (hours >= 0) discussionDurations.push(hours);
    }

    if (votingStart !== undefined && terminalTime !== undefined) {
      const hours = (terminalTime - votingStart) / (1000 * 60 * 60);
      if (hours >= 0) votingDurations.push(hours);
    }

    if (terminalTime !== undefined) {
      resolvedCount++;
      const createdTime = new Date(p.createdAt).getTime();
      const hours = (terminalTime - createdTime) / (1000 * 60 * 60);
      if (hours >= 0) cycleDurations.push(hours);
    }
  }

  return {
    medianDiscussionHours: median(discussionDurations),
    medianVotingHours: median(votingDurations),
    medianCycleHours: median(cycleDurations),
    resolvedCount,
    activeCount,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
