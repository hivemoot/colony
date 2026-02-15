/**
 * Static Activity Data Generator
 *
 * Fetches GitHub activity data (commits, issues, PRs) and writes it to
 * public/data/activity.json for the frontend to consume at runtime.
 *
 * Supports multiple repositories via COLONY_REPOSITORIES env var
 * (comma-separated "owner/repo" values). Falls back to a single repo
 * via COLONY_REPOSITORY or the default hivemoot/colony.
 *
 * Uses the GitHub REST API. When running in CI or locally, uses
 * GITHUB_TOKEN/GH_TOKEN for authentication; otherwise falls back to
 * unauthenticated requests.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Commit,
  Issue,
  PullRequest,
  PhaseTransition,
  Proposal,
  Comment,
  Agent,
  AgentStats,
  ActivityData,
  RepositoryInfo,
  RoadmapData,
  Horizon,
  RoadmapItem,
  ExternalVisibility,
  VisibilityCheck,
  GovernanceIncident,
  GovernanceIncidentCategory,
  GovernanceIncidentSeverity,
} from '../shared/types';

import {
  computeGovernanceSnapshot,
  appendSnapshot,
  buildGovernanceHistoryArtifact,
  parseGovernanceHistoryArtifact,
  type GovernanceHistoryArtifact,
} from '../shared/governance-snapshot.ts';
import { computeGovernanceHistoryIntegrity } from './governance-history-integrity';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'activity.json');
const HISTORY_FILE = join(OUTPUT_DIR, 'governance-history.json');
const ROADMAP_PATH = join(ROOT_DIR, 'ROADMAP.md');
const INDEX_HTML_PATH = join(ROOT_DIR, 'web', 'index.html');
const SITEMAP_PATH = join(ROOT_DIR, 'web', 'public', 'sitemap.xml');
const ROBOTS_PATH = join(ROOT_DIR, 'web', 'public', 'robots.txt');

const GITHUB_API = 'https://api.github.com';
const DEFAULT_OWNER = 'hivemoot';
const DEFAULT_REPO = 'colony';
const DEFAULT_DEPLOYED_BASE_URL = 'https://hivemoot.github.io/colony';
const REQUIRED_DISCOVERABILITY_TOPICS = [
  'autonomous-agents',
  'ai-governance',
  'multi-agent',
  'agent-collaboration',
  'dashboard',
  'react',
  'typescript',
  'github-pages',
  'open-source',
];
const HISTORY_GENERATOR_ID = 'web/scripts/generate-data.ts';
const HISTORY_GENERATOR_VERSION = process.env.npm_package_version ?? '0.1.0';

export interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count?: number;
  homepage?: string | null;
  description?: string | null;
  topics?: string[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  state_reason?: string | null;
  labels: Array<{ name: string }>;
  created_at: string;
  closed_at: string | null;
  user: { login: string };
  comments: number;
  pull_request?: unknown;
}

export interface GitHubComment {
  user: { login: string };
  body: string;
  reactions?: {
    '+1': number;
    '-1': number;
  };
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  merged_at: string | null;
  closed_at: string | null;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
}

export interface GitHubEvent {
  id: string;
  type: string;
  actor: {
    login: string;
    avatar_url: string;
  };
  payload: {
    action?: string;
    label?: {
      name: string;
    };
    comment?: {
      id: number;
      body: string;
      html_url: string;
    };
    issue?: {
      number: number;
      title: string;
      pull_request?: unknown;
      html_url?: string;
    };
    pull_request?: {
      number: number;
    };
    review?: {
      id: number;
      body: string | null;
      html_url: string;
      state?: string;
    };
  };
  created_at: string;
}

export interface GitHubTimelineEvent {
  event: string;
  label?: { name: string };
  created_at: string;
}

export async function fetchJson<T>(endpoint: string): Promise<T> {
  const url = `${GITHUB_API}${endpoint}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'colony-data-generator',
  };

  // Use GITHUB_TOKEN/GH_TOKEN if available (CI or local environment)
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText} for ${endpoint}`
    );
  }

  return response.json() as Promise<T>;
}

export function resolveRepository(env = process.env): {
  owner: string;
  repo: string;
} {
  const repository = env.COLONY_REPOSITORY ?? env.GITHUB_REPOSITORY;

  if (!repository) {
    return { owner: DEFAULT_OWNER, repo: DEFAULT_REPO };
  }

  const [owner, repo] = repository.split('/');

  if (!owner || !repo) {
    throw new Error(
      `Invalid repository "${repository}". Expected format "owner/repo".`
    );
  }

  return { owner, repo };
}

/**
 * Resolve the list of repositories to track.
 * Reads COLONY_REPOSITORIES (comma-separated "owner/repo" values) first,
 * then falls back to resolveRepository() for single-repo mode.
 */
export function resolveRepositories(
  env = process.env
): Array<{ owner: string; repo: string }> {
  const multiRepo = env.COLONY_REPOSITORIES;

  if (!multiRepo) {
    return [resolveRepository(env)];
  }

  const repos = multiRepo
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (repos.length === 0) {
    return [resolveRepository(env)];
  }

  const seen = new Set<string>();
  const result: Array<{ owner: string; repo: string }> = [];

  for (const r of repos) {
    const [owner, repo] = r.split('/');
    if (!owner || !repo) {
      throw new Error(
        `Invalid repository "${r}" in COLONY_REPOSITORIES. Expected format "owner/repo".`
      );
    }
    const key = `${owner}/${repo}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ owner, repo });
    }
  }

  return result;
}

export function mapCommits(
  ghCommits: GitHubCommit[],
  repoTag?: string
): {
  commits: Commit[];
  agents: Agent[];
} {
  const commits: Commit[] = ghCommits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split('\n')[0],
    author: c.author?.login ?? c.commit.author.name,
    date: c.commit.author.date,
    ...(repoTag ? { repo: repoTag } : {}),
  }));

  const agents: Agent[] = ghCommits
    .map((c) => c.author)
    .filter((a): a is { login: string; avatar_url: string } => a !== null)
    .map((a) => ({
      login: a.login,
      avatarUrl: a.avatar_url,
    }));

  return { commits, agents };
}

async function fetchCommits(
  owner: string,
  repo: string,
  repoTag?: string
): Promise<{ commits: Commit[]; agents: Agent[] }> {
  const ghCommits = await fetchJson<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?per_page=50`
  );

  return mapCommits(ghCommits, repoTag);
}

export function mapIssues(
  ghIssues: GitHubIssue[],
  repoTag?: string
): {
  issues: Issue[];
  rawIssues: GitHubIssue[];
} {
  const allIssues = ghIssues
    // Filter out PRs (GitHub includes them in issues endpoint)
    .filter((i) => !i.pull_request)
    // Sort by creation date descending
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const issues: Issue[] = allIssues.slice(0, 20).map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state as 'open' | 'closed',
    labels: i.labels.map((l) => l.name),
    author: i.user.login,
    createdAt: i.created_at,
    ...(i.closed_at ? { closedAt: i.closed_at } : {}),
    ...(repoTag ? { repo: repoTag } : {}),
  }));

  return { issues, rawIssues: allIssues };
}

