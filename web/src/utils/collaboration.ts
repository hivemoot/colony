import type { ActivityData } from '../types/activity';

export type CollaborationEdgeType =
  | 'review'
  | 'co-discussion'
  | 'implementation';

export interface CollaborationEdge {
  from: string;
  to: string;
  type: CollaborationEdgeType;
  weight: number;
}

export interface AgentPairSummary {
  from: string;
  to: string;
  review: number;
  coDiscussion: number;
  implementation: number;
  total: number;
}

export interface CollaborationNetwork {
  agents: string[];
  edges: AgentPairSummary[];
  /** Lookup: "from→to" => AgentPairSummary */
  matrix: Map<string, AgentPairSummary>;
  totalInteractions: number;
}

/**
 * Compute a collaboration network from existing activity data.
 *
 * Extracts three types of directed interactions:
 * - review: agent A reviewed agent B's PR
 * - co-discussion: agents participated in the same issue/PR thread
 * - implementation: agent A's PR implements agent B's proposal
 *
 * No pipeline changes required — all signals come from ActivityData.
 */
export function computeCollaborationNetwork(
  data: ActivityData
): CollaborationNetwork {
  const edgeMap = new Map<
    string,
    { review: number; coDiscussion: number; implementation: number }
  >();
  const agentSet = new Set<string>();

  // Collect all agents from agentStats (only active agents appear in the network)
  for (const agent of data.agentStats) {
    agentSet.add(agent.login);
  }

  const agents = [...agentSet].sort();

  // Helper to accumulate an edge
  function addEdge(
    from: string,
    to: string,
    type: CollaborationEdgeType
  ): void {
    if (from === to) return; // self-interactions are not collaboration
    if (!agentSet.has(from) || !agentSet.has(to)) return;
    const key = `${from}\u2192${to}`;
    const existing = edgeMap.get(key) ?? {
      review: 0,
      coDiscussion: 0,
      implementation: 0,
    };
    existing[type === 'co-discussion' ? 'coDiscussion' : type]++;
    edgeMap.set(key, existing);
  }

  // Build a map of PR number → author for review edge resolution
  const prAuthors = new Map<number, string>();
  for (const pr of data.pullRequests) {
    prAuthors.set(pr.number, pr.author);
  }

  // Also index proposal authors by number
  const proposalAuthors = new Map<number, string>();
  for (const proposal of data.proposals) {
    proposalAuthors.set(proposal.number, proposal.author);
  }

  // 1. Review edges: reviewer → PR author
  for (const comment of data.comments) {
    if (comment.type !== 'review') continue;
    const prAuthor = prAuthors.get(comment.issueOrPrNumber);
    if (prAuthor) {
      addEdge(comment.author, prAuthor, 'review');
    }
  }

  // 2. Co-discussion edges: group comments by issue/PR, create edges between participants
  const threadParticipants = new Map<number, Set<string>>();
  for (const comment of data.comments) {
    const participants =
      threadParticipants.get(comment.issueOrPrNumber) ?? new Set();
    participants.add(comment.author);
    threadParticipants.set(comment.issueOrPrNumber, participants);
  }

  for (const participants of threadParticipants.values()) {
    const sorted = [...participants].filter((a) => agentSet.has(a)).sort();
    // Create undirected co-discussion edges (both directions)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        addEdge(sorted[i], sorted[j], 'co-discussion');
        addEdge(sorted[j], sorted[i], 'co-discussion');
      }
    }
  }

  // 3. Implementation edges: PR author → proposal author (when PR closes a proposal)
  // Detect by matching PR titles that reference issue numbers (common pattern: "... (#N)" or "Fixes #N")
  for (const pr of data.pullRequests) {
    const matches = pr.title.match(/#(\d+)/g);
    if (!matches) continue;
    for (const match of matches) {
      const issueNum = parseInt(match.slice(1), 10);
      const proposalAuthor = proposalAuthors.get(issueNum);
      if (proposalAuthor && proposalAuthor !== pr.author) {
        addEdge(pr.author, proposalAuthor, 'implementation');
      }
    }
  }

  // Build the result
  const edges: AgentPairSummary[] = [];
  let totalInteractions = 0;
  const matrix = new Map<string, AgentPairSummary>();

  for (const [key, counts] of edgeMap) {
    const [from, to] = key.split('\u2192');
    const total = counts.review + counts.coDiscussion + counts.implementation;
    const summary: AgentPairSummary = { from, to, ...counts, total };
    edges.push(summary);
    matrix.set(key, summary);
    totalInteractions += total;
  }

  return { agents, edges, matrix, totalInteractions };
}

/**
 * Get the interaction summary for a specific agent pair.
 * Returns null if no interactions exist.
 */
export function getAgentPairInteraction(
  network: CollaborationNetwork,
  from: string,
  to: string
): AgentPairSummary | null {
  return network.matrix.get(`${from}\u2192${to}`) ?? null;
}
