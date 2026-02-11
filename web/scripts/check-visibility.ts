import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..');
const INDEX_HTML_PATH = join(ROOT_DIR, 'index.html');
const SITEMAP_PATH = join(ROOT_DIR, 'public', 'sitemap.xml');
const ROBOTS_PATH = join(ROOT_DIR, 'public', 'robots.txt');

interface CheckResult {
  label: string;
  ok: boolean;
}

function readIfExists(path: string): string {
  if (!existsSync(path)) {
    return '';
  }
  return readFileSync(path, 'utf-8');
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
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'hivemoot-scout-visibility-check',
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
      results.push({
        label: 'Repository topics are set',
        ok: Array.isArray(repo.topics) && repo.topics.length > 0,
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

  // Deployed site checks
  if (homepageUrl && homepageUrl.startsWith('http')) {
    const baseUrl = homepageUrl.endsWith('/')
      ? homepageUrl.slice(0, -1)
      : homepageUrl;

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

    let deployedJsonLd = false;
    if (rootRes?.status === 200) {
      const html = await rootRes.text();
      deployedJsonLd = /<script\s+type=["']application\/ld\+json["']>/i.test(
        html
      );
    }
    results.push({
      label: 'Deployed site has JSON-LD metadata',
      ok: deployedJsonLd,
    });

    const robotsText = robotsRes?.status === 200 ? await robotsRes.text() : '';
    results.push({
      label: 'Deployed robots.txt has sitemap',
      ok: /Sitemap:\s*https?:\/\/\S+/i.test(robotsText),
    });

    const sitemapText =
      sitemapRes?.status === 200 ? await sitemapRes.text() : '';
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
          const ageMs = Date.now() - new Date(activity.generatedAt).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);
          freshnessOk = ageHours <= 18;
        }
      } catch {
        // ignore
      }
    }
    results.push({
      label: 'Deployed data freshness (<= 18h)',
      ok: freshnessOk,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const results = await runChecks();
  const failed = results.filter((result) => !result.ok);

  console.log('External visibility checks');
  for (const result of results) {
    console.log(`- ${result.ok ? 'PASS' : 'WARN'}: ${result.label}`);
  }

  if (failed.length > 0) {
    console.warn(
      `Visibility warnings: ${failed.length}/${results.length} checks failed.`
    );
  }

  process.exit(0);
}

main();
