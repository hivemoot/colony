/**
 * Colony Registry verifier — CLI script.
 *
 * Reads the source registry at `web/colony-registry.json` (or the path in
 * REGISTRY_FILE) and:
 *   1. Validates the registry schema (all required fields, correct types).
 *   2. Optionally fetches each entry's federation stub and data endpoints to
 *      confirm they are reachable (requires --fetch flag; skipped by default
 *      to avoid network calls in CI lint runs).
 *
 * The source registry lives at `web/colony-registry.json` and is copied to
 * `public/data/colony-registry.json` at build time by `static-pages.ts`.
 *
 * Usage:
 *   npm run verify-registry
 *   npm run verify-registry -- --fetch
 *   npm run verify-registry -- --json
 *   npm run verify-registry -- --fetch --json
 *   REGISTRY_FILE=/path/to/colony-registry.json npm run verify-registry
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateRegistry,
  type ColonyRegistryEntry,
} from '../shared/colony-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Source registry lives at web/colony-registry.json (committed, manually curated).
// It is copied to public/data/ at build time.
const DEFAULT_REGISTRY_FILE = join(__dirname, '..', 'colony-registry.json');
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_USER_AGENT = 'colony-registry-verifier';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistryCheckResult {
  label: string;
  ok: boolean;
  details?: string;
}

export interface RegistryVerifyReport {
  verifiedAt: string;
  registryFile: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  checks: RegistryCheckResult[];
}

interface CliOptions {
  fetch: boolean;
  json: boolean;
  registryFile: string;
}

// ── CLI argument parsing ──────────────────────────────────────────────────────

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): CliOptions {
  if (argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const registryFile = env.REGISTRY_FILE?.trim() || DEFAULT_REGISTRY_FILE;

  return {
    fetch: argv.includes('--fetch'),
    json: argv.includes('--json'),
    registryFile,
  };
}

function printHelp(): void {
  console.log(`
verify-registry — validate and optionally probe Colony registry entries

USAGE
  npm run verify-registry [-- OPTIONS]

OPTIONS
  --fetch    Fetch each entry's federation stub and data endpoints to
             verify they are reachable. Skipped by default (offline mode).
  --json     Emit a JSON RegistryVerifyReport instead of human-readable output.
  --help     Show this help text.

ENVIRONMENT
  REGISTRY_FILE   Path to the registry JSON file.
                  Default: web/colony-registry.json
`);
}

// ── Schema validation ─────────────────────────────────────────────────────────

export function buildSchemaChecks(registryFile: string): RegistryCheckResult[] {
  const checks: RegistryCheckResult[] = [];

  // File existence
  if (!existsSync(registryFile)) {
    checks.push({
      label: 'registry file exists',
      ok: false,
      details: `Not found: ${registryFile}`,
    });
    return checks;
  }
  checks.push({ label: 'registry file exists', ok: true });

  // JSON parse
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(registryFile, 'utf-8'));
  } catch (err) {
    checks.push({
      label: 'registry parses as JSON',
      ok: false,
      details: String(err),
    });
    return checks;
  }
  checks.push({ label: 'registry parses as JSON', ok: true });

  // Schema validation
  const { errors } = validateRegistry(raw);
  if (errors.length > 0) {
    checks.push({
      label: 'registry schema valid',
      ok: false,
      details: errors.join('; '),
    });
    return checks;
  }
  checks.push({ label: 'registry schema valid', ok: true });

  const registry = raw as { entries: ColonyRegistryEntry[] };

  // Per-entry summary (schema-level only)
  for (const entry of registry.entries) {
    checks.push({
      label: `entry "${entry.name}" schema`,
      ok: true,
    });
  }

  return checks;
}

// ── Reachability probing ──────────────────────────────────────────────────────

export async function probeUrl(
  url: string,
  label: string
): Promise<RegistryCheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': FETCH_USER_AGENT },
    });
    clearTimeout(timer);
    if (res.ok) {
      return { label, ok: true };
    }
    return {
      label,
      ok: false,
      details: `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      label,
      ok: false,
      details: String(err),
    };
  }
}

export async function buildFetchChecks(
  registryFile: string
): Promise<RegistryCheckResult[]> {
  const checks: RegistryCheckResult[] = [];

  if (!existsSync(registryFile)) {
    return checks;
  }

  let registry: { entries: ColonyRegistryEntry[] };
  try {
    const raw = JSON.parse(readFileSync(registryFile, 'utf-8'));
    const { registry: parsed, errors } = validateRegistry(raw);
    if (!parsed || errors.length > 0) {
      return checks;
    }
    registry = parsed;
  } catch {
    return checks;
  }

  const probes: Promise<RegistryCheckResult>[] = [];

  for (const entry of registry.entries) {
    const n = entry.name;

    probes.push(
      probeUrl(
        entry.dataEndpoints.activityJson,
        `"${n}" activityJson reachable`
      )
    );

    probes.push(
      probeUrl(
        entry.dataEndpoints.governanceHistoryJson,
        `"${n}" governanceHistoryJson reachable`
      )
    );

    if (entry.dataEndpoints.chaossMetricsJson) {
      probes.push(
        probeUrl(
          entry.dataEndpoints.chaossMetricsJson,
          `"${n}" chaossMetricsJson reachable`
        )
      );
    }

    if (entry.federationStubUrl) {
      probes.push(
        probeUrl(entry.federationStubUrl, `"${n}" federationStubUrl reachable`)
      );
    }
  }

  const results = await Promise.all(probes);
  checks.push(...results);
  return checks;
}

// ── Report rendering ──────────────────────────────────────────────────────────

function renderHuman(report: RegistryVerifyReport): void {
  const { summary, checks } = report;
  for (const check of checks) {
    const icon = check.ok ? '✓' : '✗';
    const line = check.details
      ? `  ${icon} ${check.label}: ${check.details}`
      : `  ${icon} ${check.label}`;
    console.log(line);
  }
  console.log('');
  console.log(
    `${summary.passed}/${summary.total} checks passed` +
      (summary.failed > 0 ? ` — ${summary.failed} failed` : '')
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(
  argv: string[] = process.argv.slice(2)
): Promise<void> {
  const opts = parseArgs(argv);

  let checks: RegistryCheckResult[] = buildSchemaChecks(opts.registryFile);

  if (opts.fetch) {
    const fetchChecks = await buildFetchChecks(opts.registryFile);
    checks = [...checks, ...fetchChecks];
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;

  const report: RegistryVerifyReport = {
    verifiedAt: new Date().toISOString(),
    registryFile: opts.registryFile,
    summary: { total: checks.length, passed, failed },
    checks,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderHuman(report);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

// Run when executed directly
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain || process.argv[1]?.includes('verify-registry')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
