import type { ActivityData } from '../types/activity';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot';
import { computeGovernanceBalance } from './governance-balance';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertType =
  | 'health-declining'
  | 'health-critical'
  | 'participation-collapse'
  | 'pipeline-stall'
  | 'follow-through-gap'
  | 'merge-queue-growth'
  | 'review-concentration';

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export type PatternType =
  | 'rubber-stamping'
  | 'single-point-of-failure'
  | 'governance-debt'
  | 'velocity-cliff'
  | 'healthy-growth';

export interface Pattern {
  type: PatternType;
  label: string;
  detail: string;
  positive: boolean;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export interface TrendSummary {
  healthDelta7d: number | null;
  healthDelta30d: number | null;
  participationDelta7d: number | null;
  pipelineFlowDelta7d: number | null;
  followThroughDelta7d: number | null;
  consensusDelta7d: number | null;
  consecutiveDeclines: number;
}

export interface GovernanceAssessment {
  alerts: Alert[];
  patterns: Pattern[];
  recommendations: Recommendation[];
  trendSummary: TrendSummary;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CONSECUTIVE_DECLINE_THRESHOLD = 3;
const CRITICAL_SCORE_THRESHOLD = 25;
const PARTICIPATION_DROP_THRESHOLD = 10;
const REVIEW_CONCENTRATION_THRESHOLD = 0.6;

// ──────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────

/**
 * Assess governance health using trend analysis and pattern detection.
 *
 * Combines governance history snapshots (temporal) with current ActivityData
 * (structural) to produce alerts, detected patterns, and recommendations.
 *
 * Pure function — no side effects, no API calls.
 */
export function assessGovernanceHealth(
  data: ActivityData,
  history: GovernanceSnapshot[]
): GovernanceAssessment {
  const trendSummary = computeTrendSummary(history);
  const alerts = detectAlerts(data, history, trendSummary);
  const patterns = detectPatterns(data, history, trendSummary);
  const recommendations = generateRecommendations(alerts, patterns, data);

  return { alerts, patterns, recommendations, trendSummary };
}

// ──────────────────────────────────────────────
// Trend Summary
// ──────────────────────────────────────────────

export function computeTrendSummary(
  history: GovernanceSnapshot[]
): TrendSummary {
  if (history.length < 2) {
    return {
      healthDelta7d: null,
      healthDelta30d: null,
      participationDelta7d: null,
      pipelineFlowDelta7d: null,
      followThroughDelta7d: null,
      consensusDelta7d: null,
      consecutiveDeclines: 0,
    };
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const latestTime = new Date(latest.timestamp).getTime();

  const snap7d = findClosestBefore(sorted, latestTime - 7 * MS_PER_DAY);
  const snap30d = findClosestBefore(sorted, latestTime - 30 * MS_PER_DAY);

  return {
    healthDelta7d: snap7d ? latest.healthScore - snap7d.healthScore : null,
    healthDelta30d: snap30d ? latest.healthScore - snap30d.healthScore : null,
    participationDelta7d: snap7d
      ? latest.participation - snap7d.participation
      : null,
    pipelineFlowDelta7d: snap7d
      ? latest.pipelineFlow - snap7d.pipelineFlow
      : null,
    followThroughDelta7d: snap7d
      ? latest.followThrough - snap7d.followThrough
      : null,
    consensusDelta7d: snap7d
      ? latest.consensusQuality - snap7d.consensusQuality
      : null,
    consecutiveDeclines: countConsecutiveDeclines(sorted),
  };
}

function findClosestBefore(
  sorted: GovernanceSnapshot[],
  targetTime: number
): GovernanceSnapshot | null {
  let best: GovernanceSnapshot | null = null;
  for (const s of sorted) {
    const t = new Date(s.timestamp).getTime();
    if (t <= targetTime) {
      best = s;
    } else {
      break;
    }
  }
  return best;
}

function countConsecutiveDeclines(sorted: GovernanceSnapshot[]): number {
  let count = 0;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].healthScore < sorted[i - 1].healthScore) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ──────────────────────────────────────────────
// Alert Detection
// ──────────────────────────────────────────────

export function detectAlerts(
  data: ActivityData,
  history: GovernanceSnapshot[],
  trend: TrendSummary
): Alert[] {
  const alerts: Alert[] = [];

  // Health declining: 3+ consecutive drops
  if (trend.consecutiveDeclines >= CONSECUTIVE_DECLINE_THRESHOLD) {
    alerts.push({
      type: 'health-declining',
      severity: 'warning',
      title: 'Health score declining',
      detail: `Health score has dropped for ${trend.consecutiveDeclines} consecutive snapshots`,
    });
  }

  // Health critical: score below 25 for recent snapshots
  if (history.length >= 2) {
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const recent = sorted.slice(-2);
    if (recent.every((s) => s.healthScore < CRITICAL_SCORE_THRESHOLD)) {
      alerts.push({
        type: 'health-critical',
        severity: 'critical',
        title: 'Governance health critical',
        detail: `Health score has been below ${CRITICAL_SCORE_THRESHOLD} for the last ${recent.length} snapshots`,
      });
    }
  }

  // Participation collapse: drop >10pts in 7d
  if (
    trend.participationDelta7d !== null &&
    trend.participationDelta7d < -PARTICIPATION_DROP_THRESHOLD
  ) {
    alerts.push({
      type: 'participation-collapse',
      severity: 'warning',
      title: 'Participation dropping',
      detail: `Participation sub-metric dropped ${Math.abs(trend.participationDelta7d)} points in 7 days`,
    });
  }

  // Pipeline stall: pipeline flow at 0 in the latest snapshot
  if (history.length > 0) {
    const latest = [...history].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )[history.length - 1];
    if (latest.pipelineFlow === 0 && latest.totalProposals > 0) {
      alerts.push({
        type: 'pipeline-stall',
        severity: 'critical',
        title: 'Pipeline stalled',
        detail: 'No proposals are advancing through the governance pipeline',
      });
    }
  }

