import type {
  ActivityData,
  AgentStats,
  Comment,
  Proposal,
} from '../types/activity';

// --- Public types ---

export type ConcentrationLevel =
  | 'balanced'
  | 'moderate'
  | 'concentrated'
  | 'oligarchy';

export interface AgentInfluence {
  login: string;
  share: number; // 0–1
  proposalsAuthored: number;
  reviewsGiven: number;
  votesInferred: number;
}

export interface PowerConcentration {
  level: ConcentrationLevel;
  topAgentShare: number;
  topTwoShare: number;
  agents: AgentInfluence[];
  reason: string;
}

export type RoleName = 'builder' | 'worker' | 'scout' | 'polisher' | 'unknown';
export type ActivityDimension = 'proposing' | 'reviewing' | 'commenting';

export interface RoleCoverage {
  role: RoleName;
  proposing: boolean;
  reviewing: boolean;
  commenting: boolean;
}

export interface RoleDiversity {
  score: number; // 0–100
  coverage: RoleCoverage[];
  missingCombinations: string[];
  reason: string;
}

export type ResponsivenessBucket =
  | 'highly-responsive'
  | 'responsive'
  | 'slow'
  | 'concerning'
  | 'no-data';

export interface GovernanceResponsiveness {
  medianHours: number | null;
  bucket: ResponsivenessBucket;
  proposalsWithResponses: number;
  totalProposals: number;
  reason: string;
}

export type BalanceVerdict =
  | 'balanced'
  | 'mostly-balanced'
  | 'imbalanced'
  | 'insufficient-data';

export interface GovernanceBalanceAssessment {
  powerConcentration: PowerConcentration;
  roleDiversity: RoleDiversity;
  responsiveness: GovernanceResponsiveness;
  verdict: BalanceVerdict;
  verdictReason: string;
}

// --- Weights ---

const PROPOSAL_WEIGHT = 3;
const REVIEW_WEIGHT = 2;
const VOTE_WEIGHT = 1;

// --- Known role prefixes ---

const ROLE_PREFIXES: Array<{ prefix: string; role: RoleName }> = [
  { prefix: 'builder', role: 'builder' },
  { prefix: 'worker', role: 'worker' },
  { prefix: 'scout', role: 'scout' },
  { prefix: 'polisher', role: 'polisher' },
];

const KNOWN_ROLES: RoleName[] = ['builder', 'worker', 'scout', 'polisher'];

// --- Main entry ---

export function computeGovernanceBalance(
  data: ActivityData
): GovernanceBalanceAssessment {
  const power = computePowerConcentration(data.agentStats, data.proposals);
  const diversity = computeRoleDiversity(
    data.agentStats,
    data.proposals,
    data.comments
  );
  const responsiveness = computeResponsiveness(data.proposals, data.comments);
  const { verdict, verdictReason } = computeVerdict(
    power,
    diversity,
    responsiveness
  );

  return {
    powerConcentration: power,
    roleDiversity: diversity,
    responsiveness,
    verdict,
    verdictReason,
  };
}

// --- Power Concentration ---

export function computePowerConcentration(
  agentStats: AgentStats[],
  proposals: Proposal[]
): PowerConcentration {
  if (agentStats.length === 0) {
    return {
      level: 'balanced',
      topAgentShare: 0,
      topTwoShare: 0,
      agents: [],
      reason: 'No agents detected',
    };
  }

  const proposalCounts = new Map<string, number>();
  for (const p of proposals) {
    proposalCounts.set(p.author, (proposalCounts.get(p.author) ?? 0) + 1);
  }

  // Compute weighted influence per agent
  const influences: AgentInfluence[] = agentStats.map((a) => {
    const proposalsAuthored = proposalCounts.get(a.login) ?? 0;
    const reviewsGiven = a.reviews;
    // Infer votes from proposal comment activity (each agent participating in
    // a voting-phase proposal likely voted once per proposal they commented on)
    const votesInferred = Math.min(a.comments, proposals.length);

    return {
      login: a.login,
      share: 0,
      proposalsAuthored,
      reviewsGiven,
      votesInferred,
    };
  });

  const totalWeight = influences.reduce(
    (sum, a) =>
      sum +
      a.proposalsAuthored * PROPOSAL_WEIGHT +
      a.reviewsGiven * REVIEW_WEIGHT +
      a.votesInferred * VOTE_WEIGHT,
    0
  );

  if (totalWeight === 0) {
    return {
      level: 'balanced',
      topAgentShare: 0,
      topTwoShare: 0,
      agents: influences,
      reason: 'No governance activity detected',
    };
  }

  for (const a of influences) {
    a.share =
      (a.proposalsAuthored * PROPOSAL_WEIGHT +
        a.reviewsGiven * REVIEW_WEIGHT +
        a.votesInferred * VOTE_WEIGHT) /
      totalWeight;
  }

  // Sort descending by share
  influences.sort((a, b) => b.share - a.share);

  const topAgentShare = influences[0].share;
  const topTwoShare =
    influences.length >= 2
      ? influences[0].share + influences[1].share
      : topAgentShare;

  let level: ConcentrationLevel;
  let reason: string;

  if (topTwoShare > 0.7) {
    level = 'oligarchy';
    reason = `Top 2 agents hold ${pct(topTwoShare)} of governance influence — oligarchy risk`;
  } else if (topAgentShare > 0.4) {
    level = 'concentrated';
    reason = `${influences[0].login} holds ${pct(topAgentShare)} of governance influence — concentrated`;
  } else if (topAgentShare > 0.3) {
    level = 'moderate';
    reason = `Influence is moderately distributed across ${influences.length} agents`;
  } else {
    level = 'balanced';
    reason = `Influence is well-distributed across ${influences.length} agents`;
  }

  return { level, topAgentShare, topTwoShare, agents: influences, reason };
}

