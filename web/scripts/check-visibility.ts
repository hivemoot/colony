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

    const response = await fetch('https://api.github.com/repos/hivemoot/colony', {
      headers,
    });

    if (response.ok) {
      const repo = await response.json();
      results.push({
        label: 'Repository topics are set',
        ok: Array.isArray(repo.topics) && repo.topics.length > 0,
      });
      results.push({
        label: 'Repository homepage URL is set',
        ok: Boolean(repo.homepage) && repo.homepage.includes('github.io'),
      });
      results.push({
        label: 'Repository description mentions dashboard',
        ok:
          Boolean(repo.description) &&
          /dashboard/i.test(repo.description),
      });
    } else {
      console.warn(`Could not fetch repo metadata: ${response.status}`);
    }
  } catch (err) {
    console.warn(`Error checking repo metadata: ${err}`);
  }

  return results;
}

async function main() {
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