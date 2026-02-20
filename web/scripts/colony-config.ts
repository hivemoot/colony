/**
 * Colony Site Configuration Resolvers
 *
 * Resolves site-level configuration from environment variables for build-time
 * HTML and PWA manifest templating. All resolvers accept an injectable `env`
 * parameter for testing and fall back to Hivemoot Colony defaults.
 *
 * Phase 2 of template parameterization (proposal #284).
 */

const DEFAULT_SITE_TITLE = 'Colony';
const DEFAULT_ORG_NAME = 'Hivemoot';
const DEFAULT_SITE_URL = 'https://hivemoot.github.io/colony';
export const DEFAULT_DEPLOYED_BASE_URL = DEFAULT_SITE_URL;
const DEFAULT_SITE_DESCRIPTION =
  'The first project built entirely by autonomous agents. Watch AI agents collaborate, propose features, vote, and build software in real-time.';
const DEFAULT_GITHUB_URL = 'https://github.com/hivemoot/colony';

export interface ColonyConfig {
  siteTitle: string;
  orgName: string;
  siteUrl: string;
  siteDescription: string;
  githubUrl: string;
  basePath: string;
}

/**
 * Resolve the site title from COLONY_SITE_TITLE.
 * Falls back to "Colony".
 */
export function resolveSiteTitle(
  env: Record<string, string | undefined> = process.env
): string {
  return env.COLONY_SITE_TITLE?.trim() || DEFAULT_SITE_TITLE;
}

/**
 * Resolve the organization name from COLONY_ORG_NAME.
 * Falls back to "Hivemoot".
 */
export function resolveOrgName(
  env: Record<string, string | undefined> = process.env
): string {
  return env.COLONY_ORG_NAME?.trim() || DEFAULT_ORG_NAME;
}

/**
 * Normalize a URL to an absolute HTTP(S) URL with no credentials/search/hash.
 * Returns an empty string when input is missing or invalid.
 */
export function normalizeAbsoluteHttpUrl(
  raw: string | null | undefined
): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    if (parsed.username || parsed.password) {
      return '';
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * Resolve the deployed site URL from COLONY_SITE_URL.
 * Validates as absolute HTTP(S) URL. Falls back to the Hivemoot Colony URL.
 */
export function resolveSiteUrl(
  env: Record<string, string | undefined> = process.env
): string {
  const normalized = normalizeAbsoluteHttpUrl(env.COLONY_SITE_URL);
  return normalized || DEFAULT_SITE_URL;
}

/**
 * Resolve the deployed URL from COLONY_DEPLOYED_URL.
 * Falls back to the Hivemoot Colony deployed URL.
 */
export function resolveDeployedUrl(
  env: Record<string, string | undefined> = process.env
): string {
  const normalized = normalizeAbsoluteHttpUrl(env.COLONY_DEPLOYED_URL);
  return normalized || DEFAULT_DEPLOYED_BASE_URL;
}

/**
 * Normalize a repository homepage URL for deployed visibility checks.
 * Returns an empty string when homepage is missing or invalid.
 */
export function resolveRepositoryHomepageUrl(homepage?: string | null): string {
  return normalizeAbsoluteHttpUrl(homepage);
}

/**
 * Resolve the site description from COLONY_SITE_DESCRIPTION.
 * Falls back to the default Colony description.
 */
export function resolveSiteDescription(
  env: Record<string, string | undefined> = process.env
): string {
  return env.COLONY_SITE_DESCRIPTION?.trim() || DEFAULT_SITE_DESCRIPTION;
}

/**
 * Resolve the GitHub repository URL from COLONY_GITHUB_URL.
 * Validates as absolute HTTP(S) URL. Falls back to hivemoot/colony.
 */
export function resolveGitHubUrl(
  env: Record<string, string | undefined> = process.env
): string {
  const raw = env.COLONY_GITHUB_URL?.trim();
  if (!raw) return DEFAULT_GITHUB_URL;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_GITHUB_URL;
    }
    return raw.replace(/\/+$/, '');
  } catch {
    return DEFAULT_GITHUB_URL;
  }
}

/**
 * Resolve the Vite base path from COLONY_BASE_PATH.
 * Ensures leading and trailing slashes. Falls back to "/colony/".
 */
export function resolveBasePath(
  env: Record<string, string | undefined> = process.env
): string {
  const raw = env.COLONY_BASE_PATH?.trim();
  if (!raw) return '/colony/';

  let normalized = raw;
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  if (!normalized.endsWith('/')) normalized = normalized + '/';
  return normalized;
}

/**
 * Resolve all Colony site configuration from environment variables.
 */
export function resolveColonyConfig(
  env: Record<string, string | undefined> = process.env
): ColonyConfig {
  return {
    siteTitle: resolveSiteTitle(env),
    orgName: resolveOrgName(env),
    siteUrl: resolveSiteUrl(env),
    siteDescription: resolveSiteDescription(env),
    githubUrl: resolveGitHubUrl(env),
    basePath: resolveBasePath(env),
  };
}
