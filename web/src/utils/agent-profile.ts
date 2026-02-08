import type {
  ActivityData,
  AgentStats,
  Proposal,
  Commit,
  PullRequest,
  Comment,
} from '../types/activity';
import { computeAgentRoles, type AgentRoleProfile } from './governance';

export interface AgentProfileData {
  login: string;
  avatarUrl?: string;
  stats: AgentStats;
  roleProfile: AgentRoleProfile;
  /** ISO timestamp of the agent's earliest activity */
  activeSince: string | null;
  proposals: Proposal[];
  recentCommits: Commit[];
  recentPRs: PullRequest[];
  recentComments: Comment[];
  /** Agents this agent has interacted with, sorted by interaction count */
  collaborators: Array<{ login: string; interactions: number }>;
}

/**
 * Build a complete profile for a single agent from existing ActivityData.
 * All computation is pure — no API calls, no side effects.
 */
export function computeAgentProfile(
  data: ActivityData,
  login: string
): AgentProfileData | null {
  const stats = data.agentStats.find((a) => a.login === login);
  if (!stats) return null;

  const roleProfiles = computeAgentRoles(data.agentStats, data.proposals);
  const roleProfile = roleProfiles.find((r) => r.login === login) ?? {
    login,
    primaryRole: null,
    scores: { coder: 0, reviewer: 0, proposer: 0, discussant: 0 },
  };

  const proposals = data.proposals.filter((p) => p.author === login);
  const recentCommits = data.commits.filter((c) => c.author === login);
  const recentPRs = data.pullRequests.filter((pr) => pr.author === login);
  const recentComments = data.comments.filter((c) => c.author === login);

  const activeSince = computeActiveSince(
    recentCommits,
    recentPRs,
    recentComments,
    proposals
  );

  const collaborators = computeCollaborators(data, login);

  return {
    login,
    avatarUrl: stats.avatarUrl,
    stats,
    roleProfile,
    activeSince,
    proposals,
    recentCommits,
    recentPRs,
    recentComments,
    collaborators,
  };
}

/**
 * Find the earliest timestamp across all activity types for an agent.
 */
function computeActiveSince(
  commits: Commit[],
  prs: PullRequest[],
  comments: Comment[],
  proposals: Proposal[]
): string | null {
  const timestamps: string[] = [
    ...commits.map((c) => c.date),
    ...prs.map((pr) => pr.createdAt),
    ...comments.map((c) => c.createdAt),
    ...proposals.map((p) => p.createdAt),
  ];

  if (timestamps.length === 0) return null;

  return timestamps.reduce((earliest, ts) => (ts < earliest ? ts : earliest));
}

/**
 * Compute collaboration strength between the target agent and others.
 * Interaction = commenting on the same issue/PR or reviewing each other's PRs.
 */
function computeCollaborators(
  data: ActivityData,
  login: string
): Array<{ login: string; interactions: number }> {
  const interactionCounts = new Map<string, number>();

  // Find issues/PRs the agent authored, count other agents who commented
  const agentIssueNumbers = new Set<number>();
  for (const pr of data.pullRequests) {
    if (pr.author === login) agentIssueNumbers.add(pr.number);
  }
  for (const issue of data.issues) {
    if (issue.author === login) agentIssueNumbers.add(issue.number);
  }
  for (const proposal of data.proposals) {
    if (proposal.author === login) agentIssueNumbers.add(proposal.number);
  }

  for (const comment of data.comments) {
    if (comment.author === login) continue;
    if (agentIssueNumbers.has(comment.issueOrPrNumber)) {
      const count = interactionCounts.get(comment.author) ?? 0;
      interactionCounts.set(comment.author, count + 1);
    }
  }

  // Find issues/PRs others authored where this agent commented
  const agentCommentedOn = new Set<number>();
  for (const comment of data.comments) {
    if (comment.author === login) {
      agentCommentedOn.add(comment.issueOrPrNumber);
    }
  }

  for (const comment of data.comments) {
    if (comment.author === login) continue;
    if (agentCommentedOn.has(comment.issueOrPrNumber)) {
      const count = interactionCounts.get(comment.author) ?? 0;
      interactionCounts.set(comment.author, count + 1);
    }
  }

  return [...interactionCounts.entries()]
    .map(([collaborator, interactions]) => ({
      login: collaborator,
      interactions,
    }))
    .sort((a, b) => b.interactions - a.interactions);
}
