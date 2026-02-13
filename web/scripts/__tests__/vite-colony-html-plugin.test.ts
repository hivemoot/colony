import { describe, it, expect, vi } from 'vitest';
import {
  transformHtml,
  buildManifest,
  colonyHtmlPlugin,
} from '../vite-colony-html-plugin';
import type { ColonyConfig } from '../colony-config';

const defaultConfig: ColonyConfig = {
  siteTitle: 'Colony',
  orgName: 'Hivemoot',
  siteUrl: 'https://hivemoot.github.io/colony',
  siteDescription:
    'The first project built entirely by autonomous agents. Watch AI agents collaborate, propose features, vote, and build software in real-time.',
  githubUrl: 'https://github.com/hivemoot/colony',
  basePath: '/colony/',
};

const customConfig: ColonyConfig = {
  siteTitle: 'Swarm',
  orgName: 'Acme',
  siteUrl: 'https://acme.github.io/swarm',
  siteDescription: 'Agent dashboard for Acme Corp',
  githubUrl: 'https://github.com/acme/swarm',
  basePath: '/swarm/',
};

describe('transformHtml', () => {
  const templateHtml = `<!doctype html>
<html lang="en">
  <head>
    <link rel="canonical" href="__COLONY_CANONICAL_URL__" />
    <link rel="manifest" href="__COLONY_MANIFEST_HREF__" />
    <meta name="description" content="__COLONY_META_DESCRIPTION__" />
    <meta property="og:url" content="__COLONY_OG_URL__" />
    <meta property="og:title" content="__COLONY_OG_TITLE__" />
    <meta property="og:description" content="__COLONY_OG_DESCRIPTION__" />
    <meta property="og:image" content="__COLONY_OG_IMAGE__" />
    <meta property="og:site_name" content="__COLONY_OG_SITE_NAME__" />
    <meta name="twitter:url" content="__COLONY_TWITTER_URL__" />
    <meta name="twitter:title" content="__COLONY_TWITTER_TITLE__" />
    <meta name="twitter:description" content="__COLONY_TWITTER_DESCRIPTION__" />
    <meta name="twitter:image" content="__COLONY_TWITTER_IMAGE__" />
    <script type="application/ld+json">
      {
        "name": "__COLONY_JSONLD_NAME__",
        "url": "__COLONY_JSONLD_URL__",
        "description": "__COLONY_JSONLD_DESCRIPTION__",
        "publisher": {
          "name": "__COLONY_JSONLD_PUBLISHER_NAME__",
          "url": "__COLONY_JSONLD_PUBLISHER_URL__"
        }
      }
    </script>
    <title>__COLONY_PAGE_TITLE__</title>
  </head>
  <body>
    <h1>__COLONY_SITE_TITLE__</h1>
    <a href="__COLONY_NOSCRIPT_GITHUB_URL__">GitHub</a>
  </body>
</html>`;

  it('replaces all placeholders with default config values', () => {
    const result = transformHtml(templateHtml, defaultConfig);

    expect(result).toContain('href="https://hivemoot.github.io/colony/"');
    expect(result).toContain('href="/colony/manifest.webmanifest"');
    expect(result).toContain(
      'content="Colony - The first project built entirely by autonomous agents.'
    );
    expect(result).toContain('content="Colony | Hivemoot"');
    expect(result).toContain(
      'content="https://hivemoot.github.io/colony/og-image.png"'
    );
    expect(result).toContain('content="Hivemoot"');
    expect(result).toContain('"name": "Colony"');
    expect(result).toContain('"name": "Hivemoot"');
    expect(result).toContain('"url": "https://github.com/hivemoot/colony"');
    expect(result).toContain('<title>Colony | Hivemoot</title>');
    expect(result).toContain('<h1>Colony</h1>');
    expect(result).toContain('href="https://github.com/hivemoot/colony"');
  });

  it('replaces all placeholders with custom config values', () => {
    const result = transformHtml(templateHtml, customConfig);

    expect(result).toContain('href="https://acme.github.io/swarm/"');
    expect(result).toContain('href="/swarm/manifest.webmanifest"');
    expect(result).toContain('content="Swarm - Agent dashboard for Acme Corp"');
    expect(result).toContain('content="Swarm | Acme"');
    expect(result).toContain(
      'content="https://acme.github.io/swarm/og-image.png"'
    );
    expect(result).toContain('content="Acme"');
    expect(result).toContain('"name": "Swarm"');
    expect(result).toContain('"name": "Acme"');
    expect(result).toContain('"url": "https://github.com/acme/swarm"');
    expect(result).toContain('<title>Swarm | Acme</title>');
    expect(result).toContain('<h1>Swarm</h1>');
    expect(result).toContain('href="https://github.com/acme/swarm"');
  });

  it('leaves no unreplaced placeholder tokens', () => {
    const result = transformHtml(templateHtml, defaultConfig);
    expect(result).not.toMatch(/__COLONY_[A-Z_]+__/);
  });

  it('produces absolute URLs that Vite will not base-prefix', () => {
    // Regression guard: when the plugin runs with order:'pre', Vite sees the
    // final resolved URLs. Absolute URLs (https://) must not be relative paths
    // that Vite would rewrite. This test verifies canonical, OG, and Twitter
    // URLs are absolute so Vite leaves them alone after our transform.
    const result = transformHtml(templateHtml, defaultConfig);

    // Canonical, og:image, twitter:image must be absolute URLs
    expect(result).toMatch(/href="https:\/\/hivemoot\.github\.io\/colony\/"/);
    expect(result).toMatch(
      /content="https:\/\/hivemoot\.github\.io\/colony\/og-image\.png"/
    );

    // Manifest href should be base-relative (starts with /)
    expect(result).toMatch(/href="\/colony\/manifest\.webmanifest"/);

    // No broken double-prefix patterns should exist
    expect(result).not.toContain('/colony/https://');
    expect(result).not.toContain('/colony//colony/');
  });
});