  // Follow-through gap: many ready-to-implement with no PRs
  const readyToImplement = data.proposals.filter(
    (p) => p.phase === 'ready-to-implement'
  );
  const openPRs = data.pullRequests.filter((pr) => pr.state === 'open');
  // Count ready proposals that have no linked open PR
  const pattern = /(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;
  const linkedIssues = new Set<number>();
  for (const pr of openPRs) {
    const text = `${pr.title} ${pr.body ?? ''}`;
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      linkedIssues.add(parseInt(match[1], 10));
    }
  }
  const unclaimedReady = readyToImplement.filter(
    (p) => !linkedIssues.has(p.number)
  );
  if (unclaimedReady.length > 5) {
    alerts.push({
      type: 'follow-through-gap',
      severity: 'warning',
      title: 'Implementation backlog growing',
      detail: `${unclaimedReady.length} approved proposals have no implementation PR`,
    });
  }

  // Merge queue growth: many open PRs relative to recent merges
  const mergedRecently = data.pullRequests.filter(
    (pr) =>
      pr.state === 'merged' &&
      pr.mergedAt &&
      Date.now() - new Date(pr.mergedAt).getTime() < 2 * MS_PER_DAY
  );
  if (openPRs.length > 10 && openPRs.length > mergedRecently.length * 3) {
    alerts.push({
      type: 'merge-queue-growth',
      severity: 'warning',
      title: 'Merge queue bottleneck',
      detail: `${openPRs.length} open PRs with only ${mergedRecently.length} merged in last 48h`,
    });
  }

  // Review concentration: one agent doing >60% of reviews
  const totalReviews = data.agentStats.reduce((s, a) => s + a.reviews, 0);
  if (totalReviews > 0) {
    for (const agent of data.agentStats) {
      if (agent.reviews / totalReviews > REVIEW_CONCENTRATION_THRESHOLD) {
        alerts.push({
          type: 'review-concentration',
          severity: 'info',
          title: 'Review concentration',
          detail: `${agent.login} performed ${Math.round((agent.reviews / totalReviews) * 100)}% of all reviews`,
        });
        break; // Only report the top concentrator
      }
    }
  }

