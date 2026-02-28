import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SITE_DIR = 'dist';
const OUTPUT_SUBDIR = '_pagefind';

function hasStaticPages(siteDir: string): boolean {
  return (
    existsSync(join(siteDir, 'proposals', 'index.html')) ||
    existsSync(join(siteDir, 'proposal')) ||
    existsSync(join(siteDir, 'agent'))
  );
}

function hasMetaFile(directory: string): boolean {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (hasMetaFile(fullPath)) {
        return true;
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.pf_meta')) {
      return true;
    }
  }

  return false;
}

function assertArtifactsExist(siteDir: string, outputSubdir: string): void {
  const outputDir = join(siteDir, outputSubdir);
  const requiredFiles = [
    join(outputDir, 'pagefind.js'),
    join(outputDir, 'pagefind-entry.json'),
  ];

  for (const required of requiredFiles) {
    if (!existsSync(required)) {
      throw new Error(`[pagefind] Missing required artifact: ${required}`);
    }
  }

  if (!hasMetaFile(outputDir)) {
    throw new Error(
      `[pagefind] Static pages exist but no .pf_meta files found in ${outputDir}.`
    );
  }
}

function buildPagefindIndex(): void {
  if (!hasStaticPages(SITE_DIR)) {
    console.log(
      `[pagefind] No generated static pages found in ${SITE_DIR}. Skipping index build.`
    );
    return;
  }

  execFileSync(
    'npx',
    [
      '--no-install',
      'pagefind',
      '--site',
      SITE_DIR,
      '--output-subdir',
      OUTPUT_SUBDIR,
    ],
    { stdio: 'inherit' }
  );

  assertArtifactsExist(SITE_DIR, OUTPUT_SUBDIR);

  console.log(
    `[pagefind] Search index generated in ${SITE_DIR}/${OUTPUT_SUBDIR}`
  );
}

buildPagefindIndex();
