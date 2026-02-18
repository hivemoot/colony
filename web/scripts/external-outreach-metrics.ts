import { execFileSync } from 'node:child_process';

const DEFAULT_REPO = 'hivemoot/colony';
const DEFAULT_TRACKED_PRS = [
  'e2b-dev/awesome-ai-agents#274',
  'slavakurilyak/awesome-ai-agents#56',
  'Jenqyang/Awesome-AI-Agents#52',
  'jim-schwoebel/awesome_ai_agents#42',
] as const;

interface CliOptions {
  repo: string;
  baselineStars: number | null;
  prs: string[];
  json: boolean;
}

interface PullRequestRef {
  repo: string;
  number: number;
}

interface PullRequestSnapshot {
  ref: string;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged' | 'unknown';
}

interface OutreachReport {
  generatedAt: string;
  repository: string;
  stars: {
    current: number;
    baseline: number | null;
    deltaSinceBaseline: number | null;
  };
  outreach: {
    trackedPullRequests: PullRequestSnapshot[];
    acceptedLinks: number;
    openSubmissions: number;
    rejectedOrClosed: number;
  };
}

interface PullApiResponse {
  title?: string;
  html_url?: string;
  state?: string;
  merged_at?: string | null;
}

interface RepoApiResponse {
  stargazers_count?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: DEFAULT_REPO,
    baselineStars: null,
    prs: [],
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith('--repo=')) {
      const value = arg.slice('--repo='.length).trim();
      if (value) {
        options.repo = value;
      }
      continue;
    }

    if (arg.startsWith('--baseline-stars=')) {
      const value = Number.parseInt(
        arg.slice('--baseline-stars='.length).trim(),
        10
      );
      if (Number.isFinite(value) && value >= 0) {
        options.baselineStars = value;
      }
      continue;
    }

    if (arg.startsWith('--pr=')) {
      const value = arg.slice('--pr='.length).trim();
      if (value) {
        options.prs.push(value);
      }
      continue;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(
    'Usage: npm run external-outreach-metrics -- [--repo=owner/name] [--baseline-stars=2] [--pr=owner/repo#123] [--json]'
  );
}

export function parsePullRequestRef(input: string): PullRequestRef | null {
  const trimmed = input.trim();
  const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#([1-9][0-9]*)$/.exec(
    trimmed
  );
  if (!match) {
    return null;
  }

  return {
    repo: match[1],
    number: Number.parseInt(match[2], 10),
  };
}

function runGhJson<T>(args: string[]): T {
  const output = execFileSync('gh', args, {
    encoding: 'utf8',
  });
  return JSON.parse(output) as T;
}

function loadCurrentStars(repo: string): number {
  const payload = runGhJson<RepoApiResponse>(['api', `repos/${repo}`]);
  return payload.stargazers_count ?? 0;
}

function loadTrackedPullRequest(ref: PullRequestRef): PullRequestSnapshot {
  const payload = runGhJson<PullApiResponse>([
    'api',
    `repos/${ref.repo}/pulls/${ref.number}`,
  ]);

  const state = normalizePullState(payload.state, payload.merged_at);
  return {
    ref: `${ref.repo}#${ref.number}`,
    title: payload.title ?? '(missing title)',
    url:
      payload.html_url ?? `https://github.com/${ref.repo}/pull/${ref.number}`,
    state,
  };
}

export function normalizePullState(
  state: string | undefined,
  mergedAt: string | null | undefined
): PullRequestSnapshot['state'] {
  if (mergedAt) {
    return 'merged';
  }

  const normalized = state?.trim().toLowerCase();
  if (normalized === 'open') {
    return 'open';
  }
  if (normalized === 'closed') {
    return 'closed';
  }
  return 'unknown';
}

export function buildOutreachReport(
  repository: string,
  currentStars: number,
  baselineStars: number | null,
  trackedPullRequests: PullRequestSnapshot[]
): OutreachReport {
  return {
    generatedAt: new Date().toISOString(),
    repository,
    stars: {
      current: currentStars,
      baseline: baselineStars,
      deltaSinceBaseline:
        baselineStars === null ? null : currentStars - baselineStars,
    },
    outreach: {
      trackedPullRequests,
      acceptedLinks: trackedPullRequests.filter((pr) => pr.state === 'merged')
        .length,
      openSubmissions: trackedPullRequests.filter((pr) => pr.state === 'open')
        .length,
      rejectedOrClosed: trackedPullRequests.filter(
        (pr) => pr.state === 'closed'
      ).length,
    },
  };
}

function printHumanReport(report: OutreachReport): void {
  const starsLine =
    report.stars.baseline === null
      ? `${report.stars.current} current stars`
      : `${report.stars.current} current stars (baseline ${report.stars.baseline}, delta ${report.stars.deltaSinceBaseline})`;

  console.log(`Repo: ${report.repository}`);
  console.log(`Stars: ${starsLine}`);
  console.log(
    `External backlinks: accepted ${report.outreach.acceptedLinks}, open ${report.outreach.openSubmissions}, closed ${report.outreach.rejectedOrClosed}`
  );

  if (report.outreach.trackedPullRequests.length === 0) {
    console.log('No tracked outreach pull requests configured.');
    return;
  }

  console.log('Tracked PRs:');
  for (const pr of report.outreach.trackedPullRequests) {
    console.log(`- [${pr.state}] ${pr.ref} ${pr.url}`);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const rawPrs =
    options.prs.length > 0 ? options.prs : [...DEFAULT_TRACKED_PRS];
  const refs = rawPrs
    .map((pr) => parsePullRequestRef(pr))
    .filter((value): value is PullRequestRef => value !== null);

  const currentStars = loadCurrentStars(options.repo);
  const trackedPullRequests = refs.map((ref) => loadTrackedPullRequest(ref));
  const report = buildOutreachReport(
    options.repo,
    currentStars,
    options.baselineStars,
    trackedPullRequests
  );

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
