import { execFileSync } from 'node:child_process';

const DEFAULT_REPO = 'hivemoot/colony';
const DEFAULT_BASELINE_STARS = 2;

export const DEFAULT_AWESOME_LIST_PR_URLS = [
  'https://github.com/e2b-dev/awesome-ai-agents/pull/274',
  'https://github.com/Jenqyang/Awesome-AI-Agents/pull/52',
  'https://github.com/slavakurilyak/awesome-ai-agents/pull/56',
  'https://github.com/jim-schwoebel/awesome_ai_agents/pull/42',
] as const;

export interface PullRequestRef {
  repo: string;
  number: number;
  url: string;
}

interface CliOptions {
  repo: string;
  baselineStars: number;
  prUrls: string[];
  json: boolean;
}

interface PullRequestView {
  state?: string;
  mergedAt?: string | null;
}

export interface PullRequestStatus {
  url: string;
  repo: string;
  number: number;
  status: 'merged' | 'open' | 'closed' | 'unknown';
  error?: string;
}

export interface DiscoverabilityReport {
  generatedAt: string;
  repository: string;
  stars: {
    baseline: number;
    current: number;
    delta: number;
  };
  awesomeListPRs: {
    merged: number;
    open: number;
    closed: number;
    unknown: number;
    total: number;
  };
  pullRequests: PullRequestStatus[];
}

function printHelp(): void {
  console.log(
    'Usage: npm run discoverability-report -- [--repo=owner/name] [--baseline-stars=2] [--pr-url=https://github.com/org/repo/pull/1] [--json]'
  );
}

export function parsePullRequestUrl(rawUrl: string): PullRequestRef {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error(
      `Only github.com pull request URLs are supported: ${rawUrl}`
    );
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 4 || segments[2] !== 'pull') {
    throw new Error(`Expected pull request URL format: ${rawUrl}`);
  }

  const number = Number.parseInt(segments[3] ?? '', 10);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Invalid pull request number in URL: ${rawUrl}`);
  }

  const owner = segments[0] ?? '';
  const repo = segments[1] ?? '';
  if (!owner || !repo) {
    throw new Error(`Invalid pull request repository in URL: ${rawUrl}`);
  }

  return {
    repo: `${owner}/${repo}`,
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    repo: DEFAULT_REPO,
    baselineStars: DEFAULT_BASELINE_STARS,
    prUrls: [],
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

    if (arg.startsWith('--pr-url=')) {
      const value = arg.slice('--pr-url='.length).trim();
      if (value) {
        options.prUrls.push(value);
      }
      continue;
    }
  }

  return options;
}

function parseConfiguredPrUrls(
  cliValues: string[],
  env: NodeJS.ProcessEnv = process.env
): PullRequestRef[] {
  const configured =
    cliValues.length > 0
      ? cliValues
      : (env.DISCOVERABILITY_PR_URLS?.split(',').map((value) => value.trim()) ??
        []);

  const sourceUrls =
    configured.length > 0 ? configured : [...DEFAULT_AWESOME_LIST_PR_URLS];

  const deduped = new Map<string, PullRequestRef>();
  for (const url of sourceUrls) {
    if (!url) {
      continue;
    }
    const parsed = parsePullRequestUrl(url);
    deduped.set(parsed.url.toLowerCase(), parsed);
  }

  return [...deduped.values()];
}

function fetchRepositoryStars(repo: string): number {
  const output = execFileSync(
    'gh',
    ['api', `repos/${repo}`, '--jq', '.stargazers_count'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const stars = Number.parseInt(output.trim(), 10);
  if (!Number.isFinite(stars) || stars < 0) {
    throw new Error(`Could not parse stargazers_count for ${repo}`);
  }

  return stars;
}

export function classifyPullRequestStatus(
  view: PullRequestView
): PullRequestStatus['status'] {
  if (view.mergedAt) {
    return 'merged';
  }

  const state = view.state?.trim().toUpperCase();
  if (state === 'OPEN') {
    return 'open';
  }
  if (state === 'CLOSED') {
    return 'closed';
  }

  return 'unknown';
}

function fetchPullRequestStatus(ref: PullRequestRef): PullRequestStatus {
  try {
    const output = execFileSync(
      'gh',
      [
        'pr',
        'view',
        String(ref.number),
        '--repo',
        ref.repo,
        '--json',
        'state,mergedAt',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const parsed = JSON.parse(output) as PullRequestView;
    return {
      ...ref,
      status: classifyPullRequestStatus(parsed),
    };
  } catch (error) {
    return {
      ...ref,
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown gh error',
    };
  }
}

export function summarizePullRequestStatuses(statuses: PullRequestStatus[]): {
  merged: number;
  open: number;
  closed: number;
  unknown: number;
  total: number;
} {
  const summary = {
    merged: 0,
    open: 0,
    closed: 0,
    unknown: 0,
    total: statuses.length,
  };

  for (const status of statuses) {
    summary[status.status] += 1;
  }

  return summary;
}

export function buildDiscoverabilityReport(input: {
  repository: string;
  baselineStars: number;
  currentStars: number;
  pullRequests: PullRequestStatus[];
  generatedAt?: string;
}): DiscoverabilityReport {
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    repository: input.repository,
    stars: {
      baseline: input.baselineStars,
      current: input.currentStars,
      delta: input.currentStars - input.baselineStars,
    },
    awesomeListPRs: summarizePullRequestStatuses(input.pullRequests),
    pullRequests: input.pullRequests,
  };
}

function renderText(report: DiscoverabilityReport): string {
  const lines = [
    'Discoverability Report',
    `Generated: ${report.generatedAt}`,
    `Repository: ${report.repository}`,
    `Stars: ${report.stars.current} (baseline ${report.stars.baseline}, delta ${report.stars.delta >= 0 ? '+' : ''}${report.stars.delta})`,
    `Awesome-list PRs: ${report.awesomeListPRs.merged} merged, ${report.awesomeListPRs.open} open, ${report.awesomeListPRs.closed} closed, ${report.awesomeListPRs.unknown} unknown`,
  ];

  for (const pr of report.pullRequests) {
    const suffix = pr.error ? ` (${pr.error})` : '';
    lines.push(`- [${pr.status}] ${pr.url}${suffix}`);
  }

  return lines.join('\n');
}

function run(argv: string[]): number {
  const options = parseArgs(argv);
  const prRefs = parseConfiguredPrUrls(options.prUrls);

  const stars = fetchRepositoryStars(options.repo);
  const pullRequests = prRefs.map((ref) => fetchPullRequestStatus(ref));
  const report = buildDiscoverabilityReport({
    repository: options.repo,
    baselineStars: options.baselineStars,
    currentStars: stars,
    pullRequests,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(renderText(report));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`discoverability-report failed: ${message}`);
    process.exitCode = 1;
  }
}
