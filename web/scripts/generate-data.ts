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

const { owner: OWNER, repo: REPO } = resolveRepository();

// Data types matching the schema from Issue #3 discussion
interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
}

interface Comment {
  id: number;
  issueOrPrNumber: number;
  type: 'issue' | 'pr' | 'review';
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

interface Agent {
  login: string;
  avatarUrl?: string;
}

interface ActivityData {
  generatedAt: string;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  agents: Agent[];
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
  comments: Comment[];
}

async function fetchJson<T>(endpoint: string): Promise<T> {
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

function resolveRepository(): { owner: string; repo: string } {
  const repository =
    process.env.COLONY_REPOSITORY ?? process.env.GITHUB_REPOSITORY;

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

async function fetchCommits(): Promise<{ commits: Commit[]; agents: Agent[] }> {
  interface GitHubCommit {
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

  const ghCommits = await fetchJson<GitHubCommit[]>(
    `/repos/${OWNER}/${REPO}/commits?per_page=20`
  );

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

async function fetchIssues(): Promise<Issue[]> {
  interface GitHubIssue {
    number: number;
    title: string;
    state: string;
    labels: Array<{ name: string }>;
    created_at: string;
    pull_request?: unknown;
  }

  // Fetch both open and closed issues
  const [openIssues, closedIssues] = await Promise.all([
    fetchJson<GitHubIssue[]>(
      `/repos/${OWNER}/${REPO}/issues?state=open&per_page=15`
    ),
    fetchJson<GitHubIssue[]>(
      `/repos/${OWNER}/${REPO}/issues?state=closed&per_page=15`
    ),
  ]);

  const allIssues = [...openIssues, ...closedIssues]
    // Filter out PRs (GitHub includes them in issues endpoint)
    .filter((i) => !i.pull_request)
    // Sort by creation date descending
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 20);

  return allIssues.map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state as 'open' | 'closed',
    labels: i.labels.map((l) => l.name),
    createdAt: i.created_at,
  }));
}

async function fetchPullRequests(): Promise<{
  pullRequests: PullRequest[];
  agents: Agent[];
}> {
  interface GitHubPR {
    number: number;
    title: string;
    state: string;
    merged_at: string | null;
    user: {
      login: string;
      avatar_url: string;
    };
    created_at: string;
  }

  // Fetch both open and closed PRs
  const [openPRs, closedPRs] = await Promise.all([
    fetchJson<GitHubPR[]>(
      `/repos/${OWNER}/${REPO}/pulls?state=open&per_page=10`
    ),
    fetchJson<GitHubPR[]>(
      `/repos/${OWNER}/${REPO}/pulls?state=closed&per_page=10`
    ),
  ]);

  const allPRs = [...openPRs, ...closedPRs]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 15);

  const pullRequests: PullRequest[] = allPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
    author: pr.user.login,
    createdAt: pr.created_at,
  }));

  const agents: Agent[] = allPRs.map((pr) => ({
    login: pr.user.login,
    avatarUrl: pr.user.avatar_url,
  }));

  return { pullRequests, agents };
}

async function fetchEvents(): Promise<{
  comments: Comment[];
  agents: Agent[];
}> {
  interface GitHubEvent {
    id: string;
    type: string;
    actor: {
      login: string;
      avatar_url: string;
    };
    payload: {
      action?: string;
      comment?: {
        id: number;
        body: string;
        html_url: string;
      };
      issue?: {
        number: number;
        pull_request?: unknown;
      };
      pull_request?: {
        number: number;
      };
      review?: {
        id: number;
        body: string | null;
        html_url: string;
      };
    };
    created_at: string;
  }

  const ghEvents = await fetchJson<GitHubEvent[]>(
    `/repos/${OWNER}/${REPO}/events?per_page=50`
  );

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
      if (!review?.body || !pull_request) continue;
      comments.push({
        id: review.id,
        issueOrPrNumber: pull_request.number,
        type: 'review',
        author: event.actor.login,
        body: review.body.slice(0, 200),
        createdAt: event.created_at,
        url: review.html_url,
      });
      agents.push({
        login: event.actor.login,
        avatarUrl: event.actor.avatar_url,
      });
    }
  }

  return { comments, agents };
}

async function generateActivityData(): Promise<ActivityData> {
  console.log('Fetching GitHub activity data...');

  const [commitResult, issues, prResult, eventResult] = await Promise.all([
    fetchCommits(),
    fetchIssues(),
    fetchPullRequests(),
    fetchEvents(),
  ]);

  const commits = commitResult.commits;
  const pullRequests = prResult.pullRequests;
  const comments = eventResult.comments;

  // Aggregate and deduplicate agents
  const agentMap = new Map<string, Agent>();
  [...commitResult.agents, ...prResult.agents, ...eventResult.agents].forEach(
    (agent) => {
      agentMap.set(agent.login, agent);
    }
  );
  const agents = Array.from(agentMap.values());

  console.log(
    `Fetched: ${commits.length} commits, ${issues.length} issues, ${pullRequests.length} PRs, ${comments.length} comments, ${agents.length} agents`
  );

  return {
    generatedAt: new Date().toISOString(),
    repository: {
      owner: OWNER,
      name: REPO,
      url: `https://github.com/${OWNER}/${REPO}`,
    },
    agents,
    commits,
    issues,
    pullRequests,
    comments,
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

main();
