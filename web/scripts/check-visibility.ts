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

interface FreshnessEvaluation {
  ok: boolean;
  details: string;
}

export function resolveVisibilityUserAgent(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.VISIBILITY_USER_AGENT?.trim();
  return configured || DEFAULT_VISIBILITY_USER_AGENT;
}

export function evaluateGeneratedAtFreshness(
  generatedAt: unknown,
  options?: {
    nowMs?: number;
    maxAgeHours?: number;
  }
): FreshnessEvaluation {
  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeHours = options?.maxAgeHours ?? 18;

  if (typeof generatedAt !== 'string') {
    return {
      ok: false,
      details: 'Missing generatedAt in deployed activity.json',
    };
  }

  const timestamp = new Date(generatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return {
      ok: false,
      details: 'Invalid timestamp in deployed activity.json',
    };
  }

  const ageMs = nowMs - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageMs < 0) {
    return {
      ok: false,
      details: `generatedAt is in the future (${Math.round(Math.abs(ageHours))}h ahead)`,
    };
  }

  return {
    ok: ageHours <= maxAgeHours,
    details: `Deployed data is ${Math.round(ageHours)}h old`,
  };
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

function getAbsoluteHttpsUrl(rawValue: string): string {
  try {
    const parsed = new URL(rawValue);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function resolveHttpsUrl(rawValue: string, baseUrl: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.startsWith('data:')) {
    return '';
  }

  try {
    const parsed = new URL(trimmed, `${baseUrl}/`);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function iconHasRequiredSize(
  icon: { sizes?: unknown },
  expectedSize: string
): boolean {
  return (
    typeof icon.sizes === 'string' &&
    icon.sizes.toLowerCase().split(/\s+/).includes(expectedSize.toLowerCase())
  );
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

function extractFileBackedFaviconHref(html: string): string {
  const tagPattern = /<link\b[^>]*>/gi;
  const attrPattern = (attribute: string): RegExp =>
    new RegExp(
      `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      'i'
    );

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const relMatch = tag.match(attrPattern('rel'));
    const relValue = (
      relMatch?.[1] ??
      relMatch?.[2] ??
      relMatch?.[3] ??
      ''
    ).trim();
    if (!relValue.toLowerCase().split(/\s+/).includes('icon')) {
      continue;
    }

    const hrefMatch = tag.match(attrPattern('href'));
    const hrefValue = (
      hrefMatch?.[1] ??
      hrefMatch?.[2] ??
      hrefMatch?.[3] ??
      ''
    ).trim();
    if (!hrefValue || hrefValue.toLowerCase().startsWith('data:')) {
      continue;
    }
    return hrefValue;
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
  const ogImageUrl = ogImageRaw ? getAbsoluteHttpsUrl(ogImageRaw) : '';
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
          ? `og:image must be an absolute https URL (found: ${ogImageRaw})`
          : 'Missing og:image metadata on deployed homepage',
  });

  const ogImageWidthRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'property',
    'og:image:width',
    'content'
  );
  const ogImageHeightRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'property',
    'og:image:height',
    'content'
  );
  const ogImageWidth = Number.parseInt(ogImageWidthRaw, 10);
  const ogImageHeight = Number.parseInt(ogImageHeightRaw, 10);
  const hasOgImageDimensions =
    Number.isInteger(ogImageWidth) &&
    Number.isInteger(ogImageHeight) &&
    ogImageWidth > 0 &&
    ogImageHeight > 0;
  results.push({
    label: 'Deployed Open Graph image dimensions are declared',
    ok: hasOgImageDimensions,
    details: hasOgImageDimensions
      ? `og:image dimensions set to ${ogImageWidth}x${ogImageHeight}`
      : !ogImageWidthRaw && !ogImageHeightRaw
        ? 'Missing og:image:width and og:image:height metadata on deployed homepage'
        : !ogImageWidthRaw
          ? 'Missing og:image:width metadata on deployed homepage'
          : !ogImageHeightRaw
            ? 'Missing og:image:height metadata on deployed homepage'
            : `Invalid og:image dimension values: width=${ogImageWidthRaw}, height=${ogImageHeightRaw}`,
  });

  const twitterImageRaw = extractTagAttributeValue(
    deployedRootHtml,
    'meta',
    'name',
    'twitter:image',
    'content'
  );
  const twitterImageSrcRaw = twitterImageRaw
    ? ''
    : extractTagAttributeValue(
        deployedRootHtml,
        'meta',
        'name',
        'twitter:image:src',
        'content'
      );
  const resolvedTwitterImageRaw = twitterImageRaw || twitterImageSrcRaw;
  const twitterImageUrl = resolvedTwitterImageRaw
    ? getAbsoluteHttpsUrl(resolvedTwitterImageRaw)
    : '';
  const twitterImageRes = twitterImageUrl
    ? await fetchWithTimeout(twitterImageUrl)
    : null;
  const hasDeployedTwitterImage = twitterImageRes?.status === 200;
  results.push({
    label: 'Deployed Twitter image reachable',
    ok: hasDeployedTwitterImage,
    details: hasDeployedTwitterImage
      ? `GET ${twitterImageUrl} returned 200`
      : twitterImageUrl
        ? `GET ${twitterImageUrl} returned ${twitterImageRes?.status ?? 'no response'}`
        : resolvedTwitterImageRaw
          ? `twitter:image must be an absolute https URL (found: ${resolvedTwitterImageRaw})`
          : 'Missing twitter:image metadata on deployed homepage',
  });

  const manifestRaw = extractTagAttributeValue(
    deployedRootHtml,
    'link',
    'rel',
    'manifest',
    'href'
  );
  const manifestUrl = manifestRaw ? resolveHttpsUrl(manifestRaw, baseUrl) : '';
  const manifestRes = manifestUrl ? await fetchWithTimeout(manifestUrl) : null;
  const requiredManifestSizes = ['192x192', '512x512'] as const;

  const manifestIconUrls: Partial<
    Record<(typeof requiredManifestSizes)[number], string>
  > = {};
  let manifestDetails = '';

  if (!manifestRaw) {
    manifestDetails = 'Missing manifest link metadata on deployed homepage';
  } else if (!manifestUrl) {
    manifestDetails = `Manifest URL must resolve to absolute https URL (found: ${manifestRaw})`;
  } else if (manifestRes?.status !== 200) {
    manifestDetails = `GET ${manifestUrl} returned ${manifestRes?.status ?? 'no response'}`;
  } else {
    try {
      const manifest = (await manifestRes.json()) as {
        icons?: Array<{ src?: unknown; sizes?: unknown }>;
      };
      if (!Array.isArray(manifest.icons)) {
        manifestDetails = 'Manifest is missing icons[] entries';
      } else {
        const missingSizes: string[] = [];
        const invalidIconUrls: string[] = [];
        for (const size of requiredManifestSizes) {
          const icon = manifest.icons.find((entry) =>
            iconHasRequiredSize(entry, size)
          );
          if (!icon || typeof icon.src !== 'string' || !icon.src.trim()) {
            missingSizes.push(size);
            continue;
          }

          const iconUrl = resolveHttpsUrl(icon.src, manifestUrl);
          if (!iconUrl) {
            invalidIconUrls.push(`${size} (${icon.src})`);
            continue;
          }
          manifestIconUrls[size] = iconUrl;
        }

        if (missingSizes.length > 0 || invalidIconUrls.length > 0) {
          const parts: string[] = [];
          if (missingSizes.length > 0) {
            parts.push(
              `Missing required icon sizes: ${missingSizes.join(', ')}`
            );
          }
          if (invalidIconUrls.length > 0) {
            parts.push(
              `Icon URLs must resolve to absolute https URLs: ${invalidIconUrls.join(', ')}`
            );
          }
          manifestDetails = parts.join('. ');
        } else {
          manifestDetails = `Manifest contains ${requiredManifestSizes.join(' and ')} icons`;
        }
      }
    } catch {
      manifestDetails = `Manifest at ${manifestUrl} is not valid JSON`;
    }
  }

  results.push({
    label: 'Deployed PWA manifest has required square icons',
    ok:
      manifestDetails ===
      `Manifest contains ${requiredManifestSizes.join(' and ')} icons`,
    details: manifestDetails,
  });

  const manifestIconFetches = await Promise.all(
    requiredManifestSizes.map(async (size) => {
      const url = manifestIconUrls[size];
      if (!url) {
        return { size, status: null as number | null, url: '' };
      }
      const response = await fetchWithTimeout(url);
      return { size, status: response?.status ?? null, url };
    })
  );
  const allManifestIconsReachable = manifestIconFetches.every(
    ({ status }) => status === 200
  );
  const manifestFetchDetails = allManifestIconsReachable
    ? manifestIconFetches
        .map(({ size, url }) => `${size}: GET ${url} returned 200`)
        .join('; ')
    : manifestIconFetches
        .map(({ size, status, url }) =>
          url
            ? `${size}: GET ${url} returned ${status ?? 'no response'}`
            : `${size}: missing manifest icon URL`
        )
        .join('; ');
  results.push({
    label: 'Deployed PWA icon assets are reachable',
    ok: allManifestIconsReachable,
    details: manifestFetchDetails,
  });

  const faviconRaw = extractFileBackedFaviconHref(deployedRootHtml);
  let faviconUrl = '';
  if (faviconRaw) {
    try {
      faviconUrl = new URL(faviconRaw, `${baseUrl}/`).toString();
    } catch {
      faviconUrl = '';
    }
  }
  const faviconRes = faviconUrl ? await fetchWithTimeout(faviconUrl) : null;
  const hasDeployedFavicon = faviconRes?.status === 200;
  results.push({
    label: 'Deployed favicon reachable',
    ok: hasDeployedFavicon,
    details: hasDeployedFavicon
      ? `GET ${faviconUrl} returned 200`
      : faviconUrl
        ? `GET ${faviconUrl} returned ${faviconRes?.status ?? 'no response'}`
        : faviconRaw
          ? `Invalid favicon URL: ${faviconRaw}`
          : 'Missing file-backed favicon metadata on deployed homepage',
  });

  const appleTouchIconRaw = extractTagAttributeValue(
    deployedRootHtml,
    'link',
    'rel',
    'apple-touch-icon',
    'href'
  );
  const appleTouchIconUrl = appleTouchIconRaw
    ? resolveHttpsUrl(appleTouchIconRaw, baseUrl)
    : '';
  const appleTouchIconRes = appleTouchIconUrl
    ? await fetchWithTimeout(appleTouchIconUrl)
    : null;
  const hasDeployedAppleTouchIcon = appleTouchIconRes?.status === 200;
  results.push({
    label: 'Deployed Apple touch icon reachable',
    ok: hasDeployedAppleTouchIcon,
    details: hasDeployedAppleTouchIcon
      ? `GET ${appleTouchIconUrl} returned 200`
      : appleTouchIconUrl
        ? `GET ${appleTouchIconUrl} returned ${appleTouchIconRes?.status ?? 'no response'}`
        : appleTouchIconRaw
          ? `apple-touch-icon href must resolve to an https URL (found: ${appleTouchIconRaw})`
          : 'Missing apple-touch-icon link tag on deployed homepage',
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
  let freshnessDetails = 'Could not fetch deployed activity data';
  if (activityRes?.status === 200) {
    try {
      const activity = (await activityRes.json()) as {
        generatedAt?: unknown;
      };
      const freshness = evaluateGeneratedAtFreshness(activity.generatedAt);
      freshnessOk = freshness.ok;
      freshnessDetails = freshness.details;
    } catch {
      freshnessDetails = 'Invalid activity.json format on deployed site';
    }
  }
  results.push({
    label: 'Deployed data freshness (<= 18h)',
    ok: freshnessOk,
    details: freshnessDetails,
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
