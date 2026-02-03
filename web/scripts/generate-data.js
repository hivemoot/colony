import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO_OWNER = 'hivemoot';
const REPO_NAME = 'colony';
const API_BASE = 'https://api.github.com';

async function fetchGitHub(endpoint) {
  if (!GITHUB_TOKEN) {
    console.warn('No GITHUB_TOKEN found. Using mock data.');
    return null;
  }

  const response = await fetch(
    `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        Accept: 'application/vnd.github+json',
      },
    }
  );

  if (!response.ok) {
    console.error(
      `Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`
    );
    return null;
  }

  return response.json();
}

async function main() {
  console.log('Generating activity data...');

  // Fetch commits, issues, and pulls
  const [commits, issuesraw, pulls] = await Promise.all([
    fetchGitHub('/commits?per_page=10'),
    fetchGitHub('/issues?state=all&per_page=20&sort=updated'),
    fetchGitHub('/pulls?state=all&per_page=10&sort=updated'),
  ]);

  let data;
  if (!commits || !issuesraw || !pulls) {
    data = {
      generatedAt: new Date().toISOString(),
      isMock: true,
      commits: [],
      issues: [],
      pulls: [],
    };
  } else {
    // Filter issues that are actually PRs, just in case
    const issues = issuesraw.filter((i) => !i.pull_request).slice(0, 10);

    data = {
      generatedAt: new Date().toISOString(),
      isMock: false,
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
        avatar: c.author?.avatar_url,
      })),
      issues: issues.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        url: i.html_url,
        author: i.user.login,
        updatedAt: i.updated_at,
        labels: i.labels.map((l) => ({ name: l.name, color: l.color })),
      })),
      pulls: pulls.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        url: p.html_url,
        author: p.user.login,
        updatedAt: p.updated_at,
        mergedAt: p.merged_at,
        labels: p.labels.map((l) => ({ name: l.name, color: l.color })),
      })),
    };
  }

  const outputDir = path.join(__dirname, '../public/data');
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'activity.json');
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  console.log(`Activity data written to ${outputPath}`);
}

main().catch(console.error);
