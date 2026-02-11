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

export async function buildExternalVisibility(
  repositories: RepositoryInfo[]
): Promise<ExternalVisibility> {
  const primary = repositories[0];

  const hasHomepage = Boolean(primary?.homepage?.trim());
  const hasTopics = (primary?.topics?.length ?? 0) > 0;
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
        ? (primary.homepage ?? undefined)
        : 'Missing homepage repository setting.',
      blockedByAdmin: !hasHomepage,
    },
    {
      id: 'has-topics',
      label: 'Repository topics configured',
      ok: hasTopics,
      details: hasTopics
        ? `${primary.topics?.length ?? 0} topics`
        : 'No repository topics set.',
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
  const homepage = primary?.homepage;
  if (homepage && homepage.startsWith('http')) {
    const baseUrl = homepage.endsWith('/') ? homepage.slice(0, -1) : homepage;

    const fetchWithTimeout = async (url: string) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (e) {
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
        ? `GET / returned ${rootRes.status}`
        : 'Connection failed or timed out',
    });

    // JSON-LD on deployed root
    let deployedJsonLd = false;
    if (rootRes?.status === 200) {
      const html = await rootRes.text();
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

    // Robots check
    const robotsText =
      robotsRes?.status === 200 ? await robotsRes.text() : '';
    const hasDeployedRobotsSitemap =
      /Sitemap:\s*https?:\/\/\S+/i.test(robotsText);
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
    const sitemapText =
      sitemapRes?.status === 200 ? await sitemapRes.text() : '';
    const hasDeployedSitemapLastmod =
      /<lastmod>[^<]+<\/lastmod>/i.test(sitemapText);
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
    let freshnessDetails = 'Could not fetch deployed activity data';
    let freshnessOk = false;
    if (activityRes?.status === 200) {
      try {
        const activity = await activityRes.json();
        if (activity.generatedAt) {
          const ageMs = Date.now() - new Date(activity.generatedAt).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);
          freshnessOk = ageHours <= 18; // Critical threshold from proposal
          freshnessDetails = `Deployed data is ${Math.round(ageHours)}h old`;
        }
      } catch (e) {
        freshnessDetails = 'Invalid activity.json format on deployed site';
      }
    }
    checks.push({
      id: 'deployed-activity-freshness',
      label: 'Deployed data freshness',
      ok: freshnessOk,
      details: freshnessDetails,
    });
  }

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
    `Total: ${totalCommits} commits, ${totalIssues} issues, ${totalPRs} PRs, ${totalProposals} proposals, ${totalComments} comments, ${agents.length} agents across ${repos.length} repo(s)`
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