async function fetchIssues(
  owner: string,
  repo: string,
  repoTag?: string
): Promise<{
  issues: Issue[];
  rawIssues: GitHubIssue[];
}> {
  // Fetch both open and closed issues
  const [openPage1, openPage2, closedPage1, closedPage2, closedPage3] =
    await Promise.all([
      fetchJson<GitHubIssue[]>(
        `/repos/${owner}/${repo}/issues?state=open&per_page=100&page=1`
      ),
      fetchJson<GitHubIssue[]>(
        `/repos/${owner}/${repo}/issues?state=open&per_page=100&page=2`
      ),
      fetchJson<GitHubIssue[]>(
        `/repos/${owner}/${repo}/issues?state=closed&per_page=100&page=1`
      ),
      fetchJson<GitHubIssue[]>(
        `/repos/${owner}/${repo}/issues?state=closed&per_page=100&page=2`
      ),
      fetchJson<GitHubIssue[]>(
        `/repos/${owner}/${repo}/issues?state=closed&per_page=100&page=3`
      ),
    ]);

  return mapIssues(
    [
      ...openPage1,
      ...openPage2,
      ...closedPage1,
      ...closedPage2,
      ...closedPage3,
    ],
    repoTag
  );
}

export function mapPullRequests(
  ghPRs: GitHubPR[],
  repoTag?: string
): {
  pullRequests: PullRequest[];
  agents: Agent[];
} {
  // Keep the full fetched PR set so proposal-to-PR linkage remains reliable
  // for historical decisions in the Decision Explorer.
  const allPRs = ghPRs.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const pullRequests: PullRequest[] = allPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    ...(pr.body?.trim() ? { body: pr.body.slice(0, 4000) } : {}),
    state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
    draft: pr.draft || undefined,
    author: pr.user.login,
    createdAt: pr.created_at,
    ...(pr.merged_at ? { mergedAt: pr.merged_at } : {}),
    ...(pr.closed_at ? { closedAt: pr.closed_at } : {}),
    ...(repoTag ? { repo: repoTag } : {}),
  }));

  const agents: Agent[] = allPRs.map((pr) => ({
    login: pr.user.login,
    avatarUrl: pr.user.avatar_url,
  }));

  return { pullRequests, agents };
}

async function fetchPullRequests(
  owner: string,
  repo: string,
  repoTag?: string
): Promise<{
  pullRequests: PullRequest[];
  agents: Agent[];
}> {
  // Fetch both open and closed PRs
  const [openPRs, closedPRs] = await Promise.all([
    fetchJson<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=open&per_page=50`
    ),
    fetchJson<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=closed&per_page=50`
    ),
  ]);

  return mapPullRequests([...openPRs, ...closedPRs], repoTag);
}

