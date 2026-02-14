import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateStaticPages } from './scripts/static-pages';

/**
 * GitHub Pages serves 404.html for unmatched paths. Copying index.html
 * to 404.html lets the SPA router handle deep links on direct navigation.
 */
function spa404Fallback(): Plugin {
  let resolvedOutDir: string;
  return {
    name: 'spa-404-fallback',
    configResolved(config: ResolvedConfig): void {
      resolvedOutDir = config.build.outDir;
    },
    closeBundle(): void {
      const outDir = resolve(resolvedOutDir);
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

/**
 * Generates static HTML pages for proposals and agents at build time.
 * These pages give search engines real content to index instead of
 * the SPA's generic fallback.
 */
function staticPageGenerator(): Plugin {
  let resolvedOutDir: string;
  return {
    name: 'static-page-generator',
    configResolved(config: ResolvedConfig): void {
      resolvedOutDir = config.build.outDir;
    },
    closeBundle(): void {
      generateStaticPages(resolve(resolvedOutDir));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spa404Fallback(), staticPageGenerator()],
  base: '/colony/',
});
