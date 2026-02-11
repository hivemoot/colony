import type {
  ActivityData,
  Comment,
  GovernanceIncident,
  GovernanceIncidentClass,
  GovernanceOps,
  GovernanceSLO,
  GovernanceSLOStatus,
  Proposal,
  PullRequest,
} from './types';

const HOUR_MS = 1000 * 60 * 60;
const CLOSING_KEYWORD_REGEX =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const BLOCKED_MARKER_REGEX = /\bBLOCKED:\s*([a-z-]+)/i;
const VERIFIED_REGEX = /\bVERIFIED\b/i;
const RESOLVED_REGEX = /\bresolved\b/i;

const SLO_SCORE_BY_STATUS: Record<GovernanceSLOStatus, number> = {
  healthy: 100,
  'at-risk': 65,
  breach: 30,
};

export function computeGovernanceOps(
  data: ActivityData,
  nowIso = data.generatedAt
): GovernanceOps {
  const nowMs = Date.parse(nowIso);
  const issueToPrs = indexPullRequestsByIssue(data.pullRequests);

  const slos = [
    computeProposalCycleSlo(data.proposals),
    computeImplementationLeadSlo(data.proposals, issueToPrs),
    computeBlockedReadyWorkSlo(data.proposals, issueToPrs, nowMs),
    computeDashboardFreshnessSlo(data.generatedAt, nowMs),
    computeDiscoverabilitySlo(data.externalVisibility?.score),
  ];
  const incidents = collectIncidents(data.comments, nowMs);

  const breachCount = slos.filter((slo) => slo.status === 'breach').length;
  const atRiskCount = slos.filter((slo) => slo.status === 'at-risk').length;

  const score = Math.round(
    slos.reduce((sum, slo) => sum + SLO_SCORE_BY_STATUS[slo.status], 0) /
      slos.length
  );

  const status: GovernanceOps['status'] =
    breachCount > 0 ? 'red' : atRiskCount > 0 ? 'yellow' : 'green';

  const incidentPenalty = Math.min(20, incidents.length * 4);
  const remaining = clamp(
    100 - breachCount * 25 - atRiskCount * 10 - incidentPenalty,
    0,
    100
  );

  return {
    status,
    score,
    slos,
    incidents,
    reliabilityBudget: {
      remaining,
      policy:
        'If reliability budget stays below 40 for 3 consecutive days, prioritize reliability fixes over net-new features.',
      recommendation: recommendationForBudget(
        remaining,
        breachCount,
        atRiskCount
      ),
    },
  };
}

function indexPullRequestsByIssue(
  pullRequests: PullRequest[]
): Map<number, PullRequest[]> {
  const map = new Map<number, PullRequest[]>();

  for (const pr of pullRequests) {
    const linkedIssues = extractClosingIssueNumbers(pr.body);
    for (const issueNumber of linkedIssues) {
      if (!map.has(issueNumber)) {
        map.set(issueNumber, []);
      }
      map.get(issueNumber)?.push(pr);
    }
  }

  return map;
}

function extractClosingIssueNumbers(body?: string): number[] {
  if (!body) return [];

  const matches = new Set<number>();
  for (const match of body.matchAll(CLOSING_KEYWORD_REGEX)) {
    const issueNumber = Number.parseInt(match[1], 10);
    if (!Number.isNaN(issueNumber)) {
      matches.add(issueNumber);
    }
  }

  return Array.from(matches.values());
}

function computeProposalCycleSlo(proposals: Proposal[]): GovernanceSLO {
  const cycleHours: number[] = [];

  for (const proposal of proposals) {
    const readyAt = phaseTimestamp(proposal, 'ready-to-implement');
    if (!readyAt) continue;
    const discussionAt =
      phaseTimestamp(proposal, 'discussion') ?? proposal.createdAt;
    const hours = diffHours(discussionAt, readyAt);
    if (hours !== null) cycleHours.push(hours);
  }

  const medianHours = median(cycleHours);
  if (medianHours === null) {
    return {
      id: 'proposal-cycle-time',
      label: 'Proposal cycle time',
      target: '<= 48h median (discussion -> ready)',
      current: 'n/a',
      status: 'at-risk',
      details: 'No proposals have reached ready-to-implement yet.',
    };
  }

  const status: GovernanceSLOStatus =
    medianHours <= 48 ? 'healthy' : medianHours <= 72 ? 'at-risk' : 'breach';

  return {
    id: 'proposal-cycle-time',
    label: 'Proposal cycle time',
    target: '<= 48h median (discussion -> ready)',
    current: `${formatHours(medianHours)} median`,
    status,
    details: `${cycleHours.length} proposal cycle${cycleHours.length === 1 ? '' : 's'} measured.`,
  };
}

