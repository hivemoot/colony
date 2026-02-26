import { execFileSync } from 'node:child_process';

const DEFAULT_REPO = 'hivemoot/colony';
const DEFAULT_LIMIT = 200;

export const FAST_TRACK_PREFIXES = [
  'fix:',
  'test:',
  'docs:',
  'chore:',
  'a11y:',
  'polish:',
] as const;

interface ReviewNode {
  state?: string;
  author?: {
    login?: string;
  };
}

interface IssueNode {
  number: number;
  state?: string;
  url?: string;
}

interface StatusCheckNode {
  status?: string;
  conclusion?: string | null;
}

interface ReactionGroupNode {
  content?: string;
  users?: {
    totalCount?: number;
  };
}

interface PullRequestNode {
  number: number;
  title: string;
  url: string;
  mergeStateStatus?: string;
  latestReviews?: ReviewNode[];
  statusCheckRollup?: StatusCheckNode[] | null;
  closingIssuesReferences?: IssueNode[];
  reactionGroups?: ReactionGroupNode[];
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  approvals: number;
  ciState: string;
  linkedOpenIssues: number[];
  highApprovalWaiver: boolean;
}

interface CandidateRecord {
  number: number;
  title: string;
  url: string;
  mergeStateStatus: string;
  eligible: boolean;
  reasons: string[];
  approvals: number;
  ciState: string;
  linkedOpenIssues: number[];
  highApprovalWaiver: boolean;
}

interface Report {
  generatedAt: string;
  repo: string;
  allowedPrefixes: readonly string[];
  summary: {
    totalOpenPrs: number;
    eligiblePrs: number;
    mergeReadyEligiblePrs: number;
  };
  candidates: CandidateRecord[];
}

interface CliOptions {
  repo: string;
  limit: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: DEFAULT_REPO,
    limit: DEFAULT_LIMIT,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length).trim() || DEFAULT_REPO;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        options.limit = value;
      }
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(
    'Usage: npm run fast-track-candidates -- [--repo=owner/name] [--limit=200] [--json]'
  );
}

export function hasAllowedPrefix(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return FAST_TRACK_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function hasChangesRequested(
  latestReviews: ReviewNode[] | undefined
): boolean {
  return (latestReviews ?? []).some(
    (review) => review.state === 'CHANGES_REQUESTED'
  );
}

export function countDistinctApprovals(
  latestReviews: ReviewNode[] | undefined
): number {
  const approvedBy = new Set<string>();

  for (const review of latestReviews ?? []) {
    if (review.state !== 'APPROVED') {
      continue;
    }
    const login = review.author?.login?.trim().toLowerCase();
    if (!login) {
      continue;
    }
    approvedBy.add(login);
  }

  return approvedBy.size;
}

function getCiState(pr: PullRequestNode): string {
  const checks = pr.statusCheckRollup ?? [];
  if (checks.length === 0) {
    return 'UNKNOWN';
  }

  let hasPending = false;
  for (const check of checks) {
    const status = check.status?.trim().toUpperCase() || 'UNKNOWN';
    const conclusion = check.conclusion?.trim().toUpperCase() || 'UNKNOWN';

    if (status !== 'COMPLETED') {
      hasPending = true;
      continue;
    }

    if (
      conclusion !== 'SUCCESS' &&
      conclusion !== 'SKIPPED' &&
      conclusion !== 'NEUTRAL'
    ) {
      return `FAILED:${conclusion}`;
    }
  }

  return hasPending ? 'PENDING' : 'SUCCESS';
}

function getLinkedOpenIssues(
  pr: PullRequestNode,
  issueStates: Map<string, string>,
  repo: string
): number[] {
  return (pr.closingIssuesReferences ?? [])
    .filter((issue) => {
      const directState = issue.state?.toUpperCase();
      if (directState === 'OPEN') {
        return true;
      }
      const resolvedState = issueStates
        .get(getIssueKey(issue, repo))
        ?.toUpperCase();
      return resolvedState === 'OPEN';
    })
    .map((issue) => issue.number)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a - b);
}

