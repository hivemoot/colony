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
} from '../shared/types';

import {
  computeGovernanceSnapshot,
  appendSnapshot,
  type GovernanceSnapshot,
} from '../shared/governance-snapshot.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'activity.json');
const HISTORY_FILE = join(OUTPUT_DIR, 'governance-history.json');

const GITHUB_API = 'https://api.github.com';
const DEFAULT_OWNER = 'hivemoot';
const DEFAULT_REPO = 'colony';

export interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
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
  const allPRs = ghPRs
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 15);

  const pullRequests: PullRequest[] = allPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
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

    const phase = phaseName as Proposal['phase'];

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

  console.log(
    `Total: ${totalCommits} commits, ${totalIssues} issues, ${totalPRs} PRs, ${totalProposals} proposals, ${totalComments} comments, ${agents.length} agents across ${repos.length} repo(s)`
  );

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
  };
}

/**
 * Load existing governance history from disk, or return empty array
 * if the file doesn't exist yet.
 */
function loadHistory(): GovernanceSnapshot[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    const raw = readFileSync(HISTORY_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as GovernanceSnapshot[];
  } catch {
    console.warn('Could not parse governance history, starting fresh');
    return [];
  }
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
    const snapshot = computeGovernanceSnapshot(data, data.generatedAt);
    const history = loadHistory();
    const updated = appendSnapshot(history, snapshot);
    writeFileSync(HISTORY_FILE, JSON.stringify(updated, null, 2));
    console.log(
      `Governance snapshot appended (${updated.length} entries, score: ${snapshot.healthScore})`
    );
  } catch (error) {
    console.error('Failed to generate activity data:', error);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
