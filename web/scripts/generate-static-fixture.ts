/**
 * Lighthouse CI Phase 2 — fixture page generator.
 *
 * Writes the checked-in fixture data to dist/data/activity.json and then
 * runs generateStaticPages() to produce deterministic proposal and agent
 * pages in dist/. Called by the Lighthouse CI workflow after `npm run build`
 * so the preview server can serve real static pages for auditing.
 *
 * The fixture contains a proposal with HTML-special characters in the title
 * (`&`, `<`, `>`) to validate that the escaping boundary in static-pages.ts
 * is exercised by the Lighthouse audit.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStaticPages } from './static-pages.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  SCRIPT_DIR,
  '__fixtures__',
  'lighthouse-activity.json'
);
const OUT_DIR = resolve(SCRIPT_DIR, '..', 'dist');
const DATA_DIR = join(OUT_DIR, 'data');

const fixtureJson = readFileSync(FIXTURE_PATH, 'utf-8');

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(join(DATA_DIR, 'activity.json'), fixtureJson);

generateStaticPages(OUT_DIR);

console.log(
  '[generate-static-fixture] Fixture pages written to dist/ for Lighthouse audit.'
);