// High-approval waiver threshold (Issue #445).
// PRs with this many distinct approvals and no CHANGES_REQUESTED reviews are
// eligible for fast-track even without an open linked issue.
export const HIGH_APPROVAL_WAIVER_THRESHOLD = 6;

export function evaluateEligibility(
  pr: PullRequestNode,
  issueStates: Map<string, string> = new Map(),
  repo: string = DEFAULT_REPO
): EligibilityResult {
  const reasons: string[] = [];
  const approvals = countDistinctApprovals(pr.latestReviews);
  const ciState = getCiState(pr);
  const linkedOpenIssues = getLinkedOpenIssues(pr, issueStates, repo);
  const changesRequested = hasChangesRequested(pr.latestReviews);

  if (!hasAllowedPrefix(pr.title)) {
    reasons.push(
      `title prefix must be one of: ${FAST_TRACK_PREFIXES.join(', ')}`
    );
  }

  if (approvals < 2) {
    reasons.push(`requires at least 2 distinct approvals (found ${approvals})`);
  }

  if (ciState !== 'SUCCESS') {
    reasons.push(`CI checks must be SUCCESS (found ${ciState})`);
  }

  // Linked issue requirement, with high-approval waiver.
  // A PR with 6+ distinct approvals and no CHANGES_REQUESTED reviews is
  // eligible even without an open linked issue — the quorum signal from
  // multiple reviewers across multiple sessions provides equivalent governance
  // assurance (#445).
  const highApprovalWaiver =
    approvals >= HIGH_APPROVAL_WAIVER_THRESHOLD && !changesRequested;

  if (linkedOpenIssues.length === 0 && !highApprovalWaiver) {
    reasons.push('must reference at least one OPEN linked issue');
  }

  if (changesRequested) {
    reasons.push('cannot have a pending CHANGES_REQUESTED review');
  }

  if (hasThumbsDownVeto(pr.reactionGroups)) {
    reasons.push('cannot have a 👎 veto reaction on the PR');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    approvals,
    ciState,
    linkedOpenIssues,
    highApprovalWaiver,
  };
}

export function normalizeMergeStateStatus(
  mergeStateStatus: string | undefined
): string {
  const normalized = mergeStateStatus?.trim().toUpperCase();
  return normalized || 'UNKNOWN';
}

export function isMergeReady(mergeStateStatus: string | undefined): boolean {
  return normalizeMergeStateStatus(mergeStateStatus) === 'CLEAN';
}

function hasThumbsDownVeto(
  reactionGroups: ReactionGroupNode[] | undefined
): boolean {
  return (reactionGroups ?? []).some((group) => {
    const content = group.content?.trim().toUpperCase();
    const totalCount = group.users?.totalCount ?? 0;
    return content === 'THUMBS_DOWN' && totalCount > 0;
  });
}

function loadPullRequests(repo: string, limit: number): PullRequestNode[] {
  const fields = [
    'number',
    'title',
    'url',
    'mergeStateStatus',
    'latestReviews',
    'statusCheckRollup',
    'closingIssuesReferences',
    'reactionGroups',
  ].join(',');

  const output = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--limit',
      String(limit),
      '--json',
      fields,
    ],
    {
      encoding: 'utf8',
    }
  );

  const parsed = JSON.parse(output) as PullRequestNode[];
  return parsed;
}

function getIssueKey(issue: IssueNode, defaultRepo: string): string {
  const fromUrl = parseIssueRefFromUrl(issue.url);
  if (fromUrl) {
    return `${fromUrl.repo}#${fromUrl.number}`;
  }
  return `${defaultRepo}#${issue.number}`;
}

function parseIssueRefFromUrl(
  url: string | undefined
): { repo: string; number: number } | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    const owner = pathParts[1];
    const repo = pathParts[2];
    const resource = pathParts[3];
    const number = pathParts[4];
    if (!owner || !repo || resource !== 'issues' || !number) {
      return null;
    }
    const issueNumber = Number.parseInt(number, 10);
    if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
      return null;
    }
    return { repo: `${owner}/${repo}`, number: issueNumber };
  } catch {
    return null;
  }
}

