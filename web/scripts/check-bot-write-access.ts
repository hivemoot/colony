import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORG = 'hivemoot';
const DEFAULT_APP_SLUG = 'hivemoot-bot';

interface CliOptions {
  org: string;
  appSlug: string;
  json: boolean;
}

interface Installation {
  app_slug?: unknown;
  permissions?: unknown;
}

interface InstallationsResponse {
  installations?: Installation[];
}

export interface BotPermissionResult {
  status: 'verified' | 'blocked';
  reason: string;
  org: string;
  appSlug: string;
  command: string;
  installationId?: number;
  contentsPermission?: string;
  error?: string;
}

function printHelp(): void {
  console.log(
    'Usage: npm run check-bot-write-access -- [--org=hivemoot] [--app-slug=hivemoot-bot] [--json]'
  );
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    org: DEFAULT_ORG,
    appSlug: DEFAULT_APP_SLUG,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--org=')) {
      const value = arg.slice('--org='.length).trim();
      options.org = value || DEFAULT_ORG;
      continue;
    }

    if (arg.startsWith('--app-slug=')) {
      const value = arg.slice('--app-slug='.length).trim();
      options.appSlug = value || DEFAULT_APP_SLUG;
      continue;
    }

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function asInstallationsResponse(value: unknown): InstallationsResponse {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return value as InstallationsResponse;
}

export function findInstallation(
  payload: unknown,
  appSlug: string
): Installation | null {
  const parsed = asInstallationsResponse(payload);
  if (!Array.isArray(parsed.installations)) {
    return null;
  }

  const normalizedTarget = appSlug.trim().toLowerCase();
  for (const installation of parsed.installations) {
    if (typeof installation.app_slug !== 'string') {
      continue;
    }
    if (installation.app_slug.trim().toLowerCase() === normalizedTarget) {
      return installation;
    }
  }

  return null;
}

function getInstallationId(installation: Installation): number | undefined {
  if (
    typeof (installation as { id?: unknown }).id === 'number' &&
    Number.isFinite((installation as { id?: number }).id)
  ) {
    return (installation as { id: number }).id;
  }
  return undefined;
}

export function normalizePermissionValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

export function hasContentsWritePermission(installation: Installation | null): {
  ok: boolean;
  permission: string;
} {
  if (
    !installation ||
    installation.permissions == null ||
    typeof installation.permissions !== 'object'
  ) {
    return {
      ok: false,
      permission: '',
    };
  }

  const rawPermission = (installation.permissions as { contents?: unknown })
    .contents;
  const permission = normalizePermissionValue(rawPermission);
  return {
    ok: permission === 'write' || permission === 'admin',
    permission,
  };
}

function buildInstallationsCommand(org: string): string {
  return `gh api /orgs/${org}/installations`;
}

function blockedResult(
  reason: string,
  options: CliOptions,
  extras: Partial<BotPermissionResult> = {}
): BotPermissionResult {
  return {
    status: 'blocked',
    reason,
    org: options.org,
    appSlug: options.appSlug,
    command: buildInstallationsCommand(options.org),
    ...extras,
  };
}

export function verifyBotWriteAccess(
  options: CliOptions,
  runCommand: (args: string[]) => string = (args) =>
    execFileSync('gh', args, { encoding: 'utf8' })
): BotPermissionResult {
  const args = ['api', `/orgs/${options.org}/installations`];

  let raw = '';
  try {
    raw = runCommand(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return blockedResult('admin-required', options, { error: message });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return blockedResult('invalid-response', options, { error: raw.trim() });
  }

  const installation = findInstallation(payload, options.appSlug);
  if (!installation) {
    return blockedResult('app-not-installed', options);
  }

  const { ok, permission } = hasContentsWritePermission(installation);
  if (!ok) {
    return blockedResult('missing-contents-write', options, {
      installationId: getInstallationId(installation),
      contentsPermission: permission,
    });
  }

  return {
    status: 'verified',
    reason: 'contents-write-confirmed',
    org: options.org,
    appSlug: options.appSlug,
    command: buildInstallationsCommand(options.org),
    installationId: getInstallationId(installation),
    contentsPermission: permission,
  };
}

export function formatTextResult(result: BotPermissionResult): string {
  if (result.status === 'verified') {
    return [
      'VERIFIED: bot write access confirmed',
      `org=${result.org}`,
      `app=${result.appSlug}`,
      `installationId=${result.installationId ?? 'unknown'}`,
      `contentsPermission=${result.contentsPermission || 'unknown'}`,
    ].join('\n');
  }

  return [
    `BLOCKED: ${result.reason}`,
    `org=${result.org}`,
    `app=${result.appSlug}`,
    `command=${result.command}`,
    result.error ? `error=${result.error}` : '',
    'Admin verifier command:',
    `${result.command} --jq '.installations[] | select(.app_slug == "${result.appSlug}") | {id, permissions: .permissions}'`,
  ]
    .filter(Boolean)
    .join('\n');
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const result = verifyBotWriteAccess(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTextResult(result));
  }

  if (result.status !== 'verified') {
    process.exitCode = 1;
  }
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
