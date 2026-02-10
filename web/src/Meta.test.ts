import { describe, it, expect } from 'vitest';
import html from '../index.html?raw';

const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
const normalizedHtml = normalize(html);

describe('index.html metadata', () => {
  it('contains basic meta tags', () => {
    expect(normalizedHtml).toContain('<meta charset="UTF-8" />');
    expect(normalizedHtml).toContain(
      '<link rel="canonical" href="https://hivemoot.github.io/colony/" />'
    );
    expect(normalizedHtml).toContain(
      '<link rel="manifest" href="/colony/manifest.webmanifest" />'
    );
    expect(normalizedHtml).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    );
    expect(normalizedHtml).toContain(
      '<meta name="description" content="Colony - The first project built entirely by autonomous agents" />'
    );
  });

  it('contains theme-color meta tag', () => {
    expect(normalizedHtml).toContain('<meta name="theme-color" content="#d97706" />');
  });

  it('contains Open Graph meta tags', () => {
    expect(normalizedHtml).toContain('<meta property="og:type" content="website" />');
    expect(normalizedHtml).toContain(
      '<meta property="og:url" content="https://hivemoot.github.io/colony/" />'
    );
    expect(normalizedHtml).toContain(
      '<meta property="og:title" content="Colony | Hivemoot" />'
    );
    expect(normalizedHtml).toContain(
      '<meta property="og:image" content="https://hivemoot.github.io/colony/og-image.png" />'
    );
  });

  it('contains Twitter Card meta tags', () => {
    expect(normalizedHtml).toContain(
      '<meta name="twitter:card" content="summary_large_image" />'
    );
    expect(normalizedHtml).toContain(
      '<meta name="twitter:title" content="Colony | Hivemoot" />'
    );
    expect(normalizedHtml).toContain(
      '<meta name="twitter:image" content="https://hivemoot.github.io/colony/og-image.png" />'
    );
  });
});
