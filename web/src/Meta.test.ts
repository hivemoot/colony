import { describe, it, expect } from 'vitest';
import html from '../index.html?raw';
import { buildManifest } from '../scripts/vite-colony-html-plugin';

describe('index.html metadata', () => {
  it('contains basic meta tags', () => {
    expect(html).toMatch(/<meta\s+charset="UTF-8"\s*\/?>/);
    expect(html).toMatch(
      /<link\s+rel="icon"\s+href="\/colony\/favicon\.ico"\s+sizes="any"\s*\/?>/
    );
    expect(html).toMatch(
      /<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="\/colony\/apple-touch-icon\.png"\s*\/?>/
    );
    expect(html).toMatch(
      /<link\s+rel="canonical"\s+href="__COLONY_CANONICAL_URL__"\s*\/?>/
    );
    expect(html).toMatch(
      /<link\s+rel="manifest"\s+href="__COLONY_MANIFEST_HREF__"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+[^>]*name="description"\s+content="__COLONY_META_DESCRIPTION__"\s*\/?>/s
    );
  });

  it('contains theme-color meta tag', () => {
    expect(html).toMatch(
      /<meta\s+name="theme-color"\s+content="#d97706"\s*\/?>/
    );
  });

  it('contains Open Graph placeholder tokens', () => {
    expect(html).toMatch(
      /<meta\s+property="og:type"\s+content="website"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:url"\s+content="__COLONY_OG_URL__"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:title"\s+content="__COLONY_OG_TITLE__"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+[^>]*property="og:image"\s+content="__COLONY_OG_IMAGE__"\s*\/?>/s
    );
    expect(html).toMatch(
      /<meta\s+property="og:image:width"\s+content="1200"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:image:height"\s+content="630"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:site_name"\s+content="__COLONY_OG_SITE_NAME__"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:image:width"\s+content="1200"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:image:height"\s+content="630"\s*\/?>/
    );
  });

  it('contains Twitter Card placeholder tokens', () => {
    expect(html).toMatch(
      /<meta\s+name="twitter:card"\s+content="summary_large_image"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+name="twitter:title"\s+content="__COLONY_TWITTER_TITLE__"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+[^>]*name="twitter:image"\s+content="__COLONY_TWITTER_IMAGE__"\s*\/?>/s
    );
  });

  it('contains JSON-LD structured data placeholder tokens', () => {
    expect(html).toMatch(/<script\s+type="application\/ld\+json">/);
    expect(html).toContain('"name": "__COLONY_JSONLD_NAME__"');
    expect(html).toContain('"url": "__COLONY_JSONLD_URL__"');
    expect(html).toContain('"name": "__COLONY_JSONLD_PUBLISHER_NAME__"');
  });

  it('contains page title placeholder token', () => {
    expect(html).toMatch(/<title>__COLONY_PAGE_TITLE__<\/title>/);
  });

  it('contains noscript GitHub link placeholder', () => {
    expect(html).toContain('href="__COLONY_NOSCRIPT_GITHUB_URL__"');
  });
});

describe('manifest.webmanifest metadata (build-time generated)', () => {
  it('defines required square PWA icons', () => {
    const manifest = JSON.parse(
      buildManifest({
        siteTitle: 'Colony',
        orgName: 'Hivemoot',
        siteUrl: 'https://hivemoot.github.io/colony',
        siteDescription:
          'The first project built entirely by autonomous agents.',
        githubUrl: 'https://github.com/hivemoot/colony',
        basePath: '/colony/',
      })
    ) as {
      icons?: Array<{ src?: string; sizes?: string }>;
    };
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/colony/pwa-192x192.png',
          sizes: '192x192',
        }),
        expect.objectContaining({
          src: '/colony/pwa-512x512.png',
          sizes: '512x512',
        }),
      ])
    );
  });
});
