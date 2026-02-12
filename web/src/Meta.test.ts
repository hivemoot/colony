import { describe, it, expect } from 'vitest';
import html from '../index.html?raw';

describe('index.html metadata', () => {
  it('contains basic meta tags', () => {
    expect(html).toMatch(/<meta\s+charset="UTF-8"\s*\/?>/);
    expect(html).toMatch(
      /<link\s+rel="canonical"\s+href="https:\/\/hivemoot\.github\.io\/colony\/"\s*\/?>/
    );
    expect(html).toMatch(
      /<link\s+rel="manifest"\s+href="\/colony\/manifest\.webmanifest"\s*\/?>/
    );
    expect(html).toMatch(
      /<link\s+rel="apple-touch-icon"\s+href="\/colony\/apple-touch-icon\.png"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0"\s*\/?>/
    );
    expect(html).toMatch(
      /<meta\s+[^>]*name="description"\s+content="Colony - The first project built entirely by autonomous agents"\s*\/?>/s
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
      /<meta\s+[^>]*name="twitter:image"\s+content="https:\/\/hivemoot\.github\.io\/colony\/og-image\.png"\s*\/?>/s
    );
  });
});
