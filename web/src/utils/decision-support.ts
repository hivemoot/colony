import type {
  ActivityData,
  PullRequest,
  Proposal,
  Comment,
} from '../types/activity';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type BottleneckType =
  | 'unclaimed-work'
  | 'stalled-discussion'
  | 'competing-implementations'
  | 'traceability-gap'
  | 'stale-pr';

export interface BottleneckItem {
  number: number;
  title: string;
  /** Extra context (e.g. "2 open PRs: #60, #61") */
  detail?: string;
}

export interface Bottleneck {
  type: BottleneckType;
  label: string;
  items: BottleneckItem[];
}

export type ActionPriority = 'high' | 'medium' | 'low';

export interface SuggestedAction {
  priority: ActionPriority;
  description: string;
  /** Link anchor (proposal or PR number) */
  issueNumber: number;
}

// ──────────────────────────────────────────────
// Bottleneck Detection
// ──────────────────────────────────────────────

/** Stalled/Stale threshold: no activity in this many hours */
const STALE_HOURS = 24;

/**
 * Detect governance bottlenecks from existing activity data.
 *
 * Bottleneck types:
 * 1. Unclaimed work — ready-to-implement proposals with no linked open PR
 * 2. Stalled discussions — proposals in discussion with no recent comments
 * 3. Competing implementations — proposals with multiple open PRs
 * 4. Traceability gap — implemented proposals with no linked merged PR
 * 5. Stale PR — open PRs with no recent activity
 *
 * Pure function — no side effects, no API calls.
 */
export function detectBottlenecks(data: ActivityData): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  const now = new Date(data.generatedAt);

  const unclaimed = findUnclaimedWork(data.proposals, data.pullRequests);
  if (unclaimed.length > 0) {
    bottlenecks.push({
      type: 'unclaimed-work',
      label: 'Unclaimed Work',
      items: unclaimed,
    });
  }

  const stalled = findStalledDiscussions(data.proposals, data.comments, now);
  if (stalled.length > 0) {
    bottlenecks.push({
      type: 'stalled-discussion',
      label: 'Stalled Discussions',
      items: stalled,
    });
  }

  const competing = findCompetingImplementations(
    data.proposals,
    data.pullRequests
  );
  if (competing.length > 0) {
    bottlenecks.push({
      type: 'competing-implementations',
      label: 'Competing Implementations',
      items: competing,
    });
  }

  const gaps = findTraceabilityGaps(data.proposals, data.pullRequests);
  if (gaps.length > 0) {
    bottlenecks.push({
      type: 'traceability-gap',
      label: 'Traceability Gaps',
      items: gaps,
    });
  }

  const stalePRs = findStalePRs(data.pullRequests, data.comments, now);
  if (stalePRs.length > 0) {
    bottlenecks.push({
      type: 'stale-pr',
      label: 'Stale Pull Requests',
      items: stalePRs,
    });
  }

  return bottlenecks;
}

// ──────────────────────────────────────────────
// Suggested Actions
// ──────────────────────────────────────────────

/**
 * Generate suggested actions from detected bottlenecks.
 *
 * Actions are sorted by priority:
 * - High: competing implementations, stale PRs
 * - Medium: stalled discussions, traceability gaps
 * - Low: unclaimed work
 */
export function suggestActions(
  bottlenecks: Bottleneck[],
  _data: ActivityData
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  for (const b of bottlenecks) {
    switch (b.type) {
      case 'competing-implementations':
        for (const item of b.items) {
          actions.push({
            priority: 'high',
            description: `#${item.number} "${item.title}" has ${item.detail} — coordinate to avoid wasted effort`,
            issueNumber: item.number,
          });
        }
        break;

      case 'stale-pr':
        for (const item of b.items) {
          actions.push({
            priority: 'high',
            description: `PR #${item.number} "${item.title}" is stale (${item.detail}) — needs review or update`,
            issueNumber: item.number,
          });
        }
        break;

      case 'stalled-discussion':
        for (const item of b.items) {
          actions.push({
            priority: 'medium',
            description: `#${item.number} "${item.title}" discussion stalled (${item.detail}) — add feedback or summarize for voting`,
            issueNumber: item.number,
          });
        }
        break;

      case 'traceability-gap':
        for (const item of b.items) {
          actions.push({
            priority: 'medium',
            description: `#${item.number} "${item.title}" is implemented but missing a linked PR — fix metadata`,
            issueNumber: item.number,
          });
        }
        break;

      case 'unclaimed-work':
        for (const item of b.items) {
          actions.push({
            priority: 'low',
            description: `#${item.number} "${item.title}" is approved but has no implementation PR — claim it`,
            issueNumber: item.number,
          });
        }
        break;
    }
  }

  // Sort by priority: high first
  const order: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => order[a.priority] - order[b.priority]);

  return actions;
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/**
 * Build a map of issue numbers referenced by PRs.
 *
 * Scans PR titles for closing keywords: Fixes #N, Closes #N, Resolves #N.
 * Returns Map<issueNumber, PullRequest[]>
 */
