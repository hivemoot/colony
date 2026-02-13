import { describe, it, expect } from 'vitest';
import html from '../index.html?raw';
import manifestRaw from '../public/manifest.webmanifest?raw';

const COLONY_DESCRIPTION =
  'The first project built entirely by autonomous agents. Watch AI agents collaborate, propose features, vote, and build software in real-time.';

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
      /<link\s+rel="canonical"\s+href="https:\/\/hivemoot\.github\.io\/colony\/"\s*\/?>/
    );
    expect(html).toMatch(
      /<link\s+rel="manifest"\s+href="\/colony\/manifest\.webmanifest"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0"\s*\/?>/
    );
    expect(html).toMatch(
      new RegExp(
        `<meta\\s+[^>]*name="description"\\s+content="${COLONY_DESCRIPTION}"\\s*\\/?>`,
        's'
      )
    );
  });

  it('contains theme-color meta tag', () => {
    expect(html).toMatch(
      /<meta\s+name="theme-color"\s+content="#d97706"\s*\/?>/
    );
  });

  it('contains Open Graph meta tags', () => {
    expect(html).toMatch(
      /<meta\s+property="og:type"\s+content="website"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:url"\s+content="https:\/\/hivemoot\.github\.io\/colony\/"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+property="og:title"\s+content="Colony \| Hivemoot"\s*\/?>/
    );
    expect(html).toMatch(
      new RegExp(
        `<meta\\s+[^>]*property="og:description"\\s+content="${COLONY_DESCRIPTION}"\\s*\\/?>`,
        's'
      )
    );
    expect(html).toMatch(
      /<meta\s+[^>]*property="og:image"\s+content="https:\/\/hivemoot\.github\.io\/colony\/og-image\.png"\s*\/?>/s
    );
  });

  it('contains Twitter Card meta tags', () => {
    expect(html).toMatch(
      /<meta\s+name="twitter:card"\s+content="summary_large_image"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+name="twitter:title"\s+content="Colony \| Hivemoot"\s*\/?>/
    );
    expect(html).toMatch(
      new RegExp(
        `<meta\\s+[^>]*name="twitter:description"\\s+content="${COLONY_DESCRIPTION}"\\s*\\/?>`,
        's'
      )
    );
    expect(html).toMatch(
      /<meta\s+[^>]*name="twitter:image"\s+content="https:\/\/hivemoot\.github\.io\/colony\/og-image\.png"\s*\/?>/s
    );
  });

  it('contains JSON-LD with aligned description', () => {
    expect(html).toContain('"@type": "WebSite"');
    expect(html).toContain(`"description": "${COLONY_DESCRIPTION}"`);
  });
});

describe('manifest.webmanifest metadata', () => {
  it('matches canonical description copy', () => {
    const manifest = JSON.parse(manifestRaw) as {
      description?: string;
    };
    expect(manifest.description).toBe(COLONY_DESCRIPTION);
  });

  it('defines required square PWA icons', () => {
    const manifest = JSON.parse(manifestRaw) as {
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
