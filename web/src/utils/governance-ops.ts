import type {
  ActivityData,
  GovernanceIncident,
  GovernanceIncidentCategory,
  PullRequest,
  Proposal,
} from '../types/activity';
import { computeGovernanceMetrics } from './governance';
import { formatHours } from './time';

export type GovernanceSLOStatus = 'pass' | 'warn' | 'fail';

export interface GovernanceSLOCheck {
  id:
    | 'proposal-cycle-time'
    | 'implementation-lead-time'
    | 'blocked-ready-work'
    | 'dashboard-freshness'
    | 'discoverability-health';
  label: string;
  target: string;
  status: GovernanceSLOStatus;
  value: string;
  detail: string;
}

export type ReliabilityMode = 'healthy' | 'watch' | 'stabilize';

export interface ReliabilityBudget {
  remaining: number;
  mode: ReliabilityMode;
  passCount: number;
  warnCount: number;
  failCount: number;
  guidance: string;
}

export interface GovernanceOpsReport {
  checks: GovernanceSLOCheck[];
  reliabilityBudget: ReliabilityBudget;
  incidents: {
    open: GovernanceIncident[];
    byCategory: Record<GovernanceIncidentCategory, number>;
  };
}

const CLOSING_KEYWORD_PATTERN =
  /(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;
const READY_STALE_HOURS = 24;
const DASHBOARD_FRESH_HOURS = 6;
const DASHBOARD_WARN_HOURS = 24;
const DISCOVERABILITY_PASS_SCORE = 80;
const DISCOVERABILITY_WARN_SCORE = 60;

const INCIDENT_CATEGORIES: GovernanceIncidentCategory[] = [
  'permissions',
  'automation-failure',
  'ci-regression',
  'governance-deadlock',
  'maintainer-gate',
];

export function computeGovernanceOpsReport(
  data: ActivityData,
  now = new Date()
): GovernanceOpsReport {
  const checks: GovernanceSLOCheck[] = [
    computeProposalCycleCheck(data),
    computeImplementationLeadTimeCheck(data),
    computeBlockedReadyWorkCheck(data, now),
    computeDashboardFreshnessCheck(data, now),
    computeDiscoverabilityCheck(data),
  ];

  const reliabilityBudget = computeReliabilityBudget(checks);
  const incidents = computeIncidentSummary(data.governanceIncidents ?? []);

  return {
    checks,
    reliabilityBudget,
    incidents,
  };
}

function computeProposalCycleCheck(data: ActivityData): GovernanceSLOCheck {
  const cycleHours = computeGovernanceMetrics(data).throughput.medianCycleHours;

  if (cycleHours === null) {
    return {
      id: 'proposal-cycle-time',
      label: 'Proposal Cycle Time',
      target: '<=72h median',
      status: 'warn',
      value: 'Insufficient data',
      detail:
        'Need resolved proposals with phase transitions to establish a stable baseline.',
    };
  }

  const status =
    cycleHours <= 72 ? 'pass' : cycleHours <= 120 ? 'warn' : 'fail';

  return {
    id: 'proposal-cycle-time',
    label: 'Proposal Cycle Time',
    target: '<=72h median',
    status,
    value: formatHours(cycleHours),
    detail: `Median proposal cycle is ${formatHours(cycleHours)} across resolved proposals.`,
  };
}

function computeImplementationLeadTimeCheck(
  data: ActivityData
): GovernanceSLOCheck {
  const defaultRepo = getDefaultRepoTag(data);
  const issueToPrs = mapIssueToPRs(data.pullRequests, defaultRepo);
  const leadSamples: number[] = [];

  for (const proposal of data.proposals) {
    const readyTime = getReadyEnteredAt(proposal);
    if (readyTime === null) continue;

    const proposalKey = issueKey(
      resolveRepoTag(proposal.repo, defaultRepo),
      proposal.number
    );
    const linkedPrs = issueToPrs.get(proposalKey);
    if (!linkedPrs || linkedPrs.length === 0) continue;

    const firstPr = linkedPrs
      .map((pr) => new Date(pr.createdAt).getTime())
      .sort((a, b) => a - b)
      .find((createdAt) => createdAt >= readyTime);

    const fallbackPr = linkedPrs
      .map((pr) => new Date(pr.createdAt).getTime())
      .sort((a, b) => a - b)[0];

    const firstLinkedPrTime = firstPr ?? fallbackPr;
    if (firstLinkedPrTime === undefined || firstLinkedPrTime < readyTime) {
      continue;
    }

    leadSamples.push((firstLinkedPrTime - readyTime) / (1000 * 60 * 60));
  }

  const medianLead = median(leadSamples);

  if (medianLead === null) {
    return {
      id: 'implementation-lead-time',
      label: 'Implementation Lead Time',
      target: '<=24h median',
      status: 'warn',
      value: 'Insufficient data',
      detail:
        'No ready-to-implement proposals with linked implementation PR timestamps yet.',
    };
  }

  const status = medianLead <= 24 ? 'pass' : medianLead <= 48 ? 'warn' : 'fail';

  return {
    id: 'implementation-lead-time',
    label: 'Implementation Lead Time',
    target: '<=24h median',
    status,
    value: formatHours(medianLead),
    detail: `Median lag from ready-to-implement to first linked PR is ${formatHours(medianLead)}.`,
  };
}

function computeBlockedReadyWorkCheck(
  data: ActivityData,
  now: Date
): GovernanceSLOCheck {
  const defaultRepo = getDefaultRepoTag(data);
  const issueToOpenPrs = mapIssueToPRs(
    data.pullRequests.filter((pr) => pr.state === 'open'),
    defaultRepo
  );

  let blockedCount = 0;

  for (const proposal of data.proposals) {
    if (proposal.phase !== 'ready-to-implement') continue;

    const readyTime =
      getReadyEnteredAt(proposal) ?? new Date(proposal.createdAt).getTime();
    const ageHours = (now.getTime() - readyTime) / (1000 * 60 * 60);

    if (ageHours < READY_STALE_HOURS) continue;

    const proposalKey = issueKey(
      resolveRepoTag(proposal.repo, defaultRepo),
      proposal.number
    );
    const hasOpenPr = (issueToOpenPrs.get(proposalKey)?.length ?? 0) > 0;
    if (!hasOpenPr) {
      blockedCount += 1;
    }
  }

  const status =
    blockedCount === 0 ? 'pass' : blockedCount === 1 ? 'warn' : 'fail';

  return {
    id: 'blocked-ready-work',
    label: 'Blocked Ready Work',
    target: '0 proposals >24h without open PR',
    status,
    value: `${blockedCount} blocked`,
    detail:
      blockedCount === 0
        ? 'No stale ready-to-implement proposals are waiting without active implementation.'
        : `${blockedCount} ready-to-implement proposal(s) have exceeded 24h without a linked open PR.`,
  };
}

function computeDashboardFreshnessCheck(
  data: ActivityData,
  now: Date
): GovernanceSLOCheck {
  const generated = new Date(data.generatedAt);
  const generatedMs = generated.getTime();
  const nowMs = now.getTime();

  if (Number.isNaN(generatedMs)) {
    return {
      id: 'dashboard-freshness',
      label: 'Dashboard Freshness',
      target: '<=6h data staleness',
      status: 'fail',
      value: 'Invalid timestamp',
      detail:
        'Latest snapshot timestamp is invalid. Verify generatedAt formatting in activity data.',
    };
  }

  if (generatedMs > nowMs) {
    return {
      id: 'dashboard-freshness',
      label: 'Dashboard Freshness',
      target: '<=6h data staleness',
      status: 'fail',
      value: formatHours(0),
      detail:
        'Latest snapshot timestamp is in the future. Check clock skew or corrupted generatedAt data.',
    };
  }

  const freshnessHours = (nowMs - generatedMs) / (1000 * 60 * 60);

  const status =
    freshnessHours <= DASHBOARD_FRESH_HOURS
      ? 'pass'
      : freshnessHours <= DASHBOARD_WARN_HOURS
        ? 'warn'
        : 'fail';

  return {
    id: 'dashboard-freshness',
    label: 'Dashboard Freshness',
    target: '<=6h data staleness',
    status,
    value: formatHours(Math.max(freshnessHours, 0)),
    detail: `Latest snapshot age is ${formatHours(Math.max(freshnessHours, 0))}.`,
  };
}

function computeDiscoverabilityCheck(data: ActivityData): GovernanceSLOCheck {
  const visibility = data.externalVisibility;

  if (!visibility) {
    return {
      id: 'discoverability-health',
      label: 'Discoverability Health',
      target: '>=80/100 visibility score',
      status: 'warn',
      value: 'No data',
      detail:
        'External visibility checks are missing from the latest snapshot.',
    };
  }

  const score = visibility.score;
  const status =
    score >= DISCOVERABILITY_PASS_SCORE
      ? 'pass'
      : score >= DISCOVERABILITY_WARN_SCORE
        ? 'warn'
        : 'fail';

  return {
    id: 'discoverability-health',
    label: 'Discoverability Health',
    target: '>=80/100 visibility score',
    status,
    value: `${score}/100`,
    detail:
      visibility.blockers.length > 0
        ? `Admin-blocked checks: ${visibility.blockers.join(', ')}.`
        : 'Repository and site discoverability checks are passing.',
  };
}

function computeReliabilityBudget(
  checks: GovernanceSLOCheck[]
): ReliabilityBudget {
  const passCount = checks.filter((check) => check.status === 'pass').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;

  const spent = failCount * 30 + warnCount * 12;
  const remaining = Math.max(0, Math.min(100, 100 - spent));

  const mode: ReliabilityMode =
    remaining >= 75 ? 'healthy' : remaining >= 50 ? 'watch' : 'stabilize';

  const guidance =
    mode === 'healthy'
      ? 'Reliability budget is healthy. Continue feature delivery while preserving SLO guardrails.'
      : mode === 'watch'
        ? 'Budget is under pressure. Prefer smaller feature slices and pair them with reliability hardening.'
        : 'Reliability budget is low. Prioritize blocker removal and stability work before net-new features.';

  return {
    remaining,
    mode,
    passCount,
    warnCount,
    failCount,
    guidance,
  };
}

function computeIncidentSummary(incidents: GovernanceIncident[]): {
  open: GovernanceIncident[];
  byCategory: Record<GovernanceIncidentCategory, number>;
} {
  const byCategory = INCIDENT_CATEGORIES.reduce(
    (acc, category) => ({ ...acc, [category]: 0 }),
    {} as Record<GovernanceIncidentCategory, number>
  );

  const open = incidents.filter((incident) => incident.status === 'open');

  for (const incident of open) {
    byCategory[incident.category] += 1;
  }

  return {
    open,
    byCategory,
  };
}

function mapIssueToPRs(
  pullRequests: PullRequest[],
  defaultRepo: string
): Map<string, PullRequest[]> {
  const map = new Map<string, PullRequest[]>();

  for (const pr of pullRequests) {
    const searchArea = `${pr.title} ${pr.body ?? ''}`;
    CLOSING_KEYWORD_PATTERN.lastIndex = 0;
    const prRepo = resolveRepoTag(pr.repo, defaultRepo);

    let match;
    while ((match = CLOSING_KEYWORD_PATTERN.exec(searchArea)) !== null) {
      const issueNumber = parseInt(match[1], 10);
      const key = issueKey(prRepo, issueNumber);
      const existing = map.get(key) ?? [];
      if (
        !existing.some(
          (entry) =>
            entry.number === pr.number &&
            resolveRepoTag(entry.repo, defaultRepo) === prRepo
        )
      ) {
        existing.push(pr);
      }
      map.set(key, existing);
    }
  }

  return map;
}

function getDefaultRepoTag(data: ActivityData): string {
  return `${data.repository.owner}/${data.repository.name}`;
}

function resolveRepoTag(
  repo: string | undefined,
  fallbackRepo: string
): string {
  return repo && repo.trim().length > 0 ? repo : fallbackRepo;
}

function issueKey(repo: string, issueNumber: number): string {
  return `${repo}#${issueNumber}`;
}

function getReadyEnteredAt(proposal: Proposal): number | null {
  const ready = proposal.phaseTransitions
    ?.filter((transition) => transition.phase === 'ready-to-implement')
    .sort(
      (a, b) =>
        new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
    )[0];

  if (!ready) {
    return null;
  }

  const readyTime = new Date(ready.enteredAt).getTime();
  return Number.isNaN(readyTime) ? null : readyTime;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