function resolveIssueStates(
  repo: string,
  prs: PullRequestNode[]
): Map<string, string> {
  const issueKeys = Array.from(
    new Set(
      prs.flatMap((pr) =>
        (pr.closingIssuesReferences ?? []).map((issue) =>
          getIssueKey(issue, repo)
        )
      )
    )
  );
  const states = new Map<string, string>();

  for (const issueKey of issueKeys) {
    const hashIndex = issueKey.lastIndexOf('#');
    const issueRepo = issueKey.slice(0, hashIndex);
    const issueNumber = issueKey.slice(hashIndex + 1);

    try {
      const state = execFileSync(
        'gh',
        ['api', `repos/${issueRepo}/issues/${issueNumber}`, '--jq', '.state'],
        {
          encoding: 'utf8',
        }
      )
        .trim()
        .toUpperCase();
      states.set(issueKey, state);
    } catch {
      states.set(issueKey, 'UNKNOWN');
    }
  }

  return states;
}

function buildReport(prs: PullRequestNode[], repo: string): Report {
  const issueStates = resolveIssueStates(repo, prs);
  const candidates: CandidateRecord[] = prs.map((pr) => {
    const evaluation = evaluateEligibility(pr, issueStates, repo);
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      mergeStateStatus: normalizeMergeStateStatus(pr.mergeStateStatus),
      eligible: evaluation.eligible,
      reasons: evaluation.reasons,
      approvals: evaluation.approvals,
      ciState: evaluation.ciState,
      linkedOpenIssues: evaluation.linkedOpenIssues,
      highApprovalWaiver: evaluation.highApprovalWaiver,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    repo,
    allowedPrefixes: FAST_TRACK_PREFIXES,
    summary: {
      totalOpenPrs: prs.length,
      eligiblePrs: candidates.filter((candidate) => candidate.eligible).length,
      mergeReadyEligiblePrs: candidates.filter(
        (candidate) =>
          candidate.eligible && isMergeReady(candidate.mergeStateStatus)
      ).length,
    },
    candidates,
  };
}

export function printHumanReport(report: Report): void {
  const eligible = report.candidates.filter((candidate) => candidate.eligible);
  const ineligible = report.candidates.filter(
    (candidate) => !candidate.eligible
  );

  console.log(`Repo: ${report.repo}`);
  console.log(
    `Fast-track eligible: ${eligible.length}/${report.summary.totalOpenPrs}`
  );
  console.log(`Merge-ready now: ${report.summary.mergeReadyEligiblePrs}`);

  if (eligible.length === 0) {
    console.log('No eligible PRs found.');
  } else {
    console.log('Eligible PRs:');
    for (const pr of eligible) {
      const linked =
        pr.linkedOpenIssues.map((num) => `#${num}`).join(', ') || 'none';
      const waiver = pr.highApprovalWaiver ? ' [high-approval waiver]' : '';
      console.log(
        `- #${pr.number} (${pr.approvals} approvals, CI ${pr.ciState}, merge ${pr.mergeStateStatus}, linked ${linked})${waiver} ${pr.url}`
      );
    }
  }

  if (ineligible.length > 0) {
    const closedIssueBlockers = ineligible.filter((pr) =>
      pr.reasons.some((r) => r.includes('OPEN linked issue'))
    );
    if (closedIssueBlockers.length > 0) {
      console.log(
        `\n⚠️  ${closedIssueBlockers.length} PR(s) blocked by closed issues:`
      );
      console.log(
        '   Keep linked issues OPEN until the PR merges to maintain fast-track eligibility.'
      );
      const sortedBlockers = [...closedIssueBlockers].sort(
        (a, b) => b.approvals - a.approvals
      );
      for (const pr of sortedBlockers) {
        console.log(
          `   - #${pr.number} (${pr.approvals} approvals): ${pr.url}`
        );
      }
    }
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const prs = loadPullRequests(options.repo, options.limit);
  const report = buildReport(prs, options.repo);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
