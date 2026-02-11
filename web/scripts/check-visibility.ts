import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { join } from 'node:path';

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

function runChecks(): CheckResult[] {
  const indexHtml = readIfExists(INDEX_HTML_PATH);
  const sitemapXml = readIfExists(SITEMAP_PATH);
  const robotsTxt = readIfExists(ROBOTS_PATH);

  return [
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
}

const results = runChecks();
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