function buildPRToIssueMap(
  pullRequests: PullRequest[],
  onlyOpen = true
): Map<number, PullRequest[]> {
  const map = new Map<number, PullRequest[]>();
  const pattern = /(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;

  for (const pr of pullRequests) {
    if (onlyOpen && pr.state !== 'open') continue;

    // Scan both title and body for closing keywords
    const searchArea = `${pr.title} ${pr.body ?? ''}`;
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(searchArea)) !== null) {
      const issueNum = parseInt(match[1], 10);
      const existing = map.get(issueNum) ?? [];
      if (!existing.some((p) => p.number === pr.number)) {
        existing.push(pr);
        map.set(issueNum, existing);
      }
    }
  }

  return map;
}

/** Find ready-to-implement proposals with no linked open PR. */
function findUnclaimedWork(
  proposals: Proposal[],
  pullRequests: PullRequest[]
): BottleneckItem[] {
  const prMap = buildPRToIssueMap(pullRequests, true);
  const readyProposals = proposals.filter(
    (p) => p.phase === 'ready-to-implement'
  );

  return readyProposals
    .filter((p) => !prMap.has(p.number))
    .map((p) => ({ number: p.number, title: p.title }));
}

/** Find proposals in discussion with no recent comments. */
function findStalledDiscussions(
  proposals: Proposal[],
  comments: Comment[],
  now: Date
): BottleneckItem[] {
  const staleThreshold = now.getTime() - STALE_HOURS * 60 * 60 * 1000;

  const discussionProposals = proposals.filter((p) => p.phase === 'discussion');

  // Build a map of latest comment time per proposal
  const latestCommentByProposal = new Map<number, number>();
  for (const c of comments) {
    if (c.type !== 'proposal' && c.type !== 'issue') continue;
    const time = new Date(c.createdAt).getTime();
    const current = latestCommentByProposal.get(c.issueOrPrNumber) ?? 0;
    if (time > current) {
      latestCommentByProposal.set(c.issueOrPrNumber, time);
    }
  }

  const items: BottleneckItem[] = [];

  for (const p of discussionProposals) {
    const createdTime = new Date(p.createdAt).getTime();

    // Skip proposals created recently — they haven't had time to stall
    if (createdTime > staleThreshold) continue;

    const lastCommentTime = latestCommentByProposal.get(p.number);
    const lastActivity = lastCommentTime ?? createdTime;

    if (lastActivity <= staleThreshold) {
      const hoursAgo = Math.round(
        (now.getTime() - lastActivity) / (1000 * 60 * 60)
      );
      const detail =
        hoursAgo >= 48
          ? `${Math.round(hoursAgo / 24)}d since last comment`
          : `${hoursAgo}h since last comment`;
      items.push({ number: p.number, title: p.title, detail });
    }
  }

  return items;
}

/** Find proposals with multiple open PRs (competing implementations). */
function findCompetingImplementations(
  proposals: Proposal[],
  pullRequests: PullRequest[]
): BottleneckItem[] {
  const prMap = buildPRToIssueMap(pullRequests, true);
  const items: BottleneckItem[] = [];

  for (const p of proposals) {
    const prs = prMap.get(p.number);
    if (prs && prs.length >= 2) {
      const prNumbers = prs.map((pr) => `#${pr.number}`).join(', ');
      items.push({
        number: p.number,
        title: p.title,
        detail: `${prs.length} open PRs: ${prNumbers}`,
      });
    }
  }

  return items;
}

/** Find implemented proposals with no linked merged PR. */
function findTraceabilityGaps(
  proposals: Proposal[],
  pullRequests: PullRequest[]
): BottleneckItem[] {
  const prMap = buildPRToIssueMap(pullRequests, false);
  const implemented = proposals.filter((p) => p.phase === 'implemented');

  return implemented
    .filter((p) => {
      const prs = prMap.get(p.number) ?? [];
      return !prs.some((pr) => pr.state === 'merged');
    })
    .map((p) => ({
      number: p.number,
      title: p.title,
      detail: 'No merged PR links to this issue',
    }));
}

/** Find open PRs with no activity in STALE_HOURS. */
function findStalePRs(
  pullRequests: PullRequest[],
  comments: Comment[],
  now: Date
): BottleneckItem[] {
  const staleThreshold = now.getTime() - STALE_HOURS * 60 * 60 * 1000;
  const openPRs = pullRequests.filter((pr) => pr.state === 'open' && !pr.draft);

  // Build a map of latest comment/review time per PR
  const latestActivityByPR = new Map<number, number>();
  for (const c of comments) {
    if (c.type !== 'pr' && c.type !== 'review') continue;
    const time = new Date(c.createdAt).getTime();
    const current = latestActivityByPR.get(c.issueOrPrNumber) ?? 0;
    if (time > current) {
      latestActivityByPR.set(c.issueOrPrNumber, time);
    }
  }

  const items: BottleneckItem[] = [];

  for (const pr of openPRs) {
    const createdTime = new Date(pr.createdAt).getTime();
    if (createdTime > staleThreshold) continue;

    const lastActivityTime = latestActivityByPR.get(pr.number);
    const lastActivity = lastActivityTime ?? createdTime;

    if (lastActivity <= staleThreshold) {
      const hoursAgo = Math.round(
        (now.getTime() - lastActivity) / (1000 * 60 * 60)
      );
      const detail =
        hoursAgo >= 48
          ? `${Math.round(hoursAgo / 24)}d since activity`
          : `${hoursAgo}h since activity`;
      items.push({ number: pr.number, title: pr.title, detail });
    }
  }

  return items;
}
