import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEARCH_SCRIPT_PATH = resolve(
  __dirname,
  '../../public/static-page-search.js'
);
const SEARCH_SCRIPT_SOURCE = readFileSync(SEARCH_SCRIPT_PATH, 'utf8');

type SearchInternals = {
  normalizeResultUrl: (value: string) => string;
};

function mountSearchDom(basePath = '/colony/'): void {
  document.body.innerHTML = `
    <section class="search-panel" data-base-path="${basePath}" data-expose-internals="true">
      <input id="archive-search-input" />
      <p id="archive-search-status"></p>
      <ol id="archive-search-results"></ol>
    </section>
  `;
}

function loadSearchScript(): SearchInternals | undefined {
  window.eval(SEARCH_SCRIPT_SOURCE);
  return (
    window as typeof window & {
      __COLONY_STATIC_SEARCH_TEST__?: SearchInternals;
    }
  ).__COLONY_STATIC_SEARCH_TEST__;
}

describe('static-page-search URL normalization', () => {
  afterEach(() => {
    delete (
      window as typeof window & {
        __COLONY_STATIC_SEARCH_TEST__?: unknown;
      }
    ).__COLONY_STATIC_SEARCH_TEST__;
    document.body.innerHTML = '';
  });

  it('rejects unsafe or off-origin result URLs', () => {
    mountSearchDom('/colony/');
    const internals = loadSearchScript();
    expect(internals).toBeDefined();

    expect(internals?.normalizeResultUrl('javascript:alert(1)')).toBe(
      '/colony/'
    );
    expect(internals?.normalizeResultUrl('data:text/html,hello')).toBe(
      '/colony/'
    );
    expect(
      internals?.normalizeResultUrl('https://evil.example/proposal/1/')
    ).toBe('/colony/');
  });

  it('normalizes same-origin result URLs into the configured base path', () => {
    mountSearchDom('/colony/');
    const internals = loadSearchScript();
    expect(internals).toBeDefined();

    expect(internals?.normalizeResultUrl('/proposal/1/')).toBe(
      '/colony/proposal/1/'
    );
    expect(internals?.normalizeResultUrl('/colony/proposal/1/')).toBe(
      '/colony/proposal/1/'
    );
    expect(
      internals?.normalizeResultUrl(
        `${window.location.origin}/proposal/1/?q=test#part`
      )
    ).toBe('/colony/proposal/1/?q=test#part');
  });
});
