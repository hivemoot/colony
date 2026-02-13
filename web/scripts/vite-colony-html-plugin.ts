/**
 * Vite plugin for Colony build-time HTML and PWA manifest templating.
 *
 * Replaces org-specific placeholders in index.html and generates
 * manifest.webmanifest from Colony site configuration env vars.
 *
 * Phase 2 of template parameterization (proposal #284).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { resolveColonyConfig, type ColonyConfig } from './colony-config';

/**
 * Generate the PWA manifest JSON from config.
 */
export function buildManifest(config: ColonyConfig): string {
  const manifest = {
    name: `${config.siteTitle} | ${config.orgName}`,
    short_name: config.siteTitle,
    description: config.siteDescription,
    start_url: config.basePath,
    scope: config.basePath,
    display: 'standalone' as const,
    background_color: '#fffbeb',
    theme_color: '#d97706',
    icons: [
      {
        src: `${config.basePath}og-image.png`,
        sizes: '1200x630',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };

  return JSON.stringify(manifest, null, 2) + '\n';
}

/**
 * Apply all placeholder replacements to the HTML string.
 */
export function transformHtml(html: string, config: ColonyConfig): string {
  const siteUrlWithSlash = config.siteUrl + '/';
  const ogImageUrl = `${config.siteUrl}/og-image.png`;
  const pageTitle = `${config.siteTitle} | ${config.orgName}`;

  return html
    .replace(/__COLONY_CANONICAL_URL__/g, siteUrlWithSlash)
    .replace(/__COLONY_MANIFEST_HREF__/g, 'manifest.webmanifest')
    .replace(
      /__COLONY_META_DESCRIPTION__/g,
      `${config.siteTitle} - ${config.siteDescription}`
    )
    .replace(/__COLONY_OG_URL__/g, siteUrlWithSlash)
    .replace(/__COLONY_OG_TITLE__/g, pageTitle)
    .replace(/__COLONY_OG_DESCRIPTION__/g, config.siteDescription)
    .replace(/__COLONY_OG_IMAGE__/g, ogImageUrl)
    .replace(/__COLONY_OG_SITE_NAME__/g, config.orgName)
    .replace(/__COLONY_TWITTER_URL__/g, siteUrlWithSlash)
    .replace(/__COLONY_TWITTER_TITLE__/g, pageTitle)
    .replace(/__COLONY_TWITTER_DESCRIPTION__/g, config.siteDescription)
    .replace(/__COLONY_TWITTER_IMAGE__/g, ogImageUrl)
    .replace(/__COLONY_JSONLD_NAME__/g, config.siteTitle)
    .replace(/__COLONY_JSONLD_URL__/g, siteUrlWithSlash)
    .replace(/__COLONY_JSONLD_DESCRIPTION__/g, config.siteDescription)
    .replace(/__COLONY_JSONLD_PUBLISHER_NAME__/g, config.orgName)
    .replace(/__COLONY_JSONLD_PUBLISHER_URL__/g, config.githubUrl)
    .replace(/__COLONY_PAGE_TITLE__/g, pageTitle)
    .replace(/__COLONY_SITE_TITLE__/g, config.siteTitle)
    .replace(/__COLONY_NOSCRIPT_GITHUB_URL__/g, config.githubUrl);
}

/**
 * Vite plugin that templates index.html and generates manifest.webmanifest
 * from Colony site configuration environment variables.
 *
 * Uses enforce:'pre' + order:'pre' so placeholder replacement runs before
 * Vite's own HTML transforms. Absolute URLs (canonical, OG, Twitter) are
 * left alone by Vite. The manifest href is emitted as a relative path
 * ('manifest.webmanifest') so Vite's base-prefixing applies exactly once.
 */
export function colonyHtmlPlugin(): Plugin {
  const config = resolveColonyConfig();
  let resolvedConfig: ResolvedConfig;
  const manifestJson = buildManifest(config);

  return {
    name: 'colony-html',
    enforce: 'pre',

    configResolved(c): void {
      resolvedConfig = c;
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html): string {
        return transformHtml(html, config);
      },
    },

    configureServer(server): void {
      const manifestPath = `${config.basePath}manifest.webmanifest`;
      server.middlewares.use((req, res, next) => {
        if (req.url === manifestPath) {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifestJson);
          return;
        }
        next();
      });
    },

    writeBundle(): void {
      const outDir = resolvedConfig.build.outDir;
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'manifest.webmanifest'), manifestJson);
    },
  };
}
