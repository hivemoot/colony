import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { colonyHtmlPlugin } from './scripts/vite-colony-html-plugin';
import { resolveBasePath } from './scripts/colony-config';

export default defineConfig({
  plugins: [react(), tailwindcss(), colonyHtmlPlugin()],
  base: resolveBasePath(),
});
