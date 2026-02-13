import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * GitHub Pages serves 404.html for unmatched paths. Copying index.html
 * to 404.html lets the SPA router handle deep links on direct navigation.
 */
function spa404Fallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle(): void {
      const outDir = resolve(__dirname, 'dist');
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spa404Fallback()],
  base: '/colony/',
});
