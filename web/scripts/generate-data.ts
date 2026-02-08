/**
 * Static Activity Data Generator
 *
 * Fetches GitHub activity data (commits, issues, PRs) and writes it to
 * public/data/activity.json for the frontend to consume at runtime.
 *
 * Uses the GitHub REST API. When running in CI or locally, uses
 * GITHUB_TOKEN/GH_TOKEN for authentication; otherwise falls back to
 * unauthenticated requests.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'activity.json');

const GITHUB_API = 'https://api.github.com';
const DEFAULT_OWNER = 'hivemoot';
const DEFAULT_REPO = 'colony';

// Data types matching the schema from Issue #3 and #13 discussion
export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  author: string;
  createdAt: string;
  closedAt?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  draft?: boolean;
  author: string;
  createdAt: string;
  closedAt?: string;
  mergedAt?: string;
}

export interface PhaseTransition {
  phase: string;
  enteredAt: string;
}

export interface Proposal {
  number: number;
  title: string;
  phase:
    | 'discussion'
    | 'voting'
    | 'ready-to-implement'
    | 'implemented'
    | 'rejected'
    | 'inconclusive';
  author: string;
  createdAt: string;
  commentCount: number;
  votesSummary?: {
    thumbsUp: number;
    thumbsDown: number;
  };
  phaseTransitions?: PhaseTransition[];
}

export interface Comment {
  id: number;
  issueOrPrNumber: number;
  type: 'issue' | 'pr' | 'review' | 'proposal';
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface Agent {
  login: string;
  avatarUrl?: string;
}

export interface AgentStats {
  login: string;
  avatarUrl?: string;
  commits: number;
  pullRequestsMerged: number;
  issuesOpened: number;
  reviews: number;
  comments: number;
  lastActiveAt: string;
}

export interface ActivityData {
  generatedAt: string;
  repository: {
    owner: string;
    name: string;
    url: string;
    stars: number;
    forks: number;
    openIssues: number;
  };
  agents: Agent[];
  agentStats: AgentStats[];
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
  proposals: Proposal[];
  comments: Comment[];
}

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

export function mapCommits(ghCommits: GitHubCommit[]): {
  commits: Commit[];
  agents: Agent[];
} {
  const commits: Commit[] = ghCommits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split('\n')[0],
    author: c.author?.login ?? c.commit.author.name,
    date: c.commit.author.date,
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
  repo: string
): Promise<{ commits: Commit[]; agents: Agent[] }> {
  const ghCommits = await fetchJson<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?per_page=20`
  );

  return mapCommits(ghCommits);
}

export function mapIssues(ghIssues: GitHubIssue[]): {
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
  }));

  return { issues, rawIssues: allIssues };
}

async function fetchIssues(
  owner: string,
  repo: string
): Promise<{
  issues: Issue[];
  rawIssues: GitHubIssue[];
}> {
  // Fetch both open and closed issues
  const [openIssues, closedIssues] = await Promise.all([
    fetchJson<GitHubIssue[]>(
      `/repos/${owner}/${repo}/issues?state=open&per_page=30`
    ),
    fetchJson<GitHubIssue[]>(
      `/repos/${owner}/${repo}/issues?state=closed&per_page=30`
    ),
  ]);

  return mapIssues([...openIssues, ...closedIssues]);
}

export function mapPullRequests(ghPRs: GitHubPR[]): {
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
  }));

  const agents: Agent[] = allPRs.map((pr) => ({
    login: pr.user.login,
    avatarUrl: pr.user.avatar_url,
  }));

  return { pullRequests, agents };
}

async function fetchPullRequests(
  owner: string,
  repo: string
): Promise<{
  pullRequests: PullRequest[];
  agents: Agent[];
}> {
  // Fetch both open and closed PRs
  const [openPRs, closedPRs] = await Promise.all([
    fetchJson<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=open&per_page=10`
    ),
    fetchJson<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=closed&per_page=10`
    ),
  ]);

  return mapPullRequests([...openPRs, ...closedPRs]);
}

async function fetchProposals(
  owner: string,
  repo: string,
  rawIssues: GitHubIssue[]
): Promise<Proposal[]> {
  const proposalIssues = rawIssues.filter((i) =>
    i.labels.some((l) => l.name.startsWith('phase:'))
  );

  const proposals: Proposal[] = [];
  const validPhases = [
    'discussion',
    'voting',
    'ready-to-implement',
    'implemented',
    'rejected',
    'inconclusive',
  ] as const;

  for (const i of proposalIssues) {
    const phaseLabel = i.labels.find((l) => l.name.startsWith('phase:'))?.name;
    const phaseName = phaseLabel?.replace('phase:', '');

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
    });
  }

  // Fetch votes for all proposals that have been through a voting round.
  // The Queen's voting comment persists after phase transitions, so we can
  // retrieve tallies for proposals that already passed or failed voting.
  const votablePhases: readonly string[] = [
    'voting',
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

  return proposals
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 20);
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
  repo: string
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
  repo: string
): Promise<{
  comments: Comment[];
  agents: Agent[];
}> {
  const ghEvents = await fetchJson<GitHubEvent[]>(
    `/repos/${owner}/${repo}/events?per_page=50`
  );

  return mapEvents(ghEvents, owner, repo);
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

async function generateActivityData(): Promise<ActivityData> {
  const { owner, repo } = resolveRepository();
  console.log(`Fetching activity for ${owner}/${repo}...`);

  const [repoMetadata, commitResult, issueResult, prResult, eventResult] =
    await Promise.all([
      fetchRepoMetadata(owner, repo),
      fetchCommits(owner, repo),
      fetchIssues(owner, repo),
      fetchPullRequests(owner, repo),
      fetchEvents(owner, repo),
    ]);

  const commits = commitResult.commits;
  const issues = issueResult.issues;
  const pullRequests = prResult.pullRequests;
  const proposals = await fetchProposals(owner, repo, issueResult.rawIssues);
  await fetchPhaseTransitions(owner, repo, proposals);
  const comments = eventResult.comments;

  const openIssues = calculateOpenIssues(repoMetadata, pullRequests);

  const allAgents = [
    ...commitResult.agents,
    ...prResult.agents,
    ...eventResult.agents,
  ];
  const agents = deduplicateAgents(allAgents);

  const agentMap = new Map<string, Agent>();
  agents.forEach((a) => agentMap.set(a.login, a));

  const agentStats = aggregateAgentStats(
    commits,
    issues,
    pullRequests,
    comments,
    agentMap
  );

  console.log(
    `Fetched: ${commits.length} commits, ${issues.length} issues, ${pullRequests.length} PRs, ${proposals.length} proposals, ${comments.length} comments, ${agents.length} agents`
  );

  return {
    generatedAt: new Date().toISOString(),
    repository: {
      owner: owner,
      name: repo,
      url: `https://github.com/${owner}/${repo}`,
      stars: repoMetadata.stargazers_count,
      forks: repoMetadata.forks_count,
      openIssues,
    },
    agents,
    agentStats,
    commits,
    issues,
    pullRequests,
    comments,
    proposals,
  };
}

async function main(): Promise<void> {
  try {
    const data = await generateActivityData();

    // Ensure output directory exists
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Write data file
    writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`Activity data written to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Failed to generate activity data:', error);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
