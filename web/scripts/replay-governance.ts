import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseGovernanceHistoryArtifact,
  type GovernanceHistoryArtifact,
  type GovernanceSnapshot,
} from '../shared/governance-snapshot.ts';
import { isGovernanceHistoryIntegrityValid } from './governance-history-integrity';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HISTORY_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'governance-history.json'
);

export interface ReplayOptions {
  file: string;
  from: string | null;
  to: string | null;
  json: boolean;
}

export interface GovernanceReplaySummary {
  points: number;
  from: string | null;
  to: string | null;
  firstHealth: number | null;
  lastHealth: number | null;
  deltaHealth: number | null;
  minHealth: number | null;
  maxHealth: number | null;
  averageHealth: number | null;
}

export function parseReplayArgs(args: string[]): ReplayOptions {
  let file = DEFAULT_HISTORY_FILE;
  let from: string | null = null;
  let to: string | null = null;
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--file=')) {
      file = arg.slice('--file='.length);
      continue;
    }

    if (arg.startsWith('--from=')) {
      const value = arg.slice('--from='.length);
      assertDateArg(value, '--from');
      from = value;
      continue;
    }

    if (arg.startsWith('--to=')) {
      const value = arg.slice('--to='.length);
      assertDateArg(value, '--to');
      to = value;
      continue;
    }

    throw new Error(
      `Unknown argument "${arg}". Expected --file=, --from=, --to=, or --json.`
    );
  }

  if (from && to && Date.parse(from) > Date.parse(to)) {
    throw new Error('--from cannot be later than --to');
  }

  return { file, from, to, json };
}

export function summarizeGovernanceReplay(
  snapshots: GovernanceSnapshot[],
  from: string | null,
  to: string | null
): GovernanceReplaySummary {
  const fromTs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toTs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;

  const windowed = [...snapshots]
    .sort(
      (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)
    )
    .filter((snapshot) => {
      const ts = Date.parse(snapshot.timestamp);
      return Number.isFinite(ts) && ts >= fromTs && ts <= toTs;
    });

  if (windowed.length === 0) {
    return {
      points: 0,
      from: null,
      to: null,
      firstHealth: null,
      lastHealth: null,
      deltaHealth: null,
      minHealth: null,
      maxHealth: null,
      averageHealth: null,
    };
  }

  const scores = windowed.map((snapshot) => snapshot.healthScore);
  const first = scores[0];
  const last = scores[scores.length - 1];

  return {
    points: windowed.length,
    from: windowed[0].timestamp,
    to: windowed[windowed.length - 1].timestamp,
    firstHealth: first,
    lastHealth: last,
    deltaHealth: last - first,
    minHealth: Math.min(...scores),
    maxHealth: Math.max(...scores),
    averageHealth:
      Math.round(
        (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100
      ) / 100,
  };
}

export function replayFromArtifact(
  artifact: GovernanceHistoryArtifact,
  options: ReplayOptions
): {
  integrity: 'verified' | 'partial' | 'unverified';
  summary: GovernanceReplaySummary;
} {
  const integrity = !artifact.integrity
    ? 'unverified'
    : isGovernanceHistoryIntegrityValid(artifact)
      ? 'verified'
      : 'unverified';

  const summary = summarizeGovernanceReplay(
    artifact.snapshots,
    options.from,
    options.to
  );

  return {
    integrity:
      artifact.completeness.status === 'partial' && integrity === 'verified'
        ? 'partial'
        : integrity,
    summary,
  };
}

function assertDateArg(value: string, flag: string): void {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) {
    throw new Error(`${flag} must be an ISO-8601 date/time`);
  }
}

function formatTextOutput(params: {
  artifact: GovernanceHistoryArtifact;
  integrity: 'verified' | 'partial' | 'unverified';
  summary: GovernanceReplaySummary;
}): string {
  const { artifact, integrity, summary } = params;
  const repos =
    artifact.provenance.repositories.length > 0
      ? artifact.provenance.repositories.join(', ')
      : 'unknown';

  return [
    `Schema: v${artifact.schemaVersion}`,
    `Generated: ${artifact.generatedAt}`,
    `Repositories: ${repos}`,
    `Completeness: ${artifact.completeness.status}`,
    `Integrity: ${integrity}`,
    `Replay points: ${summary.points}`,
    `Window: ${summary.from ?? 'n/a'} -> ${summary.to ?? 'n/a'}`,
    `Health: first=${summary.firstHealth ?? 'n/a'} last=${summary.lastHealth ?? 'n/a'} delta=${summary.deltaHealth ?? 'n/a'} avg=${summary.averageHealth ?? 'n/a'}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseReplayArgs(process.argv.slice(2));
  if (!existsSync(options.file)) {
    throw new Error(`History file not found: ${options.file}`);
  }

  const parsed = parseGovernanceHistoryArtifact(
    JSON.parse(readFileSync(options.file, 'utf-8'))
  );
  if (!parsed) {
    throw new Error(`Invalid governance history file: ${options.file}`);
  }

  const replay = replayFromArtifact(parsed, options);
  const payload = {
    schemaVersion: parsed.schemaVersion,
    generatedAt: parsed.generatedAt,
    provenance: parsed.provenance,
    completeness: parsed.completeness,
    integrity: replay.integrity,
    summary: replay.summary,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(
      formatTextOutput({
        artifact: parsed,
        integrity: replay.integrity,
        summary: replay.summary,
      })
    );
  }

  if (parsed.integrity && replay.integrity === 'unverified') {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Replay failed:', error);
    process.exit(1);
  });
}
