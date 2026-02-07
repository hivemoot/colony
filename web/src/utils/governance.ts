import type { ActivityData, AgentStats, Proposal } from '../types/activity';

export interface ProposalPipelineCounts {
  discussion: number;
  voting: number;
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

export interface GovernanceMetrics {
  totalProposals: number;
  /** implemented / (implemented + rejected); null when no decided proposals exist */
  successRate: number | null;
  activeProposals: number;
  avgComments: number;
  pipeline: ProposalPipelineCounts;
  agentRoles: AgentRoleProfile[];
  topProposers: Array<{ login: string; count: number }>;
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

  const decided = pipeline.implemented + pipeline.rejected;
  const successRate = decided > 0 ? pipeline.implemented / decided : null;

  const totalComments = proposals.reduce((sum, p) => sum + p.commentCount, 0);
  const avgComments =
    proposals.length > 0 ? totalComments / proposals.length : 0;

  const activeProposals =
    pipeline.discussion + pipeline.voting + pipeline.readyToImplement;

  return {
    totalProposals: pipeline.total,
    successRate,
    activeProposals,
    avgComments,
    pipeline,
    agentRoles,
    topProposers,
  };
}

export function computePipeline(proposals: Proposal[]): ProposalPipelineCounts {
  const counts: ProposalPipelineCounts = {
    discussion: 0,
    voting: 0,
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