// --- Role Diversity ---

export function computeRoleDiversity(
  agentStats: AgentStats[],
  proposals: Proposal[],
  comments: Comment[]
): RoleDiversity {
  const proposersByRole = new Map<RoleName, boolean>();
  const reviewersByRole = new Map<RoleName, boolean>();
  const commentersByRole = new Map<RoleName, boolean>();

  // Count proposal authorship by role
  for (const p of proposals) {
    const role = inferRole(p.author);
    if (role !== 'unknown') {
      proposersByRole.set(role, true);
    }
  }

  // Count review activity by role
  for (const a of agentStats) {
    const role = inferRole(a.login);
    if (role !== 'unknown' && a.reviews > 0) {
      reviewersByRole.set(role, true);
    }
  }

  // Count comment activity by role
  for (const c of comments) {
    const role = inferRole(c.author);
    if (role !== 'unknown') {
      commentersByRole.set(role, true);
    }
  }

  const coverage: RoleCoverage[] = KNOWN_ROLES.map((role) => ({
    role,
    proposing: proposersByRole.get(role) ?? false,
    reviewing: reviewersByRole.get(role) ?? false,
    commenting: commentersByRole.get(role) ?? false,
  }));

  const dimensions: ActivityDimension[] = [
    'proposing',
    'reviewing',
    'commenting',
  ];
  const totalCombinations = KNOWN_ROLES.length * dimensions.length;
  let activeCombinations = 0;
  const missing: string[] = [];

  for (const rc of coverage) {
    for (const dim of dimensions) {
      if (rc[dim]) {
        activeCombinations++;
      } else {
        missing.push(
          `${capitalize(rc.role)} role has not been ${dimVerb(dim)}`
        );
      }
    }
  }

  const score =
    totalCombinations > 0
      ? Math.round((activeCombinations / totalCombinations) * 100)
      : 0;

  const reason =
    score === 100
      ? 'All roles are active across all governance dimensions'
      : score >= 75
        ? `Most role-activity combinations covered (${activeCombinations}/${totalCombinations})`
        : score >= 50
          ? `Partial role coverage — ${missing.length} gaps detected`
          : `Low role diversity — ${missing.length} gaps across ${KNOWN_ROLES.length} roles`;

  return { score, coverage, missingCombinations: missing, reason };
}

// --- Responsiveness ---

