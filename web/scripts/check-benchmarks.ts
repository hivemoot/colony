/**
 * Benchmark reporter — CLI script.
 *
 * Reads `public/data/benchmark.json` (produced by `generate-benchmark`) and
 * presents Colony PR metrics alongside the external OSS cohort and an optional
 * LinearB industry comparison.
 *
 * Usage:
 *   npm run check-benchmarks
 *   npm run check-benchmarks -- --compare
 *   npm run check-benchmarks -- --json
 *   npm run check-benchmarks -- --compare --json
 *   BENCHMARK_FILE=/path/to/benchmark.json npm run check-benchmarks
 *
 * Exit codes:
 *   0  — report printed (or JSON written to stdout)
 *   1  — benchmark.json not found or unreadable
 *
 * The --compare flag adds a LinearB 2025 external reference for PR cycle time
 * alongside a comparability caveat (Colony agents operate 24/7 without human
 * timezone gaps — cycle time advantages reflect a different operational model).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BENCHMARK_FILE = join(
  __dirname,
  '..',
  'public',
  'data',
  'benchmark.json'
);

// ──────────────────────────────────────────────
// External reference (LinearB 2025)
// ──────────────────────────────────────────────

/**
 * LinearB 2025 Engineering Benchmarks — PR cycle time baselines.
 *
 * Source: https://linearb.io/blog/2025-engineering-benchmarks-insights
 * Sample: 6.1M+ pull requests from 3,000+ development teams (telemetry, not survey).
 *
 * Metric definition: PR creation-to-merge (not commit-to-deploy).
 * LinearB labels PRs that take under 26 hours as "elite" and the industry
 * median is approximately 7 days (168 hours).
 *
 * Verification note: LinearB's primary metric is "commit-to-deploy" in some
 * report sections; the PR creation-to-merge values cited here are from their
 * PR-specific analysis. Implementers should verify at the source URL that
 * these numbers still refer to the PR creation-to-merge window.
 */
export const LINEAR_B_2025 = {
  eliteThresholdHours: 26,
  medianHours: 168,
  source: 'LinearB 2025 Engineering Benchmarks',
  sourceUrl: 'https://linearb.io/blog/2025-engineering-benchmarks-insights',
  sampleSize: '6.1M+ pull requests',
  year: 2025,
  caveat:
    'Colony agents operate 24/7 without timezone gaps, weekends, or human review-queue ' +
    'latency. Cycle time advantages reflect a different operational model, not a more ' +
    'efficient human engineering process.',
} as const;

// ──────────────────────────────────────────────
// Input types (mirrors generate-benchmark.ts)
// ──────────────────────────────────────────────

export interface BenchmarkMetrics {
  openedPrs: number;
  mergedPrs: number;
  openPrs: number;
  staleOpenPrs: number;
  activeContributors: number;
  prCycleTimeP50Hours: number | null;
  mergeRate: number | null;
  staleOpenPrShare: number | null;
}

export interface RepoBenchmark {
  repository: string;
  source: 'activity-json' | 'github-api';
  window: {
    start: string;
    end: string;
    days: number;
  };
  metrics: BenchmarkMetrics;
}

export interface BenchmarkArtifact {
  generatedAt: string;
  methodologyPath: string;
  staleOpenThresholdDays: number;
  colony: RepoBenchmark;
  selfComparison: {
    baselineLabel: string;
    current: RepoBenchmark;
    baseline: RepoBenchmark;
  };
  cohort: RepoBenchmark[];
  notes: string[];
}

// ──────────────────────────────────────────────
// JSON output types
// ──────────────────────────────────────────────

export interface ExternalReference {
  metric: string;
  eliteThresholdHours: number;
  medianHours: number;
  source: string;
  sourceUrl: string;
  sampleSize: string;
  year: number;
  caveat: string;
}

export interface BenchmarkReport {
  generatedAt: string;
  colony: RepoBenchmark;
  selfComparison: {
    baselineLabel: string;
    current: RepoBenchmark;
    baseline: RepoBenchmark;
  };
  cohort: RepoBenchmark[];
  externalReferences?: ExternalReference[];
  notes: string[];
}

// ──────────────────────────────────────────────
// CLI options
// ──────────────────────────────────────────────