describe('buildManifest', () => {
  it('generates valid JSON with default config', () => {
    const json = buildManifest(defaultConfig);
    const manifest = JSON.parse(json);

    expect(manifest.name).toBe('Colony | Hivemoot');
    expect(manifest.short_name).toBe('Colony');
    expect(manifest.start_url).toBe('/colony/');
    expect(manifest.scope).toBe('/colony/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons[0].src).toBe('/colony/og-image.png');
  });

  it('generates manifest with custom config', () => {
    const json = buildManifest(customConfig);
    const manifest = JSON.parse(json);

    expect(manifest.name).toBe('Swarm | Acme');
    expect(manifest.short_name).toBe('Swarm');
    expect(manifest.description).toBe('Agent dashboard for Acme Corp');
    expect(manifest.start_url).toBe('/swarm/');
    expect(manifest.scope).toBe('/swarm/');
    expect(manifest.icons[0].src).toBe('/swarm/og-image.png');
  });

  it('includes required PWA fields', () => {
    const manifest = JSON.parse(buildManifest(defaultConfig));

    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('short_name');
    expect(manifest).toHaveProperty('description');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('scope');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('background_color');
    expect(manifest).toHaveProperty('theme_color');
    expect(manifest).toHaveProperty('icons');
  });
});

describe('colonyHtmlPlugin', () => {
  it('uses enforce:pre and order:pre so placeholders resolve before Vite URL rewrites', () => {
    const plugin = colonyHtmlPlugin() as Record<string, unknown>;

    expect(plugin.enforce).toBe('pre');

    const hook = plugin.transformIndexHtml as {
      order: string;
      handler: (html: string) => string;
    };
    expect(hook.order).toBe('pre');
  });

  it('configureServer middleware serves manifest JSON at basePath', () => {
    const plugin = colonyHtmlPlugin() as Record<string, unknown>;

    const middlewares: Array<
      (req: unknown, res: unknown, next: unknown) => void
    > = [];
    const mockServer = {
      middlewares: {
        use(fn: (req: unknown, res: unknown, next: unknown) => void): void {
          middlewares.push(fn);
        },
      },
    };

    (plugin.configureServer as (s: typeof mockServer) => void)(mockServer);
    expect(middlewares).toHaveLength(1);

    // Request matching manifest path should return manifest JSON
    const headers: Record<string, string> = {};
    let body = '';
    const res = {
      setHeader(k: string, v: string): void {
        headers[k] = v;
      },
      end(data: string): void {
        body = data;
      },
    };
    const next = vi.fn();

    middlewares[0]({ url: '/colony/manifest.webmanifest' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(headers['Content-Type']).toBe('application/manifest+json');
    const manifest = JSON.parse(body);
    expect(manifest.short_name).toBe('Colony');

    // Non-matching requests should pass through
    const next2 = vi.fn();
    middlewares[0]({ url: '/colony/other' }, res, next2);
    expect(next2).toHaveBeenCalled();
  });
});
