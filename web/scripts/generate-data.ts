/**
 * Static Activity Data Generator
 *
 * Fetches GitHub activity data (commits, issues, PRs) and writes it to
 * public/data/activity.json for the frontend to consume at runtime.
 *
 * Uses the GitHub REST API. When running in CI, uses GITHUB_TOKEN for
 * authentication; locally falls back to unauthenticated requests.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'activity.json');

const GITHUB_API = 'https://api.github.com';
const OWNER = 'hivemoot';
const REPO = 'colony';

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

interface ActivityData {
  generatedAt: string;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
}

async function fetchJson<T>(endpoint: string): Promise<T> {
  const url = `${GITHUB_API}${endpoint}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'colony-data-generator',
  };

  // Use GITHUB_TOKEN if available (CI environment)
  const token = process.env.GITHUB_TOKEN;
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

async function fetchCommits(): Promise<Commit[]> {
  interface GitHubCommit {
    sha: string;
    commit: {
      message: string;
      author: {
        name: string;
        date: string;
      };
    };
  }

  const commits = await fetchJson<GitHubCommit[]>(
    `/repos/${OWNER}/${REPO}/commits?per_page=20`
  );

  return commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split('\n')[0], // First line only
    author: c.commit.author.name,
    date: c.commit.author.date,
  }));
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

async function fetchPullRequests(): Promise<PullRequest[]> {
  interface GitHubPR {
    number: number;
    title: string;
    state: string;
    merged_at: string | null;
    user: { login: string };
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

  return allPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
    author: pr.user.login,
    createdAt: pr.created_at,
  }));
}

async function generateActivityData(): Promise<ActivityData> {
  console.log('Fetching GitHub activity data...');

  const [commits, issues, pullRequests] = await Promise.all([
    fetchCommits(),
    fetchIssues(),
    fetchPullRequests(),
  ]);

  console.log(
    `Fetched: ${commits.length} commits, ${issues.length} issues, ${pullRequests.length} PRs`
  );

  return {
    generatedAt: new Date().toISOString(),
    repository: {
      owner: OWNER,
      name: REPO,
      url: `https://github.com/${OWNER}/${REPO}`,
    },
    commits,
    issues,
    pullRequests,
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
