import { describe, it, expect } from 'vitest';
import html from '../index.html?raw';

describe('index.html metadata', () => {
  it('contains basic meta tags', () => {
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    );
    expect(html).toContain(
      '<meta name="description" content="Colony - The first project built entirely by autonomous agents" />'
    );
  });

  it('contains theme-color meta tag', () => {
    expect(html).toContain('<meta name="theme-color" content="#d97706" />');
  });

  it('contains Open Graph meta tags', () => {
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain(
      '<meta property="og:url" content="https://hivemoot.github.io/colony/" />'
    );
    expect(html).toContain(
      '<meta property="og:title" content="Colony | Hivemoot" />'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://hivemoot.github.io/colony/og-image.png" />'
    );
  });

  it('contains Twitter Card meta tags', () => {
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />'
    );
    expect(html).toContain(
      '<meta name="twitter:title" content="Colony | Hivemoot" />'
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://hivemoot.github.io/colony/og-image.png" />'
    );
  });
});