function computeImplementationLeadSlo(
  proposals: Proposal[],
  issueToPrs: Map<number, PullRequest[]>
): GovernanceSLO {
  const leadHours: number[] = [];
  let readyWithoutMerged = 0;

  for (const proposal of proposals) {
    const readyAt = phaseTimestamp(proposal, 'ready-to-implement');
    if (!readyAt) continue;

    const linkedPrs = issueToPrs.get(proposal.number) ?? [];
    const mergedAts = linkedPrs
      .filter((pr) => pr.state === 'merged' && pr.mergedAt)
      .map((pr) => pr.mergedAt as string)
      .sort();

    if (mergedAts.length === 0) {
      readyWithoutMerged++;
      continue;
    }

    const hours = diffHours(readyAt, mergedAts[0]);
    if (hours !== null) {
      leadHours.push(hours);
    }
  }

  const medianHours = median(leadHours);
  if (medianHours === null) {
    const status: GovernanceSLOStatus =
      readyWithoutMerged > 0 ? 'breach' : 'at-risk';
    return {
      id: 'implementation-lead-time',
      label: 'Implementation lead time',
      target: '<= 72h median (ready -> merged)',
      current: `${readyWithoutMerged} ready without merged PR`,
      status,
      details:
        readyWithoutMerged > 0
          ? 'Ready work is waiting on implementation completion.'
          : 'No ready proposals with merged implementations yet.',
    };
  }

  const status: GovernanceSLOStatus =
    medianHours <= 72 ? 'healthy' : medianHours <= 120 ? 'at-risk' : 'breach';

  return {
    id: 'implementation-lead-time',
    label: 'Implementation lead time',
    target: '<= 72h median (ready -> merged)',
    current: `${formatHours(medianHours)} median`,
    status,
    details: `${leadHours.length} ready-to-merge cycle${leadHours.length === 1 ? '' : 's'} measured.`,
  };
}

function computeBlockedReadyWorkSlo(
  proposals: Proposal[],
  issueToPrs: Map<number, PullRequest[]>,
  nowMs: number
): GovernanceSLO {
  const readyProposals = proposals.filter(
    (proposal) => proposal.phase === 'ready-to-implement'
  );
  let blockedCount = 0;

  for (const proposal of readyProposals) {
    const readyAt =
      phaseTimestamp(proposal, 'ready-to-implement') ?? proposal.createdAt;
    const ageHours = diffHours(readyAt, new Date(nowMs).toISOString());
    if (ageHours === null || ageHours < 24) continue;

    const linkedPrs = issueToPrs.get(proposal.number) ?? [];
    const hasActiveImplementation = linkedPrs.some(
      (pr) => pr.state === 'open' || pr.state === 'merged'
    );

    if (!hasActiveImplementation) {
      blockedCount++;
    }
  }

  const totalReady = readyProposals.length;
  const blockedRatio = totalReady > 0 ? blockedCount / totalReady : 0;
  const status: GovernanceSLOStatus =
    blockedRatio <= 0.2
      ? 'healthy'
      : blockedRatio <= 0.4
        ? 'at-risk'
        : 'breach';

  return {
    id: 'blocked-ready-work',
    label: 'Blocked ready work',
    target: '<= 20% ready proposals blocked >24h',
    current: `${blockedCount}/${totalReady} blocked (${Math.round(blockedRatio * 100)}%)`,
    status,
    details:
      totalReady === 0
        ? 'No proposals currently in ready-to-implement phase.'
        : 'Blocked means ready >24h with no open or merged linked PR.',
  };
}

function computeDashboardFreshnessSlo(
  generatedAt: string,
  nowMs: number
): GovernanceSLO {
  const generatedMs = Date.parse(generatedAt);
  const ageHours = Math.max(0, (nowMs - generatedMs) / HOUR_MS);
  const status: GovernanceSLOStatus =
    ageHours <= 24 ? 'healthy' : ageHours <= 48 ? 'at-risk' : 'breach';

  return {
    id: 'dashboard-freshness',
    label: 'Dashboard freshness',
    target: '<= 24h since last data generation',
    current: `${formatHours(ageHours)} old`,
    status,
    details: `Generated at ${generatedAt}`,
  };
}

function computeDiscoverabilitySlo(
  visibilityScore: number | undefined
): GovernanceSLO {
  if (typeof visibilityScore !== 'number') {
    return {
      id: 'discoverability-health',
      label: 'Discoverability health',
      target: '>= 80/100 external visibility score',
      current: 'n/a',
      status: 'at-risk',
      details: 'External visibility data not available.',
    };
  }

  const status: GovernanceSLOStatus =
    visibilityScore >= 80
      ? 'healthy'
      : visibilityScore >= 60
        ? 'at-risk'
        : 'breach';

  return {
    id: 'discoverability-health',
    label: 'Discoverability health',
    target: '>= 80/100 external visibility score',
    current: `${visibilityScore}/100`,
    status,
    details: 'Derived from repository metadata and public-site checks.',
  };
}

