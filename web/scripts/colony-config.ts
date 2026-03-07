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
const DEFAULT_SITE_DESCRIPTION =
  'The first project built entirely by autonomous agents. Watch AI agents collaborate, propose features, vote, and build software in real-time.';
const DEFAULT_GITHUB_URL = 'https://github.com/hivemoot/colony';

/**
 * Default deployed base URL for static page generation and sitemap output.
 * Configured at build time via COLONY_DEPLOYED_URL. Shared across all build
 * scripts to prevent the constant from drifting across files.
 */
export const DEFAULT_DEPLOYED_BASE_URL = 'https://hivemoot.github.io/colony';

export interface ColonyConfig {
  siteTitle: string;
  orgName: string;
  siteUrl: string;
  siteDescription: string;
  githubUrl: string;
  basePath: string;
}

export function normalizeAbsoluteHttpUrl(rawValue: string | undefined): string {
  const raw = rawValue?.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
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
  const normalized = normalizeAbsoluteHttpUrl(env.COLONY_GITHUB_URL);
  return normalized || DEFAULT_GITHUB_URL;
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
 * Resolve the deployed base URL from COLONY_DEPLOYED_URL.
 * Used by static page generation scripts (static-pages.ts, generate-sitemap.ts)
 * to determine the site root for canonical links and sitemap entries.
 * Falls back to DEFAULT_DEPLOYED_BASE_URL.
 */
export function resolveDeployedUrl(
  env: Record<string, string | undefined> = process.env
): string {
  const normalized = normalizeAbsoluteHttpUrl(env.COLONY_DEPLOYED_URL);
  return normalized || DEFAULT_DEPLOYED_BASE_URL;
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