export interface CliOptions {
  json: boolean;
  compare: boolean;
  benchmarkFile: string;
}

export function parseArgs(argv: string[]): CliOptions {
  return {
    json: argv.includes('--json'),
    compare: argv.includes('--compare'),
    benchmarkFile: resolve(
      process.env['BENCHMARK_FILE'] ?? DEFAULT_BENCHMARK_FILE
    ),
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function fmtHours(hours: number | null): string {
  if (hours === null) return 'n/a';
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function fmtPct(ratio: number | null): string {
  if (ratio === null) return 'n/a';
  return `${(ratio * 100).toFixed(1)}%`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

// ──────────────────────────────────────────────
// Report builders
// ──────────────────────────────────────────────

export function buildReport(
  artifact: BenchmarkArtifact,
  options: Pick<CliOptions, 'compare'>
): BenchmarkReport {
  const report: BenchmarkReport = {
    generatedAt: artifact.generatedAt,
    colony: artifact.colony,
    selfComparison: artifact.selfComparison,
    cohort: artifact.cohort,
    notes: artifact.notes,
  };

  if (options.compare) {
    report.externalReferences = [
      {
        metric: 'prCycleTimeP50Hours',
        eliteThresholdHours: LINEAR_B_2025.eliteThresholdHours,
        medianHours: LINEAR_B_2025.medianHours,
        source: LINEAR_B_2025.source,
        sourceUrl: LINEAR_B_2025.sourceUrl,
        sampleSize: LINEAR_B_2025.sampleSize,
        year: LINEAR_B_2025.year,
        caveat: LINEAR_B_2025.caveat,
      },
    ];
  }

  return report;
}

export function formatReport(
  report: BenchmarkReport,
  options: Pick<CliOptions, 'compare'>
): string {
  const lines: string[] = [];
  const { colony, selfComparison, cohort, externalReferences } = report;

  lines.push('');
  lines.push('══ Colony Benchmark Report ══════════════════════════');
  lines.push(
    `Window: ${colony.window.start.slice(0, 10)} → ${colony.window.end.slice(0, 10)} (${colony.window.days}d)`
  );
  lines.push(`Generated: ${new Date(report.generatedAt).toUTCString()}`);
  lines.push('');

  // ── Colony metrics ──
  lines.push('── Colony (current window) ──');
  lines.push(`  PRs opened:   ${colony.metrics.openedPrs}`);
  lines.push(`  PRs merged:   ${colony.metrics.mergedPrs}`);
  lines.push(`  Open PRs:     ${colony.metrics.openPrs}`);
  lines.push(
    `  Stale open:   ${colony.metrics.staleOpenPrs}  (>${report.cohort.length > 0 ? '7' : '7'}d without update)`
  );
  lines.push(`  Contributors: ${colony.metrics.activeContributors}`);
  lines.push(
    `  Cycle time p50: ${fmtHours(colony.metrics.prCycleTimeP50Hours)}`
  );
  lines.push(`  Merge rate:     ${fmtPct(colony.metrics.mergeRate)}`);
  lines.push(`  Stale share:    ${fmtPct(colony.metrics.staleOpenPrShare)}`);

  // ── Self-comparison ──
  lines.push('');
  lines.push(`── Self-comparison (${selfComparison.baselineLabel}) ──`);
  const cur = selfComparison.current;
  const base = selfComparison.baseline;
  const cycleDelta =
    cur.metrics.prCycleTimeP50Hours !== null &&
    base.metrics.prCycleTimeP50Hours !== null
      ? cur.metrics.prCycleTimeP50Hours - base.metrics.prCycleTimeP50Hours
      : null;
  const cycleArrow =
    cycleDelta === null
      ? ''
      : cycleDelta < 0
        ? ' ↓'
        : cycleDelta > 0
          ? ' ↑'
          : ' →';
  lines.push(
    `  Cycle time p50:  current ${fmtHours(cur.metrics.prCycleTimeP50Hours)}  baseline ${fmtHours(base.metrics.prCycleTimeP50Hours)}${cycleArrow}`
  );
  lines.push(
    `  Merge rate:      current ${fmtPct(cur.metrics.mergeRate)}  baseline ${fmtPct(base.metrics.mergeRate)}`
  );

  // ── Cohort comparison ──
  if (cohort.length > 0) {
    lines.push('');
    lines.push('── Cohort comparison ──────────────────────────────────');
    const colW = 36;
    lines.push(
      `  ${pad('Repository', colW)}  ${pad('Cycle p50', 10)}  ${pad('Merge rate', 10)}  Contributors`
    );
    lines.push(
      `  ${'-'.repeat(colW)}  ${'─'.repeat(10)}  ${'─'.repeat(10)}  ${'─'.repeat(12)}`
    );

    // Colony row first
    lines.push(
      `  ${pad(colony.repository + ' (Colony)', colW)}  ${pad(fmtHours(colony.metrics.prCycleTimeP50Hours), 10)}  ${pad(fmtPct(colony.metrics.mergeRate), 10)}  ${colony.metrics.activeContributors}`
    );
    for (const repo of cohort) {
      lines.push(
        `  ${pad(repo.repository, colW)}  ${pad(fmtHours(repo.metrics.prCycleTimeP50Hours), 10)}  ${pad(fmtPct(repo.metrics.mergeRate), 10)}  ${repo.metrics.activeContributors}`
      );
    }
  }

  // ── External reference (--compare) ──
  if (options.compare && externalReferences && externalReferences.length > 0) {
    const ref = externalReferences[0];
    if (!ref) return lines.join('\n');
    lines.push('');
    lines.push('── External reference ─────────────────────────────────');
    lines.push(`  PR Cycle Time (p50)`);
    lines.push(
      `    Colony:       ${fmtHours(colony.metrics.prCycleTimeP50Hours)}`
    );
    lines.push(`    Industry elite: <${fmtHours(ref.eliteThresholdHours)}`);
    lines.push(`    Industry median: ${fmtHours(ref.medianHours)}`);
    lines.push(`    Source: ${ref.source} (${ref.year}, n=${ref.sampleSize})`);
    lines.push('');
    lines.push(`  ⚠  Comparability note:`);
    // Word-wrap at ~70 chars
    const words = ref.caveat.split(' ');
    let line = '     ';
    for (const word of words) {
      if (line.length + word.length + 1 > 72) {
        lines.push(line.trimEnd());
        line = '     ' + word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }

  // ── Notes ──
  if (report.notes.length > 0) {
    lines.push('');
    lines.push('── Notes ──────────────────────────────────────────────');
    for (const note of report.notes) {
      lines.push(`  • ${note}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

export async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run check-benchmarks [-- [--compare] [--json]]\n' +
        '\n' +
        'Options:\n' +
        '  --compare   Add LinearB 2025 industry reference for PR cycle time\n' +
        '  --json      Output machine-readable JSON instead of text\n' +
        '\n' +
        'Environment:\n' +
        '  BENCHMARK_FILE   Path to benchmark.json (default: web/public/data/benchmark.json)\n'
    );
    return;
  }

  if (!existsSync(options.benchmarkFile)) {
    console.error(
      `Error: benchmark.json not found at ${options.benchmarkFile}\n` +
        'Run "npm run generate-benchmark" first to produce the artifact.'
    );
    process.exit(1);
  }

  const raw = readFileSync(options.benchmarkFile, 'utf-8');
  const artifact = JSON.parse(raw) as BenchmarkArtifact;
  const report = buildReport(artifact, options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(formatReport(report, options));
  }
}

function isDirectExecution(): boolean {
  const scriptUrl = import.meta.url;
  const callerUrl = new URL(process.argv[1] ?? '', 'file://').href;
  return scriptUrl === callerUrl || callerUrl.endsWith('check-benchmarks.ts');
}

if (isDirectExecution()) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run check-benchmarks [-- [--compare] [--json]]\n' +
        '\n' +
        'Options:\n' +
        '  --compare   Add LinearB 2025 industry reference for PR cycle time\n' +
        '  --json      Output machine-readable JSON instead of text\n' +
        '\n' +
        'Environment:\n' +
        '  BENCHMARK_FILE   Path to benchmark.json (default: web/public/data/benchmark.json)\n'
    );
    process.exit(0);
  }
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