function collectIncidents(
  comments: Comment[],
  nowMs: number
): GovernanceIncident[] {
  const commentsByTime = [...comments].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );

  const latestResolutionBySource = new Map<string, number>();
  for (const comment of commentsByTime) {
    if (
      VERIFIED_REGEX.test(comment.body) ||
      RESOLVED_REGEX.test(comment.body)
    ) {
      latestResolutionBySource.set(
        sourceScopeKey(comment),
        Date.parse(comment.createdAt)
      );
    }
  }

  const incidents = new Map<string, GovernanceIncident>();
  const latestFirst = [...commentsByTime].reverse();

  for (const comment of latestFirst) {
    const marker = blockedMarker(comment.body);
    if (!marker) continue;

    const createdMs = Date.parse(comment.createdAt);
    const resolvedMs = latestResolutionBySource.get(sourceScopeKey(comment));
    if (resolvedMs !== undefined && resolvedMs > createdMs) {
      continue;
    }

    const incidentClass = classifyIncident(marker, comment.body);
    const incidentKey = `${sourceScopeKey(comment)}:${incidentClass}`;
    if (incidents.has(incidentKey)) continue;

    incidents.set(incidentKey, {
      id: incidentKey.replace(/[:]/g, '-'),
      class: incidentClass,
      severity: severityForClass(incidentClass),
      sourceType: sourceTypeForComment(comment),
      sourceNumber: comment.issueOrPrNumber,
      sourceUrl: comment.url,
      marker,
      summary: summarize(comment.body),
      detectedAt: comment.createdAt,
      ageHours: roundToOneDecimal(Math.max(0, (nowMs - createdMs) / HOUR_MS)),
    });
  }

  return Array.from(incidents.values())
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, 10);
}

function blockedMarker(body: string): string | null {
  const match = body.match(BLOCKED_MARKER_REGEX);
  return match ? match[1].toLowerCase() : null;
}

function classifyIncident(
  marker: string,
  body: string
): GovernanceIncidentClass {
  const lower = `${marker} ${body}`.toLowerCase();
  if (lower.includes('merge-required')) return 'maintainer-gate';
  if (
    lower.includes('admin-required') ||
    lower.includes('permission') ||
    lower.includes('push=false') ||
    lower.includes('forbidden') ||
    lower.includes('403')
  ) {
    return 'permissions';
  }
  if (
    lower.includes('ci') ||
    lower.includes('check') ||
    lower.includes('test') ||
    lower.includes('lint') ||
    lower.includes('build')
  ) {
    return 'ci-regression';
  }
  if (
    lower.includes('automation') ||
    lower.includes('workflow') ||
    lower.includes('action')
  ) {
    return 'automation-failure';
  }
  return 'governance-deadlock';
}

function severityForClass(
  incidentClass: GovernanceIncidentClass
): GovernanceIncident['severity'] {
  switch (incidentClass) {
    case 'permissions':
    case 'maintainer-gate':
    case 'governance-deadlock':
      return 'high';
    case 'ci-regression':
    case 'automation-failure':
      return 'medium';
    default:
      return 'low';
  }
}

function sourceTypeForComment(
  comment: Comment
): GovernanceIncident['sourceType'] {
  return comment.type === 'pr' || comment.type === 'review' ? 'pr' : 'issue';
}

function sourceScopeKey(comment: Comment): string {
  return `${sourceTypeForComment(comment)}:${comment.issueOrPrNumber}`;
}

function summarize(body: string): string {
  const firstLine = body.split('\n')[0].trim();
  return firstLine.slice(0, 160);
}

function recommendationForBudget(
  remaining: number,
  breachCount: number,
  atRiskCount: number
): string {
  if (remaining < 40 || breachCount > 0) {
    return 'Reliability budget is low. Pause net-new features and prioritize reliability fixes.';
  }
  if (atRiskCount > 0) {
    return 'Budget is healthy but watch at-risk SLOs and schedule preventative maintenance.';
  }
  return 'Reliability budget is strong. Continue feature delivery while keeping incident response fast.';
}

function phaseTimestamp(proposal: Proposal, phase: string): string | null {
  const transitions = proposal.phaseTransitions?.filter(
    (t) => t.phase === phase
  );
  if (!transitions || transitions.length === 0) return null;
  return [...transitions].sort((a, b) =>
    a.enteredAt.localeCompare(b.enteredAt)
  )[0].enteredAt;
}

function diffHours(startIso: string, endIso: string): number | null {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }

  return (endMs - startMs) / HOUR_MS;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function formatHours(value: number): string {
  return `${roundToOneDecimal(value)}h`;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
