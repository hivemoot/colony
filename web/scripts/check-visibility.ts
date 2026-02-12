import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..');
const INDEX_HTML_PATH = join(ROOT_DIR, 'index.html');
const SITEMAP_PATH = join(ROOT_DIR, 'public', 'sitemap.xml');
const ROBOTS_PATH = join(ROOT_DIR, 'public', 'robots.txt');
const DEFAULT_DEPLOYED_BASE_URL = 'https://hivemoot.github.io/colony';
const DEFAULT_VISIBILITY_USER_AGENT = 'colony-visibility-check';
const REQUIRED_DISCOVERABILITY_TOPICS = [
  'autonomous-agents',
  'ai-governance',
  'multi-agent',
  'agent-collaboration',
  'dashboard',
  'react',
  'typescript',
  'github-pages',
  'open-source',
];

interface CheckResult {
  label: string;
  ok: boolean;
  details?: string;
}

export function resolveVisibilityUserAgent(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.VISIBILITY_USER_AGENT?.trim();
  return configured || DEFAULT_VISIBILITY_USER_AGENT;
}

function readIfExists(path: string): string {
  if (!existsSync(path)) {
    return '';
  }
  return readFileSync(path, 'utf-8');
}

function resolveDeployedBaseUrl(homepage?: string): {
  baseUrl: string;
  usedFallback: boolean;
} {
  const trimmedHomepage = homepage?.trim();
  if (trimmedHomepage && trimmedHomepage.startsWith('http')) {
    return {
      baseUrl: trimmedHomepage.endsWith('/')
        ? trimmedHomepage.slice(0, -1)
        : trimmedHomepage,
      usedFallback: false,
    };
  }

  return {
    baseUrl: DEFAULT_DEPLOYED_BASE_URL,
    usedFallback: true,
  };
}

function normalizeUrlForMatch(value: string): string {
  return value.replace(/\/+$/, '').toLowerCase();
}

