import type { Proposal, PullRequest, PhaseTransition } from '../types/activity';
import { formatDuration } from './time';

export interface DecisionTimelineItem {
  phase: Proposal['phase'] | string;
  enteredAt: string;
  durationToNext: string | null;
}

export interface DecisionSnapshot {
  timeline: DecisionTimelineItem[];
  implementingPR: PullRequest | null;
  votes: {
    thumbsUp: number;
    thumbsDown: number;
    total: number;
    supportPct: number | null;
  };
}

export function getProposalHash(proposal: Proposal): string {
  return proposal.repo
    ? `proposal-${proposal.repo.replace('/', '-')}-${proposal.number}`
    : `proposal-${proposal.number}`;
}

const CLOSING_KEYWORD_PATTERN =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:[a-z0-9_.-]+\/[a-z0-9_.-]+)?#(\d+)\b/gi;

function statePriority(pr: PullRequest): number {
  if (pr.state === 'merged') return 0;
  if (pr.state === 'open') return 1;
  return 2;
}

function activityTimestamp(pr: PullRequest): number {
  return new Date(pr.mergedAt ?? pr.closedAt ?? pr.createdAt).getTime();
}

function extractLinkedIssueNumbers(text: string | undefined): number[] {
  if (!text) return [];

  const numbers: number[] = [];
  CLOSING_KEYWORD_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CLOSING_KEYWORD_PATTERN.exec(text)) !== null) {
    numbers.push(parseInt(match[1], 10));
  }

  return numbers;
}

function buildTimeline(proposal: Proposal): DecisionTimelineItem[] {
  const transitions = proposal.phaseTransitions ?? [];
  const normalized: PhaseTransition[] =
    transitions.length > 0
      ? [...transitions].sort(
          (a, b) =>
            new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
        )
      : [{ phase: 'discussion', enteredAt: proposal.createdAt }];

  if (normalized[0].phase !== 'discussion') {
    normalized.unshift({ phase: 'discussion', enteredAt: proposal.createdAt });
  }

  if (!normalized.some((item) => item.phase === proposal.phase)) {
    normalized.push({
      phase: proposal.phase,
      enteredAt:
        normalized[normalized.length - 1]?.enteredAt ?? proposal.createdAt,
    });
  }

  return normalized.map((item, index) => {
    const next = normalized[index + 1];
    return {
      phase: item.phase,
      enteredAt: item.enteredAt,
      durationToNext: next
        ? formatDuration(item.enteredAt, next.enteredAt)
        : null,
    };
  });
}

export function findImplementingPullRequest(
  proposal: Proposal,
  pullRequests: PullRequest[]
): PullRequest | null {
  const linked = pullRequests.filter((pr) => {
    if (proposal.repo && pr.repo && proposal.repo !== pr.repo) return false;

    const references = [
      ...extractLinkedIssueNumbers(pr.title),
      ...extractLinkedIssueNumbers(pr.body),
    ];
    return references.includes(proposal.number);
  });

  if (linked.length === 0) return null;

  linked.sort((a, b) => {
    const priority = statePriority(a) - statePriority(b);
    if (priority !== 0) return priority;
    return activityTimestamp(b) - activityTimestamp(a);
  });

  return linked[0];
}

export function buildDecisionSnapshot(
  proposal: Proposal,
  pullRequests: PullRequest[]
): DecisionSnapshot {
  const thumbsUp = proposal.votesSummary?.thumbsUp ?? 0;
  const thumbsDown = proposal.votesSummary?.thumbsDown ?? 0;
  const total = thumbsUp + thumbsDown;

  return {
    timeline: buildTimeline(proposal),
    implementingPR: findImplementingPullRequest(proposal, pullRequests),
    votes: {
      thumbsUp,
      thumbsDown,
      total,
      supportPct: total > 0 ? thumbsUp / total : null,
    },
  };
}
