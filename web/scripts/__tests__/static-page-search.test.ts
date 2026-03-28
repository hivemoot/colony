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
  getActiveSearch: () => number;
  handleSearchInput: () => void;
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

describe('static-page-search stale-results protection', () => {
  afterEach(() => {
    delete (
      window as typeof window & {
        __COLONY_STATIC_SEARCH_TEST__?: unknown;
      }
    ).__COLONY_STATIC_SEARCH_TEST__;
    document.body.innerHTML = '';
  });

  function mountAndLoad(basePath = '/colony/'): SearchInternals {
    mountSearchDom(basePath);
    const internals = loadSearchScript();
    expect(internals).toBeDefined();
    return internals!;
  }

  it('increments activeSearch when input is cleared, invalidating in-flight searches', () => {
    const internals = mountAndLoad();
    const input = document.getElementById(
      'archive-search-input'
    ) as HTMLInputElement;

    const before = internals.getActiveSearch();

    // Simulate a real query being typed.
    input.value = 'governance';
    internals.handleSearchInput();
    expect(internals.getActiveSearch()).toBeGreaterThan(before);

    const afterQuery = internals.getActiveSearch();

    // Clear the input — this must also advance activeSearch so any in-flight
    // search from the previous query cannot render stale results.
    input.value = '';
    internals.handleSearchInput();
    expect(internals.getActiveSearch()).toBeGreaterThan(afterQuery);
  });

  it('increments activeSearch when query drops below the 2-character minimum', () => {
    const internals = mountAndLoad();
    const input = document.getElementById(
      'archive-search-input'
    ) as HTMLInputElement;

    // Start a real query.
    input.value = 'gov';
    internals.handleSearchInput();
    const afterQuery = internals.getActiveSearch();

    // Delete back to a single character — stale results must be blocked.
    input.value = 'g';
    internals.handleSearchInput();
    expect(internals.getActiveSearch()).toBeGreaterThan(afterQuery);
  });

  it('clears the results and status elements on empty input', () => {
    const internals = mountAndLoad();
    const input = document.getElementById(
      'archive-search-input'
    ) as HTMLInputElement;
    const status = document.getElementById('archive-search-status')!;
    const results = document.getElementById('archive-search-results')!;

    // Seed visible state that a stale search might have left behind.
    results.innerHTML = '<li>stale result</li>';
    status.textContent = 'Showing 1 result.';

    input.value = '';
    internals.handleSearchInput();

    expect(results.innerHTML).toBe('');
    expect(status.textContent).toBe('');
  });

  it('clears results and shows minimum-length hint when query is too short', () => {
    const internals = mountAndLoad();
    const input = document.getElementById(
      'archive-search-input'
    ) as HTMLInputElement;
    const status = document.getElementById('archive-search-status')!;
    const results = document.getElementById('archive-search-results')!;

    results.innerHTML = '<li>stale result</li>';

    input.value = 'x';
    internals.handleSearchInput();

    expect(results.innerHTML).toBe('');
    expect(status.textContent).toBe('Type at least 2 characters to search.');
  });
});