function extractTagAttributeValue(
  html: string,
  tagName: string,
  requiredAttribute: string,
  requiredValue: string,
  targetAttribute: string
): string {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const requiredValueNormalized = requiredValue.toLowerCase();
  const requiredAttributeNormalized = requiredAttribute.toLowerCase();

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const attrPattern = (attribute: string): RegExp =>
      new RegExp(
        `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
        'i'
      );
    const requiredAttrMatch = tag.match(attrPattern(requiredAttribute));
    const requiredAttrValue = (
      requiredAttrMatch?.[1] ??
      requiredAttrMatch?.[2] ??
      requiredAttrMatch?.[3] ??
      ''
    ).trim();
    if (!requiredAttrValue) {
      continue;
    }

    const requiredMatches =
      requiredAttributeNormalized === 'rel'
        ? requiredAttrValue
            .toLowerCase()
            .split(/\s+/)
            .includes(requiredValueNormalized)
        : requiredAttrValue.toLowerCase() === requiredValueNormalized;
    if (!requiredMatches) {
      continue;
    }

    const targetAttrMatch = tag.match(attrPattern(targetAttribute));
    const targetAttrValue = (
      targetAttrMatch?.[1] ??
      targetAttrMatch?.[2] ??
      targetAttrMatch?.[3] ??
      ''
    ).trim();
    if (targetAttrValue) {
      return targetAttrValue;
    }
  }

  return '';
}

async function runChecks(): Promise<CheckResult[]> {
  const indexHtml = readIfExists(INDEX_HTML_PATH);
  const sitemapXml = readIfExists(SITEMAP_PATH);
  const robotsTxt = readIfExists(ROBOTS_PATH);

  const results: CheckResult[] = [
    {
      label: 'Structured metadata (application/ld+json) is present',
      ok: /<script\s+type=["']application\/ld\+json["']>/i.test(indexHtml),
    },
    {
      label: 'sitemap.xml includes <lastmod>',
      ok: /<lastmod>[^<]+<\/lastmod>/i.test(sitemapXml),
    },
    {
      label: 'robots.txt includes a Sitemap directive',
      ok: /Sitemap:\s*https?:\/\/\S+/i.test(robotsTxt),
    },
  ];

  let homepageUrl = '';

  // Repository metadata checks via GitHub API
  try {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const userAgent = resolveVisibilityUserAgent();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': userAgent,
    };
    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const response = await fetch(
      'https://api.github.com/repos/hivemoot/colony',
      {
        headers,
      }
    );

    if (response.ok) {
      const repo = (await response.json()) as {
        topics?: string[];
        homepage?: string | null;
        description?: string | null;
      };
      homepageUrl = repo.homepage || '';
      const normalizedTopics = new Set(
        (repo.topics ?? []).map((topic) => topic.toLowerCase())
      );
      const missingTopics = REQUIRED_DISCOVERABILITY_TOPICS.filter(
        (topic) => !normalizedTopics.has(topic)
      );
      results.push({
        label: `Repository has required topics (${REQUIRED_DISCOVERABILITY_TOPICS.length})`,
        ok: missingTopics.length === 0,
        details:
          missingTopics.length === 0
            ? `${REQUIRED_DISCOVERABILITY_TOPICS.length}/${REQUIRED_DISCOVERABILITY_TOPICS.length} required topics present`
            : `Missing required topics: ${missingTopics.join(', ')}`,
      });
      results.push({
        label: 'Repository homepage URL is set',
        ok: Boolean(repo.homepage && repo.homepage.includes('github.io')),
      });
      results.push({
        label: 'Repository description mentions dashboard',
        ok: Boolean(repo.description && /dashboard/i.test(repo.description)),
      });
    } else {
      console.warn(`Could not fetch repo metadata: ${response.status}`);
    }
  } catch (err) {
    console.warn(`Error checking repo metadata: ${err}`);
  }

  // Deployed site checks (always run; fallback when homepage metadata is missing).
  const { baseUrl, usedFallback } = resolveDeployedBaseUrl(homepageUrl);
  if (usedFallback) {
    console.warn(
      `Repository homepage missing/invalid. Using fallback deployed URL: ${DEFAULT_DEPLOYED_BASE_URL}`
    );
  }

  const fetchWithTimeout = async (url: string): Promise<Response | null> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch {
      clearTimeout(id);
      return null;
    }
  };

  const [rootRes, robotsRes, sitemapRes, activityRes] = await Promise.all([
    fetchWithTimeout(baseUrl),
    fetchWithTimeout(`${baseUrl}/robots.txt`),
    fetchWithTimeout(`${baseUrl}/sitemap.xml`),
    fetchWithTimeout(`${baseUrl}/data/activity.json`),
  ]);

  results.push({
    label: 'Deployed site is reachable',
    ok: rootRes?.status === 200,
  });

  let deployedRootHtml = '';
  let deployedJsonLd = false;
  if (rootRes?.status === 200) {
    const html = await rootRes.text();
    deployedRootHtml = html;
    deployedJsonLd = /<script\s+type=["']application\/ld\+json["']>/i.test(
      html
    );
  }
  results.push({
    label: 'Deployed site has JSON-LD metadata',
    ok: deployedJsonLd,
  });

  const canonicalUrl = extractTagAttributeValue(
    deployedRootHtml,
    'link',
    'rel',
    'canonical',
    'href'
  );
  const expectedCanonical = `${baseUrl}/`;
  const hasCanonicalParity =
    canonicalUrl.length > 0 &&
    normalizeUrlForMatch(canonicalUrl) ===
      normalizeUrlForMatch(expectedCanonical);
  results.push({
    label: 'Deployed canonical URL matches homepage',
    ok: hasCanonicalParity,
    details: hasCanonicalParity
      ? `Canonical matches ${expectedCanonical}`
      : canonicalUrl
        ? `Canonical mismatch: expected ${expectedCanonical}, found ${canonicalUrl}`
        : 'Missing canonical link on deployed homepage',
  });

  const ogImageRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'property',
    'og:image',
    'content'
  );
  let ogImageUrl = '';
  if (ogImageRaw) {
    try {
      ogImageUrl = new URL(ogImageRaw, `${baseUrl}/`).toString();
    } catch {
      ogImageUrl = '';
    }
  }
  const ogImageRes = ogImageUrl ? await fetchWithTimeout(ogImageUrl) : null;
  const hasDeployedOgImage = ogImageRes?.status === 200;
  results.push({
    label: 'Deployed Open Graph image reachable',
    ok: hasDeployedOgImage,
    details: hasDeployedOgImage
      ? `GET ${ogImageUrl} returned 200`
      : ogImageUrl
        ? `GET ${ogImageUrl} returned ${ogImageRes?.status ?? 'no response'}`
        : ogImageRaw
          ? `Invalid og:image URL: ${ogImageRaw}`
          : 'Missing og:image metadata on deployed homepage',
  });

  const robotsText = robotsRes?.status === 200 ? await robotsRes.text() : '';
  results.push({
    label: 'Deployed robots.txt has sitemap',
    ok: /Sitemap:\s*https?:\/\/\S+/i.test(robotsText),
  });

  const sitemapText = sitemapRes?.status === 200 ? await sitemapRes.text() : '';
  results.push({
    label: 'Deployed sitemap.xml has <lastmod>',
    ok: /<lastmod>[^<]+<\/lastmod>/i.test(sitemapText),
  });

  let freshnessOk = false;
  if (activityRes?.status === 200) {
    try {
      const activity = (await activityRes.json()) as {
        generatedAt?: unknown;
      };
      if (typeof activity.generatedAt === 'string') {
        const timestamp = new Date(activity.generatedAt).getTime();
        if (!isNaN(timestamp)) {
          const ageMs = Date.now() - timestamp;
          const ageHours = ageMs / (1000 * 60 * 60);
          freshnessOk = ageHours <= 18;
        }
      }
    } catch {
      // ignore
    }
  }
  results.push({
    label: 'Deployed data freshness (<= 18h)',
    ok: freshnessOk,
  });

  return results;
}

async function main(): Promise<void> {
  const results = await runChecks();
  const failed = results.filter((result) => !result.ok);

  console.log('External visibility checks');
  for (const result of results) {
    console.log(`- ${result.ok ? 'PASS' : 'WARN'}: ${result.label}`);
    if (result.details && !result.ok) {
      console.log(`  ${result.details}`);
    }
  }

  if (failed.length > 0) {
    console.warn(
      `Visibility warnings: ${failed.length}/${results.length} checks failed.`
    );
  }

  process.exit(0);
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
  void main();
}