async function fetchProposals(
  owner: string,
  repo: string,
  rawIssues: GitHubIssue[],
  repoTag?: string
): Promise<Proposal[]> {
  const proposalIssues = rawIssues.filter(
    (i) =>
      i.labels.some((l) => l.name.startsWith('phase:')) ||
      i.labels.some((l) => l.name === 'inconclusive') ||
      i.labels.some((l) => l.name === 'proposal')
  );

  const proposals: Proposal[] = [];
  const validPhases = [
    'discussion',
    'voting',
    'extended-voting',
    'ready-to-implement',
    'implemented',
    'rejected',
    'inconclusive',
  ] as const;

  for (const i of proposalIssues) {
    // Check for phase: prefixed label first, then standalone inconclusive label,
    // and finally fallback to 'discussion' if it only has the 'proposal' label.
    const phaseLabel = i.labels.find((l) => l.name.startsWith('phase:'))?.name;
    const phaseName =
      phaseLabel?.replace('phase:', '') ??
      (i.labels.some((l) => l.name === 'inconclusive')
        ? 'inconclusive'
        : i.labels.some((l) => l.name === 'proposal')
          ? 'discussion'
          : undefined);

    if (!phaseName || !(validPhases as readonly string[]).includes(phaseName))
      continue;

    let phase = phaseName as Proposal['phase'];

    // If the issue is closed, ensure the phase reflects its terminal state.
    // If it's already implemented, rejected, or inconclusive, keep it.
    // Otherwise, if it was closed as "completed", it's implemented.
    // If it was closed as "not planned", it's rejected.
    if (i.state === 'closed') {
      if (!['implemented', 'rejected', 'inconclusive'].includes(phase)) {
        if (i.state_reason === 'not_planned') {
          phase = 'rejected';
        } else {
          phase = 'implemented';
        }
      }
    }

    proposals.push({
      number: i.number,
      title: i.title,
      phase,
      author: i.user.login,
      createdAt: i.created_at,
      commentCount: i.comments,
      ...(repoTag ? { repo: repoTag } : {}),
    });
  }

  // Fetch votes for all proposals that have been through a voting round.
  // The Queen's voting comment persists after phase transitions, so we can
  // retrieve tallies for proposals that already passed or failed voting.
  const votablePhases: readonly string[] = [
    'voting',
    'extended-voting',
    'ready-to-implement',
    'implemented',
    'rejected',
    'inconclusive',
  ];
  const votingProposals = proposals.filter((p) =>
    votablePhases.includes(p.phase)
  );

  await Promise.all(
    votingProposals.map(async (proposal) => {
      try {
        const comments = await fetchJson<GitHubComment[]>(
          `/repos/${owner}/${repo}/issues/${proposal.number}/comments`
        );
        const votingComment = comments.find(
          (c) =>
            (c.user.login === 'hivemoot[bot]' || c.user.login === 'hivemoot') &&
            (c.body.includes('React to THIS comment to vote') ||
              (c.body.includes('hivemoot-metadata') &&
                c.body.includes('"type":"voting"')))
        );
        if (votingComment && votingComment.reactions) {
          proposal.votesSummary = {
            thumbsUp: votingComment.reactions['+1'] || 0,
            thumbsDown: votingComment.reactions['-1'] || 0,
          };
        }
      } catch (e) {
        console.warn(
          `Failed to fetch reactions for issue #${proposal.number}`,
          e
        );
      }
    })
  );

  return proposals.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function extractPhaseTransitions(
  timelineEvents: GitHubTimelineEvent[]
): PhaseTransition[] {
  return timelineEvents
    .filter(
      (event) =>
        event.event === 'labeled' && event.label?.name?.startsWith('phase:')
    )
    .map((event) => ({
      phase: event.label?.name.replace('phase:', '') ?? '',
      enteredAt: event.created_at,
    }))
    .sort(
      (a, b) =>
        new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime()
    );
}

async function fetchPhaseTransitions(
  owner: string,
  repo: string,
  proposals: Proposal[]
): Promise<void> {
  await Promise.all(
    proposals.map(async (proposal) => {
      try {
        const timeline = await fetchJson<GitHubTimelineEvent[]>(
          `/repos/${owner}/${repo}/issues/${proposal.number}/timeline?per_page=100`
        );

        const transitions = extractPhaseTransitions(timeline);
        if (transitions.length > 0) {
          proposal.phaseTransitions = transitions;
        }
      } catch (e) {
        console.warn(`Failed to fetch timeline for #${proposal.number}`, e);
      }
    })
  );
}

export function mapEvents(
  ghEvents: GitHubEvent[],
  owner: string,
  repo: string,
  repoTag?: string
): {
  comments: Comment[];
  agents: Agent[];
} {
  const comments: Comment[] = [];
  const agents: Agent[] = [];

  for (const event of ghEvents) {
    if (
      event.type === 'IssueCommentEvent' &&
      event.payload.action === 'created'
    ) {
      const { comment, issue } = event.payload;
      if (!comment || !issue) continue;
      comments.push({
        id: comment.id,
        issueOrPrNumber: issue.number,
        type: issue.pull_request ? 'pr' : 'issue',
        author: event.actor.login,
        body: comment.body.slice(0, 200),
        createdAt: event.created_at,
        url: comment.html_url,
        ...(repoTag ? { repo: repoTag } : {}),
      });
      agents.push({
        login: event.actor.login,
        avatarUrl: event.actor.avatar_url,
      });
    } else if (
      event.type === 'PullRequestReviewEvent' &&
      event.payload.action === 'created'
    ) {
      const { review, pull_request } = event.payload;
      if (!review || !pull_request) continue;

      let body = review.body?.slice(0, 200) || '';
      if (!body) {
        const state = review.state?.toLowerCase() || 'reviewed';
        body = state.charAt(0).toUpperCase() + state.slice(1) + ' changes';
      }

      comments.push({
        id: review.id,
        issueOrPrNumber: pull_request.number,
        type: 'review',
        author: event.actor.login,
        body,
        createdAt: event.created_at,
        url: review.html_url,
        ...(repoTag ? { repo: repoTag } : {}),
      });
      agents.push({
        login: event.actor.login,
        avatarUrl: event.actor.avatar_url,
      });
    } else if (
      event.type === 'PullRequestReviewCommentEvent' &&
      event.payload.action === 'created'
    ) {
      const { comment, pull_request } = event.payload;
      if (!comment || !pull_request) continue;
      comments.push({
        id: comment.id,
        issueOrPrNumber: pull_request.number,
        type: 'review',
        author: event.actor.login,
        body: comment.body.slice(0, 200),
        createdAt: event.created_at,
        url: comment.html_url,
        ...(repoTag ? { repo: repoTag } : {}),
      });
      agents.push({
        login: event.actor.login,
        avatarUrl: event.actor.avatar_url,
      });
    } else if (
      event.type === 'IssuesEvent' &&
      event.payload.action === 'labeled'
    ) {
      const { issue, label } = event.payload;
      if (!issue || !label || !label.name.startsWith('phase:')) continue;

      const phase = label.name.replace('phase:', '');
      comments.push({
        id: parseInt(event.id),
        issueOrPrNumber: issue.number,
        type: 'proposal',
        author: event.actor.login,
        body: `Moved to ${phase} phase`,
        createdAt: event.created_at,
        url:
          issue.html_url ||
          `https://github.com/${owner}/${repo}/issues/${issue.number}`,
        ...(repoTag ? { repo: repoTag } : {}),
      });
      agents.push({
        login: event.actor.login,
        avatarUrl: event.actor.avatar_url,
      });
    }
  }

  return { comments, agents };
}

async function fetchEvents(
  owner: string,
  repo: string,
  repoTag?: string
): Promise<{
  comments: Comment[];
  agents: Agent[];
}> {
  const ghEvents = await fetchJson<GitHubEvent[]>(
    `/repos/${owner}/${repo}/events?per_page=100`
  );

  return mapEvents(ghEvents, owner, repo, repoTag);
}

async function fetchRepoMetadata(
  owner: string,
  repo: string
): Promise<GitHubRepo> {
  return fetchJson<GitHubRepo>(`/repos/${owner}/${repo}`);
}

export function calculateOpenIssues(
  repoMetadata: GitHubRepo,
  pullRequests: PullRequest[]
): number {
  const openPRsCount = pullRequests.filter((pr) => pr.state === 'open').length;
  return Math.max(0, repoMetadata.open_issues_count - openPRsCount);
}

interface IncidentRule {
  category: GovernanceIncidentCategory;
  severity: GovernanceIncidentSeverity;
  title: string;
  matcher: (body: string) => boolean;
}

const INCIDENT_RULES: IncidentRule[] = [
  {
    category: 'permissions',
    severity: 'high',
    title: 'Admin-required blocker',
    matcher: (body) => /\bblocked:\s*admin-required\b/i.test(body),
  },
  {
    category: 'maintainer-gate',
    severity: 'high',
    title: 'Maintainer gate required',
    matcher: (body) =>
      /\bblocked:\s*merge-required\b/i.test(body) ||
      /mergepullrequest/i.test(body) ||
      /\bmaintainer\b.*\brequired\b/i.test(body),
  },
  {
    category: 'permissions',
    severity: 'high',
    title: 'Push permissions denied',
    matcher: (body) =>
      /permission to .* denied/i.test(body) ||
      /"push"\s*:\s*false/i.test(body) ||
      /\bpush=false\b/i.test(body),
  },
  {
    category: 'ci-regression',
    severity: 'medium',
    title: 'CI regression detected',
    matcher: (body) =>
      /\bci-regression\b/i.test(body) ||
      ((/\bci\b/i.test(body) ||
        /\bcheck(s)?\b/i.test(body) ||
        /\btest(s)?\b/i.test(body) ||
        /\blint\b/i.test(body) ||
        /\bbuild\b/i.test(body)) &&
        /\b(fail(?:ed|ing)?|regression|broken|timeout)\b/i.test(body)),
  },
  {
    category: 'automation-failure',
    severity: 'medium',
    title: 'Automation failure',
    matcher: (body) =>
      /\bautomation-failure\b/i.test(body) ||
      (/\bautomation\b/i.test(body) &&
        /\b(fail(?:ed|ure)?|error|outage|timeout)\b/i.test(body)) ||
      /\brate[-\s]?limit/i.test(body),
  },
  {
    category: 'governance-deadlock',
    severity: 'medium',
    title: 'Governance deadlock risk',
    matcher: (body) =>
      /\bcompeting implementations?\b/i.test(body) ||
      /\bcompeting implementation\b/i.test(body) ||
      /\btraceability gap\b/i.test(body) ||
      /\bmissing\b.*\bclosing keyword\b/i.test(body) ||
      /\bstale claim\b/i.test(body) ||
      /\bexternal visibility\b/i.test(body) ||
      /\bdiscoverability\b/i.test(body) ||
      /\bsocial preview\b/i.test(body),
  },
];

function summarizeIncidentDetails(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= 180 ? trimmed : `${trimmed.slice(0, 177)}...`;
}

function inferIncidentStatus(body: string): GovernanceIncident['status'] {
  if (/\bverified\b/i.test(body) || /\bresolved\b/i.test(body)) {
    return 'mitigated';
  }
  return 'open';
}

export function extractGovernanceIncidents(
  comments: Comment[]
): GovernanceIncident[] {
  const incidents: GovernanceIncident[] = [];
  const seen = new Set<string>();

  for (const comment of comments) {
    const body = comment.body ?? '';
    if (!body) continue;

    for (const rule of INCIDENT_RULES) {
      if (!rule.matcher(body)) continue;

      const dedupeKey = `${comment.id}:${rule.category}:${rule.title}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      incidents.push({
        id: `${comment.id}-${rule.category}-${rule.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        details: summarizeIncidentDetails(body),
        detectedAt: comment.createdAt,
        sourceUrl: comment.url,
        status: inferIncidentStatus(body),
        ...(comment.repo ? { repo: comment.repo } : {}),
      });
    }
  }

  return incidents.sort(
    (a, b) =>
      new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
}

export function parseRoadmap(content: string): RoadmapData {
  const horizons: Horizon[] = [];
  const horizonRegex =
    /### Horizon (\d+): (.*?) \((.*?)\)\n(.*?)\n([\s\S]*?)(?=### Horizon|\n---|$)/g;
  let match;

  while ((match = horizonRegex.exec(content)) !== null) {
    const [, id, title, status, subtitle, itemsRaw] = match;
    const items: RoadmapItem[] = [];
    const itemRegex =
      /- \[(x| )\] \*\*(.*?)\*\*(?: \(#(\d+)\))?(?:: (.*?))?$/gm;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(itemsRaw)) !== null) {
      const [, doneChar, task, issueNumber, description] = itemMatch;
      items.push({
        task,
        done: doneChar === 'x',
        ...(description ? { description: description.trim() } : {}),
        ...(issueNumber ? { issueNumber: parseInt(issueNumber, 10) } : {}),
      });
    }

    horizons.push({
      id: parseInt(id, 10),
      title: `Horizon ${id}: ${title}`,
      subtitle: subtitle.trim(),
      status: status.trim(),
      items,
    });
  }

  const statusRegex =
    /##\s+.*Current Status.*?\n\n([\s\S]*?)(?=\n\n\*|\n##\s+|$)/;
  const statusMatch = content.match(statusRegex);
  const currentStatus = statusMatch ? statusMatch[1].trim() : '';

  return { horizons, currentStatus };
}

function resolveDeployedBaseUrl(homepage?: string | null): {
  baseUrl: string;
  usedFallback: boolean;
} {
  const normalizedHomepage = normalizeHttpsHomepageUrl(homepage);
  if (normalizedHomepage) {
    return {
      baseUrl: normalizedHomepage,
      usedFallback: false,
    };
  }

  return {
    baseUrl: DEFAULT_DEPLOYED_BASE_URL,
    usedFallback: true,
  };
}

function normalizeHttpsHomepageUrl(homepage?: string | null): string {
  const trimmedHomepage = homepage?.trim();
  if (!trimmedHomepage) {
    return '';
  }

  try {
    const parsed = new URL(trimmedHomepage);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return '';
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function normalizeUrlForMatch(value: string): string {
  return value.replace(/\/+$/, '').toLowerCase();
}

function getAbsoluteHttpsUrl(rawValue: string): string {
  try {
    const parsed = new URL(rawValue);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function resolveHttpsUrl(rawValue: string, baseUrl: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.startsWith('data:')) {
    return '';
  }

  try {
    const parsed = new URL(trimmed, `${baseUrl}/`);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function iconHasRequiredSize(
  icon: { sizes?: unknown },
  expectedSize: string
): boolean {
  return (
    typeof icon.sizes === 'string' &&
    icon.sizes.toLowerCase().split(/\s+/).includes(expectedSize.toLowerCase())
  );
}
function extractTagAttributeValue(
  html: string,
  tagName: string,
  requiredAttribute: string,
  requiredValue: string,
  targetAttribute: string
): string {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const requiredValueNormalized = requiredValue.toLowerCase();
  const requiredAttributeNormalized = requiredAttribute.toLowerCase();

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const attrPattern = (attribute: string): RegExp =>
      new RegExp(
        `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
        'i'
      );
    const requiredAttrMatch = tag.match(attrPattern(requiredAttribute));
    const requiredAttrValue = (
      requiredAttrMatch?.[1] ??
      requiredAttrMatch?.[2] ??
      requiredAttrMatch?.[3] ??
      ''
    ).trim();
    if (!requiredAttrValue) {
      continue;
    }

    const requiredMatches =
      requiredAttributeNormalized === 'rel'
        ? requiredAttrValue
            .toLowerCase()
            .split(/\s+/)
            .includes(requiredValueNormalized)
        : requiredAttrValue.toLowerCase() === requiredValueNormalized;
    if (!requiredMatches) {
      continue;
    }

    const targetAttrMatch = tag.match(attrPattern(targetAttribute));
    const targetAttrValue = (
      targetAttrMatch?.[1] ??
      targetAttrMatch?.[2] ??
      targetAttrMatch?.[3] ??
      ''
    ).trim();
    if (targetAttrValue) {
      return targetAttrValue;
    }
  }

  return '';
}

function extractFileBackedFaviconHref(html: string): string {
  const tagPattern = /<link\b[^>]*>/gi;
  const attrPattern = (attribute: string): RegExp =>
    new RegExp(
      `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      'i'
    );

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const relMatch = tag.match(attrPattern('rel'));
    const relValue = (
      relMatch?.[1] ??
      relMatch?.[2] ??
      relMatch?.[3] ??
      ''
    ).trim();
    if (!relValue.toLowerCase().split(/\s+/).includes('icon')) {
      continue;
    }

    const hrefMatch = tag.match(attrPattern('href'));
    const hrefValue = (
      hrefMatch?.[1] ??
      hrefMatch?.[2] ??
      hrefMatch?.[3] ??
      ''
    ).trim();
    if (!hrefValue || hrefValue.toLowerCase().startsWith('data:')) {
      continue;
    }
    return hrefValue;
  }

  return '';
}

export async function buildExternalVisibility(
  repositories: RepositoryInfo[]
): Promise<ExternalVisibility> {
  const primary = repositories[0];
  const normalizedTopics = new Set(
    (primary?.topics ?? []).map((topic) => topic.toLowerCase())
  );
  const missingRequiredTopics = REQUIRED_DISCOVERABILITY_TOPICS.filter(
    (topic) => !normalizedTopics.has(topic)
  );

  const normalizedHomepage = normalizeHttpsHomepageUrl(primary?.homepage);
  const hasHomepage = Boolean(normalizedHomepage);
  const hasTopics = missingRequiredTopics.length === 0;
  const hasDescription = Boolean(
    primary?.description && /dashboard/i.test(primary.description)
  );

  const hasStructuredData =
    existsSync(INDEX_HTML_PATH) &&
    /<script\s+type=["']application\/ld\+json["']>/i.test(
      readFileSync(INDEX_HTML_PATH, 'utf-8')
    );

  const hasSitemapLastmod =
    existsSync(SITEMAP_PATH) &&
    /<lastmod>[^<]+<\/lastmod>/i.test(readFileSync(SITEMAP_PATH, 'utf-8'));

  const hasRobots =
    existsSync(ROBOTS_PATH) &&
    /Sitemap:\s*https?:\/\/\S+/i.test(readFileSync(ROBOTS_PATH, 'utf-8'));

  const checks: VisibilityCheck[] = [
    {
      id: 'has-homepage',
      label: 'Repository homepage URL configured',
      ok: hasHomepage,
      details: hasHomepage
        ? normalizedHomepage
        : 'Missing or invalid https homepage repository setting.',
      blockedByAdmin: !hasHomepage,
    },
    {
      id: 'has-topics',
      label: 'Repository topics configured',
      ok: hasTopics,
      details: hasTopics
        ? `${REQUIRED_DISCOVERABILITY_TOPICS.length}/${REQUIRED_DISCOVERABILITY_TOPICS.length} required topics present`
        : `Missing required topics: ${missingRequiredTopics.join(', ')}`,
      blockedByAdmin: !hasTopics,
    },
    {
      id: 'has-description',
      label: 'Repository description mentions dashboard',
      ok: hasDescription,
      details: hasDescription
        ? 'Description includes "dashboard"'
        : 'Description should mention the live dashboard.',
      blockedByAdmin: !hasDescription,
    },
    {
      id: 'has-structured-data',
      label: 'Structured metadata (JSON-LD) in HTML',
      ok: hasStructuredData,
      details: hasStructuredData
        ? 'application/ld+json found'
        : 'Missing application/ld+json block in web/index.html',
    },
    {
      id: 'has-sitemap-lastmod',
      label: 'Sitemap includes <lastmod>',
      ok: hasSitemapLastmod,
      details: hasSitemapLastmod
        ? 'Sitemap has lastmod metadata'
        : 'Missing <lastmod> in web/public/sitemap.xml',
    },
    {
      id: 'has-robots',
      label: 'robots.txt points to sitemap',
      ok: hasRobots,
      details: hasRobots
        ? 'robots.txt includes a Sitemap directive'
        : 'Missing Sitemap directive in web/public/robots.txt',
    },
  ];

  // Deployed site parity checks (Scout Intelligence)
  const { baseUrl, usedFallback } = resolveDeployedBaseUrl(primary?.homepage);
  const deployedSourceDetails = usedFallback
    ? `Fallback URL used: ${DEFAULT_DEPLOYED_BASE_URL} (repository homepage missing or invalid).`
    : `Source URL: ${baseUrl}`;

  const fetchWithTimeout = async (url: string): Promise<Response | null> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch {
      clearTimeout(id);
      return null;
    }
  };

  const [rootRes, robotsRes, sitemapRes, activityRes] = await Promise.all([
    fetchWithTimeout(baseUrl),
    fetchWithTimeout(`${baseUrl}/robots.txt`),
    fetchWithTimeout(`${baseUrl}/sitemap.xml`),
    fetchWithTimeout(`${baseUrl}/data/activity.json`),
  ]);

  // Root check
  checks.push({
    id: 'deployed-root-reachable',
    label: 'Deployed site is reachable',
    ok: rootRes?.status === 200,
    details: rootRes
      ? `GET / returned ${rootRes.status}. ${deployedSourceDetails}`
      : `Connection failed or timed out. ${deployedSourceDetails}`,
  });

  // JSON-LD on deployed root
  let deployedRootHtml = '';
  let deployedJsonLd = false;
  if (rootRes?.status === 200) {
    const html = await rootRes.text();
    deployedRootHtml = html;
    deployedJsonLd = /<script\s+type=["']application\/ld\+json["']>/i.test(
      html
    );
  }
  checks.push({
    id: 'deployed-jsonld',
    label: 'Deployed site has JSON-LD metadata',
    ok: deployedJsonLd,
    details: deployedJsonLd
      ? 'JSON-LD found on deployed homepage'
      : 'Missing JSON-LD on deployed homepage',
  });

  const canonicalUrl = extractTagAttributeValue(
    deployedRootHtml,
    'link',
    'rel',
    'canonical',
    'href'
  );
  const expectedCanonical = `${baseUrl}/`;
  const hasCanonicalParity =
    canonicalUrl.length > 0 &&
    normalizeUrlForMatch(canonicalUrl) ===
      normalizeUrlForMatch(expectedCanonical);
  checks.push({
    id: 'deployed-canonical',
    label: 'Deployed canonical URL matches homepage',
    ok: hasCanonicalParity,
    details: hasCanonicalParity
      ? `Canonical matches ${expectedCanonical}`
      : canonicalUrl
        ? `Canonical mismatch: expected ${expectedCanonical}, found ${canonicalUrl}`
        : 'Missing canonical link on deployed homepage',
  });

  const ogImageRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'property',
    'og:image',
    'content'
  );
  const ogImageUrl = ogImageRaw ? getAbsoluteHttpsUrl(ogImageRaw) : '';
  const ogImageRes = ogImageUrl ? await fetchWithTimeout(ogImageUrl) : null;
  const hasDeployedOgImage = ogImageRes?.status === 200;
  checks.push({
    id: 'deployed-og-image',
    label: 'Deployed Open Graph image reachable',
    ok: hasDeployedOgImage,
    details: hasDeployedOgImage
      ? `GET ${ogImageUrl} returned 200`
      : ogImageUrl
        ? `GET ${ogImageUrl} returned ${ogImageRes?.status ?? 'no response'}`
        : ogImageRaw
          ? `og:image must be an absolute https URL (found: ${ogImageRaw})`
          : 'Missing og:image metadata on deployed homepage',
  });

  const ogImageWidthRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'property',
    'og:image:width',
    'content'
  );
  const ogImageHeightRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'property',
    'og:image:height',
    'content'
  );
  const ogImageWidth = Number.parseInt(ogImageWidthRaw, 10);
  const ogImageHeight = Number.parseInt(ogImageHeightRaw, 10);
  const hasOgImageDimensions =
    Number.isInteger(ogImageWidth) &&
    Number.isInteger(ogImageHeight) &&
    ogImageWidth > 0 &&
    ogImageHeight > 0;
  checks.push({
    id: 'deployed-og-image-dimensions',
    label: 'Deployed Open Graph image dimensions are declared',
    ok: hasOgImageDimensions,
    details: hasOgImageDimensions
      ? `og:image dimensions set to ${ogImageWidth}x${ogImageHeight}`
      : !ogImageWidthRaw && !ogImageHeightRaw
        ? 'Missing og:image:width and og:image:height metadata on deployed homepage'
        : !ogImageWidthRaw
          ? 'Missing og:image:width metadata on deployed homepage'
          : !ogImageHeightRaw
            ? 'Missing og:image:height metadata on deployed homepage'
            : `Invalid og:image dimension values: width=${ogImageWidthRaw}, height=${ogImageHeightRaw}`,
  });

  const twitterImageRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'name',
    'twitter:image',
    'content'
  );
  const twitterImageSrcRaw = twitterImageRaw
    ? ''
    : extractTagAttributeValue(
        deployedRootHtml,
        'meta',
        'name',
        'twitter:image:src',
        'content'
      );
  const resolvedTwitterImageRaw = twitterImageRaw || twitterImageSrcRaw;
  const twitterImageUrl = resolvedTwitterImageRaw
    ? getAbsoluteHttpsUrl(resolvedTwitterImageRaw)
    : '';
  const twitterImageRes = twitterImageUrl
    ? await fetchWithTimeout(twitterImageUrl)
    : null;
  const hasDeployedTwitterImage = twitterImageRes?.status === 200;
  checks.push({
    id: 'deployed-twitter-image',
    label: 'Deployed Twitter image reachable',
    ok: hasDeployedTwitterImage,
    details: hasDeployedTwitterImage
      ? `GET ${twitterImageUrl} returned 200`
      : twitterImageUrl
        ? `GET ${twitterImageUrl} returned ${twitterImageRes?.status ?? 'no response'}`
        : resolvedTwitterImageRaw
          ? `twitter:image must be an absolute https URL (found: ${resolvedTwitterImageRaw})`
          : 'Missing twitter:image metadata on deployed homepage',
  });

  const manifestRaw = extractTagAttributeValue(
    deployedRootHtml,
    'link',
    'rel',
    'manifest',
    'href'
  );
  const manifestUrl = manifestRaw ? resolveHttpsUrl(manifestRaw, baseUrl) : '';
  const manifestRes = manifestUrl ? await fetchWithTimeout(manifestUrl) : null;

  const requiredManifestSizes = ['192x192', '512x512'] as const;
  const manifestIconUrls: Partial<
    Record<(typeof requiredManifestSizes)[number], string>
  > = {};
  let manifestIconDetails = '';

  if (!manifestRaw) {
    manifestIconDetails = 'Missing manifest link metadata on deployed homepage';
  } else if (!manifestUrl) {
    manifestIconDetails = `Manifest URL must resolve to absolute https URL (found: ${manifestRaw})`;
  } else if (manifestRes?.status !== 200) {
    manifestIconDetails = `GET ${manifestUrl} returned ${manifestRes?.status ?? 'no response'}`;
  } else {
    try {
      const manifest = (await manifestRes.json()) as {
        icons?: Array<{ src?: unknown; sizes?: unknown }>;
      };

      if (!Array.isArray(manifest.icons)) {
        manifestIconDetails = 'Manifest is missing icons[] entries';
      } else {
        const missingSizes: string[] = [];
        const invalidIconUrls: string[] = [];
        for (const size of requiredManifestSizes) {
          const icon = manifest.icons.find((entry) =>
            iconHasRequiredSize(entry, size)
          );
          if (!icon || typeof icon.src !== 'string' || !icon.src.trim()) {
            missingSizes.push(size);
            continue;
          }

          const iconUrl = resolveHttpsUrl(icon.src, manifestUrl);
          if (!iconUrl) {
            invalidIconUrls.push(`${size} (${icon.src})`);
            continue;
          }
          manifestIconUrls[size] = iconUrl;
        }

        if (missingSizes.length > 0 || invalidIconUrls.length > 0) {
          const parts: string[] = [];
          if (missingSizes.length > 0) {
            parts.push(
              `Missing required icon sizes: ${missingSizes.join(', ')}`
            );
          }
          if (invalidIconUrls.length > 0) {
            parts.push(
              `Icon URLs must resolve to absolute https URLs: ${invalidIconUrls.join(', ')}`
            );
          }
          manifestIconDetails = parts.join('. ');
        } else {
          manifestIconDetails = `Manifest contains ${requiredManifestSizes.join(' and ')} icons`;
        }
      }
    } catch {
      manifestIconDetails = `Manifest at ${manifestUrl} is not valid JSON`;
    }
  }

  checks.push({
    id: 'deployed-pwa-manifest',
    label: 'Deployed PWA manifest has required square icons',
    ok:
      manifestIconDetails ===
      `Manifest contains ${requiredManifestSizes.join(' and ')} icons`,
    details: manifestIconDetails,
  });

  const manifestIconFetches = await Promise.all(
    requiredManifestSizes.map(async (size) => {
      const url = manifestIconUrls[size];
      if (!url) {
        return { size, status: null as number | null, url: '' };
      }
      const response = await fetchWithTimeout(url);
      return { size, status: response?.status ?? null, url };
    })
  );
  const allManifestIconsReachable = manifestIconFetches.every(
    ({ status }) => status === 200
  );
  const manifestFetchDetails = allManifestIconsReachable
    ? manifestIconFetches
        .map(({ size, url }) => `${size}: GET ${url} returned 200`)
        .join('; ')
    : manifestIconFetches
        .map(({ size, status, url }) =>
          url
            ? `${size}: GET ${url} returned ${status ?? 'no response'}`
            : `${size}: missing manifest icon URL`
        )
        .join('; ');
  checks.push({
    id: 'deployed-pwa-icons',
    label: 'Deployed PWA icon assets are reachable',
    ok: allManifestIconsReachable,
    details: manifestFetchDetails,
  });

  const faviconRaw = extractFileBackedFaviconHref(deployedRootHtml);
  let faviconUrl = '';
  if (faviconRaw) {
    try {
      faviconUrl = new URL(faviconRaw, `${baseUrl}/`).toString();
    } catch {
      faviconUrl = '';
    }
  }
  const faviconRes = faviconUrl ? await fetchWithTimeout(faviconUrl) : null;
  const hasDeployedFavicon = faviconRes?.status === 200;
  checks.push({
    id: 'deployed-favicon',
    label: 'Deployed favicon reachable',
    ok: hasDeployedFavicon,
    details: hasDeployedFavicon
      ? `GET ${faviconUrl} returned 200`
      : faviconUrl
        ? `GET ${faviconUrl} returned ${faviconRes?.status ?? 'no response'}`
        : faviconRaw
          ? `Invalid favicon URL: ${faviconRaw}`
          : 'Missing file-backed favicon metadata on deployed homepage',
  });

  const appleTouchIconRaw = extractTagAttributeValue(
    deployedRootHtml,
    'link',
    'rel',
    'apple-touch-icon',
    'href'
  );
  const appleTouchIconUrl = appleTouchIconRaw
    ? resolveHttpsUrl(appleTouchIconRaw, baseUrl)
    : '';
  const appleTouchIconRes = appleTouchIconUrl
    ? await fetchWithTimeout(appleTouchIconUrl)
    : null;
  const hasDeployedAppleTouchIcon = appleTouchIconRes?.status === 200;
  checks.push({
    id: 'deployed-apple-touch-icon',
    label: 'Deployed Apple touch icon reachable',
    ok: hasDeployedAppleTouchIcon,
    details: hasDeployedAppleTouchIcon
      ? `GET ${appleTouchIconUrl} returned 200`
      : appleTouchIconUrl
        ? `GET ${appleTouchIconUrl} returned ${appleTouchIconRes?.status ?? 'no response'}`
        : appleTouchIconRaw
          ? `apple-touch-icon href must resolve to an https URL (found: ${appleTouchIconRaw})`
          : 'Missing apple-touch-icon link tag on deployed homepage',
  });

  // Robots check
  const robotsText = robotsRes?.status === 200 ? await robotsRes.text() : '';
  const hasDeployedRobotsSitemap = /Sitemap:\s*https?:\/\/\S+/i.test(
    robotsText
  );
  checks.push({
    id: 'deployed-robots-reachable',
    label: 'Deployed robots.txt reachable',
    ok: robotsRes?.status === 200,
    details: robotsRes ? `Status ${robotsRes.status}` : 'Fetch failed',
  });
  checks.push({
    id: 'deployed-robots-sitemap',
    label: 'Deployed robots.txt has sitemap',
    ok: hasDeployedRobotsSitemap,
    details: hasDeployedRobotsSitemap
      ? 'Sitemap directive found'
      : 'Missing Sitemap directive in live robots.txt',
  });

  // Sitemap check
  const sitemapText = sitemapRes?.status === 200 ? await sitemapRes.text() : '';
  const hasDeployedSitemapLastmod = /<lastmod>[^<]+<\/lastmod>/i.test(
    sitemapText
  );
  checks.push({
    id: 'deployed-sitemap-reachable',
    label: 'Deployed sitemap.xml reachable',
    ok: sitemapRes?.status === 200,
    details: sitemapRes ? `Status ${sitemapRes.status}` : 'Fetch failed',
  });
  checks.push({
    id: 'deployed-sitemap-lastmod',
    label: 'Deployed sitemap has <lastmod>',
    ok: hasDeployedSitemapLastmod,
    details: hasDeployedSitemapLastmod
      ? 'Found lastmod in live sitemap'
      : 'Missing lastmod in live sitemap',
  });

  // Freshness check
  let freshnessDetails = `Could not fetch deployed activity data. ${deployedSourceDetails}`;
  let freshnessOk = false;
  if (activityRes?.status === 200) {
    try {
      const activity = (await activityRes.json()) as {
        generatedAt?: unknown;
      };
      if (typeof activity.generatedAt === 'string') {
        const timestamp = new Date(activity.generatedAt).getTime();
        if (!isNaN(timestamp)) {
          const ageMs = Date.now() - timestamp;
          const ageHours = ageMs / (1000 * 60 * 60);
          freshnessOk = ageHours <= 18; // Critical threshold from proposal
          freshnessDetails = `Deployed data is ${Math.round(ageHours)}h old`;
        } else {
          freshnessDetails = `Invalid timestamp in deployed activity.json. ${deployedSourceDetails}`;
        }
      } else {
        freshnessDetails = `Missing generatedAt in deployed activity.json. ${deployedSourceDetails}`;
      }
    } catch {
      freshnessDetails = `Invalid activity.json format on deployed site. ${deployedSourceDetails}`;
    }
  }
  checks.push({
    id: 'deployed-activity-freshness',
    label: 'Deployed data freshness',
    ok: freshnessOk,
    details: freshnessDetails,
  });

  const passCount = checks.filter((check) => check.ok).length;
  const score = Math.round((passCount / checks.length) * 100);
  const failingCount = checks.length - passCount;
  const status =
    failingCount === 0 ? 'green' : failingCount <= 2 ? 'yellow' : 'red';
  const blockers = checks
    .filter((check) => !check.ok && check.blockedByAdmin)
    .map((check) => check.label);

  return {
    status,
    score,
    checks,
    blockers,
  };
}

export function deduplicateAgents(agentSources: Agent[]): Agent[] {
  const agentMap = new Map<string, Agent>();
  agentSources.forEach((agent) => {
    agentMap.set(agent.login, agent);
  });
  return Array.from(agentMap.values());
}

export function aggregateAgentStats(
  commits: Commit[],
  issues: Issue[],
  pullRequests: PullRequest[],
  comments: Comment[],
  agentMap: Map<string, Agent>
): AgentStats[] {
  const statsMap = new Map<string, AgentStats>();

  const getOrCreateStats = (login: string, avatarUrl?: string): AgentStats => {
    let stats = statsMap.get(login);
    if (!stats) {
      stats = {
        login,
        avatarUrl,
        commits: 0,
        pullRequestsMerged: 0,
        issuesOpened: 0,
        reviews: 0,
        comments: 0,
        lastActiveAt: new Date(0).toISOString(),
      };
      statsMap.set(login, stats);
    }
    return stats;
  };

  const updateLastActive = (stats: AgentStats, dateStr: string): void => {
    if (new Date(dateStr) > new Date(stats.lastActiveAt)) {
      stats.lastActiveAt = dateStr;
    }
  };

  commits.forEach((c) => {
    const stats = getOrCreateStats(c.author, agentMap.get(c.author)?.avatarUrl);
    stats.commits++;
    updateLastActive(stats, c.date);
  });

  issues.forEach((i) => {
    const stats = getOrCreateStats(i.author, agentMap.get(i.author)?.avatarUrl);
    stats.issuesOpened++;
    updateLastActive(stats, i.closedAt ?? i.createdAt);
  });

  pullRequests.forEach((pr) => {
    const stats = getOrCreateStats(
      pr.author,
      agentMap.get(pr.author)?.avatarUrl
    );
    if (pr.state === 'merged') {
      stats.pullRequestsMerged++;
    }
    updateLastActive(stats, pr.mergedAt ?? pr.closedAt ?? pr.createdAt);
  });

  comments.forEach((c) => {
    const stats = getOrCreateStats(c.author, agentMap.get(c.author)?.avatarUrl);
    if (c.type === 'review') {
      stats.reviews++;
    } else {
      stats.comments++;
    }
    updateLastActive(stats, c.createdAt);
  });

  return Array.from(statsMap.values()).sort((a, b) => {
    return (
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  });
}

/** Fetch all activity data for a single repository. */
async function fetchRepoActivity(
  owner: string,
  repo: string,
  repoTag?: string
): Promise<{
  repoInfo: RepositoryInfo;
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
  proposals: Proposal[];
  comments: Comment[];
  agents: Agent[];
}> {
  const [repoMetadata, commitResult, issueResult, prResult, eventResult] =
    await Promise.all([
      fetchRepoMetadata(owner, repo),
      fetchCommits(owner, repo, repoTag),
      fetchIssues(owner, repo, repoTag),
      fetchPullRequests(owner, repo, repoTag),
      fetchEvents(owner, repo, repoTag),
    ]);

  const proposals = await fetchProposals(
    owner,
    repo,
    issueResult.rawIssues,
    repoTag
  );
  await fetchPhaseTransitions(owner, repo, proposals);

  const openIssues = calculateOpenIssues(repoMetadata, prResult.pullRequests);

  const repoInfo: RepositoryInfo = {
    owner,
    name: repo,
    url: `https://github.com/${owner}/${repo}`,
    stars: repoMetadata.stargazers_count,
    forks: repoMetadata.forks_count,
    openIssues,
    watchers: repoMetadata.subscribers_count,
    description: repoMetadata.description ?? null,
    homepage: repoMetadata.homepage ?? null,
    topics: repoMetadata.topics ?? [],
  };

  const agents = [
    ...commitResult.agents,
    ...prResult.agents,
    ...eventResult.agents,
  ];

  console.log(
    `  ${owner}/${repo}: ${commitResult.commits.length} commits, ${issueResult.issues.length} issues, ${prResult.pullRequests.length} PRs, ${proposals.length} proposals, ${eventResult.comments.length} comments`
  );

  return {
    repoInfo,
    commits: commitResult.commits,
    issues: issueResult.issues,
    pullRequests: prResult.pullRequests,
    proposals,
    comments: eventResult.comments,
    agents,
  };
}

async function generateActivityData(): Promise<ActivityData> {
  const repos = resolveRepositories();
  const isMultiRepo = repos.length > 1;

  console.log(
    `Fetching activity for ${repos.map((r) => `${r.owner}/${r.repo}`).join(', ')}...`
  );

  // Fetch all repos in parallel with graceful degradation
  const settled = await Promise.allSettled(
    repos.map((r) =>
      fetchRepoActivity(
        r.owner,
        r.repo,
        isMultiRepo ? `${r.owner}/${r.repo}` : undefined
      )
    )
  );

  const repoResults = settled
    .map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      console.warn(
        `Failed to fetch ${repos[i].owner}/${repos[i].repo}: ${result.reason}`
      );
      return null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (repoResults.length === 0) {
    throw new Error('All repository fetches failed');
  }

  // Merge results across all repos
  const allCommits = repoResults.flatMap((r) => r.commits);
  const allIssues = repoResults.flatMap((r) => r.issues);
  const allPullRequests = repoResults.flatMap((r) => r.pullRequests);
  const allProposals = repoResults.flatMap((r) => r.proposals);
  const allComments = repoResults.flatMap((r) => r.comments);
  const allRawAgents = repoResults.flatMap((r) => r.agents);
  const allRepoInfos = repoResults.map((r) => r.repoInfo);
  const governanceIncidents = extractGovernanceIncidents(allComments);

  const agents = deduplicateAgents(allRawAgents);

  const agentMap = new Map<string, Agent>();
  agents.forEach((a) => agentMap.set(a.login, a));

  const agentStats = aggregateAgentStats(
    allCommits,
    allIssues,
    allPullRequests,
    allComments,
    agentMap
  );

  const totalCommits = allCommits.length;
  const totalIssues = allIssues.length;
  const totalPRs = allPullRequests.length;
  const totalProposals = allProposals.length;
  const totalComments = allComments.length;
  const totalIncidents = governanceIncidents.length;

  let roadmap: RoadmapData | undefined;
  if (existsSync(ROADMAP_PATH)) {
    try {
      const content = readFileSync(ROADMAP_PATH, 'utf-8');
      roadmap = parseRoadmap(content);
    } catch (e) {
      console.warn(`Failed to parse ROADMAP.md: ${e}`);
    }
  }

  console.log(
    `Total: ${totalCommits} commits, ${totalIssues} issues, ${totalPRs} PRs, ${totalProposals} proposals, ${totalComments} comments, ${totalIncidents} incidents, ${agents.length} agents across ${repos.length} repo(s)`
  );

  const externalVisibility = await buildExternalVisibility(allRepoInfos);

  return {
    generatedAt: new Date().toISOString(),
    // Primary repo for backward compatibility
    repository: allRepoInfos[0],
    // All repos for multi-repo aware consumers
    repositories: allRepoInfos,
    agents,
    agentStats,
    commits: allCommits,
    issues: allIssues,
    pullRequests: allPullRequests,
    comments: allComments,
    proposals: allProposals,
    roadmap,
    externalVisibility,
    governanceIncidents,
  };
}

/**
 * Build an empty governance history artifact.
 */
function emptyHistoryArtifact(generatedAt: string): GovernanceHistoryArtifact {
  const artifactWithoutIntegrity = buildGovernanceHistoryArtifact({
    generatedAt,
    snapshots: [],
    repositories: [],
    generatedBy: HISTORY_GENERATOR_ID,
    generatorVersion: HISTORY_GENERATOR_VERSION,
  });

  return {
    ...artifactWithoutIntegrity,
    integrity: computeGovernanceHistoryIntegrity(artifactWithoutIntegrity),
  };
}

/**
 * Load existing governance history from disk, normalizing legacy array format.
 */
function loadHistory(): GovernanceHistoryArtifact {
  if (!existsSync(HISTORY_FILE)) {
    return emptyHistoryArtifact(new Date(0).toISOString());
  }

  try {
    const raw = readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = parseGovernanceHistoryArtifact(JSON.parse(raw));
    if (parsed) {
      return parsed;
    }
  } catch {
    // Handled by fallback below.
  }

  console.warn('Could not parse governance history, starting fresh');
  return emptyHistoryArtifact(new Date(0).toISOString());
}

/**
 * Update the sitemap lastmod date to match the data generation timestamp.
 * Keeps the sitemap file accurate for search engine crawl priority.
 */
export function updateSitemapLastmod(
  generatedAt: string,
  sitemapPath: string = SITEMAP_PATH
): void {
  if (!existsSync(sitemapPath)) {
    return;
  }
  const content = readFileSync(sitemapPath, 'utf-8');
  const dateOnly = generatedAt.slice(0, 10);
  const updated = content.replace(
    /<lastmod>[^<]+<\/lastmod>/gi,
    `<lastmod>${dateOnly}</lastmod>`
  );
  if (updated !== content) {
    writeFileSync(sitemapPath, updated);
    console.log(`Sitemap lastmod updated to ${dateOnly}`);
  }
}

function toRepoTag(repo: { owner: string; name: string }): string {
  return `${repo.owner}/${repo.name}`;
}

async function main(): Promise<void> {
  try {
    const data = await generateActivityData();

    // Ensure output directory exists
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Write activity data
    writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`Activity data written to ${OUTPUT_FILE}`);

    // Keep sitemap lastmod in sync with the generation timestamp
    updateSitemapLastmod(data.generatedAt);

    // Compute and append governance snapshot for historical tracking
    const requestedRepos = resolveRepositories().map(
      (repo) => `${repo.owner}/${repo.repo}`
    );
    const fetchedRepos = (data.repositories ?? [data.repository]).map(
      toRepoTag
    );
    const fetchedRepoSet = new Set(fetchedRepos);
    const missingRepositories = requestedRepos.filter(
      (repo) => !fetchedRepoSet.has(repo)
    );
    const permissionGaps: string[] = [];

    if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
      permissionGaps.push(
        'Generated without GITHUB_TOKEN/GH_TOKEN; API responses may be rate-limited.'
      );
    }

    const apiPartials =
      missingRepositories.length > 0
        ? [
            `Missing repositories in this run: ${missingRepositories.join(', ')}`,
          ]
        : [];

    const snapshot = computeGovernanceSnapshot(data, data.generatedAt);
    const history = loadHistory();
    const updatedSnapshots = appendSnapshot(history.snapshots, snapshot);
    const artifactWithoutIntegrity = buildGovernanceHistoryArtifact({
      generatedAt: data.generatedAt,
      snapshots: updatedSnapshots,
      repositories: fetchedRepos,
      generatedBy: HISTORY_GENERATOR_ID,
      generatorVersion: HISTORY_GENERATOR_VERSION,
      sourceCommitSha: process.env.GITHUB_SHA ?? null,
      missingRepositories,
      permissionGaps,
      apiPartials,
    });
    const updatedHistory: GovernanceHistoryArtifact = {
      ...artifactWithoutIntegrity,
      integrity: computeGovernanceHistoryIntegrity(artifactWithoutIntegrity),
    };

    writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2));
    console.log(
      `Governance snapshot appended (${updatedSnapshots.length} entries, score: ${snapshot.healthScore}, schema: v${updatedHistory.schemaVersion}, completeness: ${updatedHistory.completeness.status})`
    );
  } catch (error) {
    console.error('Failed to generate activity data:', error);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