  return alerts;
}

// ──────────────────────────────────────────────
// Pattern Detection
// ──────────────────────────────────────────────

export function detectPatterns(
  data: ActivityData,
  history: GovernanceSnapshot[],
  trend: TrendSummary
): Pattern[] {
  const patterns: Pattern[] = [];

  // Rubber-stamping: high approval + low discussion
  const terminal = data.proposals.filter((p) =>
    ['implemented', 'rejected', 'inconclusive'].includes(p.phase)
  );
  if (terminal.length >= 3) {
    const approvalRate =
      terminal.filter((p) => p.phase === 'implemented').length /
      terminal.length;
    const avgComments =
      data.proposals.reduce((s, p) => s + p.commentCount, 0) /
      data.proposals.length;
    if (approvalRate > 0.95 && avgComments < 2) {
      patterns.push({
        type: 'rubber-stamping',
        label: 'Rubber-stamping risk',
        detail: `${Math.round(approvalRate * 100)}% approval rate with only ${avgComments.toFixed(1)} avg comments per proposal`,
        positive: false,
      });
    }
  }

  // Single point of failure
  const balance = computeGovernanceBalance(data);
  if (balance.powerConcentration.topAgentShare > 0.5) {
    const top = balance.powerConcentration.agents[0];
    patterns.push({
      type: 'single-point-of-failure',
      label: 'Single point of failure',
      detail: `${top.login} holds ${Math.round(top.share * 100)}% of governance influence`,
      positive: false,
    });
  }

  // Governance debt: ready-to-implement growing across snapshots
  if (history.length >= 3) {
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const recent = sorted.slice(-3);
    const readyGrowing =
      recent.length === 3 &&
      recent[2].activeProposals > recent[1].activeProposals &&
      recent[1].activeProposals > recent[0].activeProposals;
    if (readyGrowing) {
      patterns.push({
        type: 'governance-debt',
        label: 'Governance debt accumulating',
        detail: 'Active proposal backlog has grown for 3 consecutive snapshots',
        positive: false,
      });
    }
  }

  // Velocity cliff: velocity drops >50% based on history
  if (history.length >= 2) {
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    if (
      previous.proposalVelocity !== null &&
      previous.proposalVelocity > 0 &&
      latest.proposalVelocity !== null &&
      latest.proposalVelocity < previous.proposalVelocity * 0.5
    ) {
      patterns.push({
        type: 'velocity-cliff',
        label: 'Velocity cliff',
        detail: `Proposal velocity dropped from ${previous.proposalVelocity}/day to ${latest.proposalVelocity}/day`,
        positive: false,
      });
    }
  }

  // Healthy growth: health improving + stable/growing agent count
  if (
    trend.healthDelta7d !== null &&
    trend.healthDelta7d > 0 &&
    history.length >= 2
  ) {
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    if (latest.activeAgents >= earliest.activeAgents) {
      patterns.push({
        type: 'healthy-growth',
        label: 'Healthy growth',
        detail: `Health score up ${trend.healthDelta7d} points over 7 days with stable agent participation`,
        positive: true,
      });
    }
  }

  return patterns;
}

// ──────────────────────────────────────────────
// Recommendations
// ──────────────────────────────────────────────

export function generateRecommendations(
  alerts: Alert[],
  patterns: Pattern[],
  data: ActivityData
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const alert of alerts) {
    switch (alert.type) {
      case 'merge-queue-growth':
        recs.push({
          priority: 'high',
          description: `Merge queue bottleneck: ${data.pullRequests.filter((pr) => pr.state === 'open').length} open PRs. This may be a permissions issue rather than a governance issue.`,
        });
        break;
      case 'health-critical':
        recs.push({
          priority: 'high',
          description:
            'Governance health is critically low. Review sub-metrics to identify which dimension needs immediate attention.',
        });
        break;
      case 'pipeline-stall':
        recs.push({
          priority: 'high',
          description:
            'No proposals are progressing. Check if discussion or voting phases are blocked.',
        });
        break;
      case 'follow-through-gap':
        recs.push({
          priority: 'medium',
          description:
            'Approved proposals are piling up without implementation. Consider a focused implementation sprint.',
        });
        break;
      case 'participation-collapse':
        recs.push({
          priority: 'medium',
          description:
            'Participation has dropped significantly. Encourage broader proposal authorship and review activity across roles.',
        });
        break;
      case 'review-concentration':
        recs.push({
          priority: 'low',
          description:
            'Review activity is concentrated in one agent. Distributing reviews improves governance resilience.',
        });
        break;
    }
  }

  for (const pat of patterns) {
    switch (pat.type) {
      case 'rubber-stamping':
        recs.push({
          priority: 'medium',
          description:
            'Proposals may be approved without sufficient deliberation. Encourage agents to challenge assumptions and propose alternatives.',
        });
        break;
      case 'single-point-of-failure':
        recs.push({
          priority: 'medium',
          description:
            'Governance influence is heavily concentrated. If this agent becomes unavailable, governance could stall.',
        });
        break;
      case 'governance-debt':
        recs.push({
          priority: 'medium',
          description:
            'Active proposal backlog is growing. Prioritize closing or implementing existing proposals before opening new ones.',
        });
        break;
    }
  }

  // Sort by priority
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => order[a.priority] - order[b.priority]);

  // Limit to top 5
  return recs.slice(0, 5);
}
