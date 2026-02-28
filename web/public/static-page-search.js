(() => {
  const panel = document.querySelector('.search-panel[data-base-path]');
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  const input = document.getElementById('archive-search-input');
  const status = document.getElementById('archive-search-status');
  const results = document.getElementById('archive-search-results');

  if (
    !(input instanceof HTMLInputElement) ||
    !(status instanceof HTMLElement) ||
    !(results instanceof HTMLElement)
  ) {
    return;
  }

  function normalizeBasePath(rawValue) {
    const raw = (rawValue || '/').trim();
    if (!raw) {
      return '/';
    }

    let normalized = raw;
    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }
    if (!normalized.endsWith('/')) {
      normalized = `${normalized}/`;
    }
    return normalized;
  }

  function toPlainText(value) {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const basePath = normalizeBasePath(panel.dataset.basePath);
  const pagefindScriptUrl = `${basePath}_pagefind/pagefind.js`;

  let pagefindModulePromise;
  let activeSearch = 0;
  let debounceTimer = 0;

  function setStatus(message) {
    status.textContent = message;
  }

  function clearResults() {
    results.innerHTML = '';
  }

  function normalizeResultUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) {
      return basePath;
    }

    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
      return value;
    }

    if (value.startsWith(basePath)) {
      return value;
    }

    return `${basePath}${value.replace(/^\/+/, '')}`;
  }

  function resolvePagefindApi(moduleValue) {
    if (moduleValue && typeof moduleValue.search === 'function') {
      return moduleValue;
    }

    if (
      moduleValue &&
      moduleValue.default &&
      typeof moduleValue.default.search === 'function'
    ) {
      return moduleValue.default;
    }

    throw new Error('Pagefind search API not found in module export.');
  }

  function renderResults(entries) {
    clearResults();

    const fragment = document.createDocumentFragment();

    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = 'search-result';

      const link = document.createElement('a');
      link.className = 'search-result-link';
      link.href = entry.url;
      link.textContent = entry.title;
      item.appendChild(link);

      if (entry.metaLine) {
        const meta = document.createElement('p');
        meta.className = 'search-result-meta';
        meta.textContent = entry.metaLine;
        item.appendChild(meta);
      }

      if (entry.snippet) {
        const snippet = document.createElement('p');
        snippet.className = 'search-result-snippet';
        snippet.textContent = entry.snippet;
        item.appendChild(snippet);
      }

      fragment.appendChild(item);
    }

    results.appendChild(fragment);
  }

  async function loadPagefind() {
    if (!pagefindModulePromise) {
      pagefindModulePromise = import(pagefindScriptUrl);
    }

    const loadedModule = await pagefindModulePromise;
    return resolvePagefindApi(loadedModule);
  }

  async function runSearch(query) {
    const searchId = ++activeSearch;

    setStatus('Searching...');

    try {
      const pagefind = await loadPagefind();
      const searchResponse = await pagefind.search(query);
      const resultItems = await Promise.all(
        (searchResponse.results || []).slice(0, 8).map(async (result) => {
          const data = await result.data();
          const meta = data.meta || {};
          const title =
            toPlainText(meta.title) ||
            toPlainText(data.excerpt) ||
            normalizeResultUrl(data.url);

          const metaParts = [];
          if (meta.phase) {
            metaParts.push(toPlainText(meta.phase));
          }
          if (meta.author) {
            metaParts.push(`by ${toPlainText(meta.author)}`);
          }
          if (meta.agent && !meta.author) {
            metaParts.push(`agent ${toPlainText(meta.agent)}`);
          }

          return {
            url: normalizeResultUrl(data.url),
            title,
            metaLine: metaParts.join(' | '),
            snippet: toPlainText(data.excerpt || data.content).slice(0, 180),
          };
        })
      );

      if (searchId !== activeSearch) {
        return;
      }

      if (resultItems.length === 0) {
        clearResults();
        setStatus('No results found.');
        return;
      }

      renderResults(resultItems);
      setStatus(`Showing ${resultItems.length} result${resultItems.length === 1 ? '' : 's'}.`);
    } catch (_error) {
      if (searchId !== activeSearch) {
        return;
      }
      clearResults();
      setStatus('Search is temporarily unavailable.');
    }
  }

  input.addEventListener('focus', () => {
    void loadPagefind().catch(() => {
      if (!status.textContent) {
        setStatus('Search is temporarily unavailable.');
      }
    });
  });

  input.addEventListener('input', () => {
    const query = input.value.trim();

    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    if (!query) {
      clearResults();
      setStatus('');
      return;
    }

    if (query.length < 2) {
      clearResults();
      setStatus('Type at least 2 characters to search.');
      return;
    }

    debounceTimer = window.setTimeout(() => {
      void runSearch(query);
    }, 180);
  });
})();
