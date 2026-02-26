/**
 * Generate static HTML pages from fixture data for Lighthouse CI Phase 2 audits.
 *
 * Writes the fixture activity.json to dist/data/activity.json and calls
 * generateStaticPages so the Lighthouse workflow can audit real static
 * proposal and agent pages without a live GitHub API call.
 *
 * Run after `npm run build` in the Lighthouse CI workflow:
 *   npm run generate-static-fixture
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStaticPages } from './static-pages';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  SCRIPT_DIR,
  '__fixtures__',
  'lighthouse-activity.json'
);
const DIST_DIR = resolve(SCRIPT_DIR, '..', 'dist');
const DATA_DIR = join(DIST_DIR, 'data');

if (!existsSync(DIST_DIR)) {
  console.error(
    '[generate-static-fixture] dist/ not found — run `npm run build` first.'
  );
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
copyFileSync(FIXTURE_PATH, join(DATA_DIR, 'activity.json'));
console.log(
  '[generate-static-fixture] Wrote fixture data to dist/data/activity.json'
);

generateStaticPages(DIST_DIR);
console.log('[generate-static-fixture] Done.');