export function computeResponsiveness(
  proposals: Proposal[],
  comments: Comment[]
): GovernanceResponsiveness {
  if (proposals.length === 0) {
    return {
      medianHours: null,
      bucket: 'no-data',
      proposalsWithResponses: 0,
      totalProposals: 0,
      reason: 'No proposals to assess responsiveness',
    };
  }

  // Build a map of proposal number → first non-author comment time
  const proposalComments = new Map<number, string[]>();
  for (const c of comments) {
    if (c.type === 'proposal') {
      const existing = proposalComments.get(c.issueOrPrNumber);
      if (existing) {
        existing.push(`${c.author}|${c.createdAt}`);
      } else {
        proposalComments.set(c.issueOrPrNumber, [`${c.author}|${c.createdAt}`]);
      }
    }
  }

  const responseTimes: number[] = [];

  for (const proposal of proposals) {
    const entries = proposalComments.get(proposal.number) ?? [];
    const proposalCreated = new Date(proposal.createdAt).getTime();

    // Find first non-author, non-bot comment
    let firstResponseTime: number | null = null;
    for (const entry of entries) {
      const [author, createdAt] = entry.split('|');
      if (author === proposal.author) continue;
      if (author.endsWith('[bot]')) continue;
      const commentTime = new Date(createdAt).getTime();
      if (firstResponseTime === null || commentTime < firstResponseTime) {
        firstResponseTime = commentTime;
      }
    }

    if (firstResponseTime !== null) {
      const hoursToRespond =
        (firstResponseTime - proposalCreated) / (1000 * 60 * 60);
      if (hoursToRespond >= 0) {
        responseTimes.push(hoursToRespond);
      }
    }
  }

  if (responseTimes.length === 0) {
    return {
      medianHours: null,
      bucket: 'no-data',
      proposalsWithResponses: 0,
      totalProposals: proposals.length,
      reason: 'No non-author responses detected on proposals',
    };
  }

  responseTimes.sort((a, b) => a - b);
  const medianHours = responseTimes[Math.floor(responseTimes.length / 2)];

  let bucket: ResponsivenessBucket;
  if (medianHours < 2) {
    bucket = 'highly-responsive';
  } else if (medianHours < 8) {
    bucket = 'responsive';
  } else if (medianHours < 24) {
    bucket = 'slow';
  } else {
    bucket = 'concerning';
  }

  const reason =
    bucket === 'highly-responsive'
      ? `Median response time is ${fmtHours(medianHours)} — governance is highly engaged`
      : bucket === 'responsive'
        ? `Median response time is ${fmtHours(medianHours)} — proposals get timely attention`
        : bucket === 'slow'
          ? `Median response time is ${fmtHours(medianHours)} — proposals wait before getting attention`
          : `Median response time is ${fmtHours(medianHours)} — proposals take over a day to get a response`;

  return {
    medianHours: Math.round(medianHours * 10) / 10,
    bucket,
    proposalsWithResponses: responseTimes.length,
    totalProposals: proposals.length,
    reason,
  };
}

// --- Verdict ---

function computeVerdict(
  power: PowerConcentration,
  diversity: RoleDiversity,
  responsiveness: GovernanceResponsiveness
): { verdict: BalanceVerdict; verdictReason: string } {
  if (power.agents.length < 2 || responsiveness.totalProposals === 0) {
    return {
      verdict: 'insufficient-data',
      verdictReason: 'Not enough governance data to assess balance',
    };
  }

  let score = 0;

  // Power: balanced=3, moderate=2, concentrated=1, oligarchy=0
  if (power.level === 'balanced') score += 3;
  else if (power.level === 'moderate') score += 2;
  else if (power.level === 'concentrated') score += 1;

  // Diversity: >=75=3, >=50=2, >=25=1, <25=0
  if (diversity.score >= 75) score += 3;
  else if (diversity.score >= 50) score += 2;
  else if (diversity.score >= 25) score += 1;

  // Responsiveness: highly-responsive=3, responsive=2, slow=1, concerning/no-data=0
  if (responsiveness.bucket === 'highly-responsive') score += 3;
  else if (responsiveness.bucket === 'responsive') score += 2;
  else if (responsiveness.bucket === 'slow') score += 1;

  let verdict: BalanceVerdict;
  let verdictReason: string;

  if (score >= 8) {
    verdict = 'balanced';
    verdictReason =
      'Self-organization is well-balanced: distributed power, diverse roles, and responsive governance';
  } else if (score >= 5) {
    verdict = 'mostly-balanced';
    verdictReason =
      'Self-organization is mostly balanced with some areas for improvement';
  } else {
    verdict = 'imbalanced';
    verdictReason =
      'Self-organization shows significant imbalances that need attention';
  }

  return { verdict, verdictReason };
}

// --- Helpers ---

export function inferRole(login: string): RoleName {
  const lower = login.toLowerCase();
  for (const { prefix, role } of ROLE_PREFIXES) {
    if (lower.includes(prefix)) return role;
  }
  return 'unknown';
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dimVerb(dim: ActivityDimension): string {
  switch (dim) {
    case 'proposing':
      return 'active in proposing';
    case 'reviewing':
      return 'active in reviewing';
    case 'commenting':
      return 'active in commenting';
  }
}

function fmtHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}
