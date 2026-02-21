/**
 * Shared markdown rendering utilities for the Colony SPA.
 *
 * Provides HTML sanitization helpers and a minimal markdown-to-HTML renderer
 * suitable for rendering proposal bodies in the dashboard. The output uses
 * scoped CSS class names (via the `.proposal-body` wrapper) for theming.
 *
 * Security model:
 * - `escapeHtml` escapes all raw text before any pattern substitution.
 * - `sanitizeUrl` restricts link href values to http:, https:, and mailto:,
 *   and rejects credential-bearing URLs (user:pass@host).
 * - The rendered HTML is safe for `dangerouslySetInnerHTML` when the input
 *   flows through this pipeline (build-time data from generate-data.ts).
 */

/**
 * Escape HTML special characters to prevent XSS. Must be applied to raw
 * user-controlled text before injecting into HTML context.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Restrict a URL to safe protocols. Returns '#' for javascript:, data:,
 * relative paths, credential-bearing URLs, or any unparseable value.
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return '#';
    }
    if (parsed.username || parsed.password) {
      return '#';
    }
    return parsed.href;
  } catch {
    return '#';
  }
}

/**
 * Convert a subset of markdown to HTML. Handles: fenced code blocks,
 * headings (h1–h3), bold, italic, bold+italic, inline code, links, and
 * unordered list items. Paragraphs are derived from double-newline splitting.
 *
 * Output uses CSS class names scoped to `.proposal-body` for dark/light
 * theme support. Safe for `dangerouslySetInnerHTML` when the input has been
 * fetched from the GitHub API and stored in activity.json at build time.
 */
export function renderMarkdown(md: string): string {
  return escapeHtml(md)
    .replace(/```([\s\S]*?)```/g, '<pre class="md-pre"><code>$1</code></pre>')
    .replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, rawUrl) => {
      const safeUrl = sanitizeUrl(rawUrl);
      // Link label text is already escaped by the top-level escapeHtml call.
      return `<a href="${escapeHtml(safeUrl)}" class="md-link" target="_blank" rel="noopener noreferrer">${text}</a>`;
    })
    .replace(/^\s*- (.+$)/gim, '<li class="md-li">$1</li>')
    .split('\n\n')
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<li')) {
        return `<ul class="md-ul">${trimmed}</ul>`;
      }
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<ul')
      ) {
        return trimmed;
      }
      return `<p class="md-p">${trimmed}</p>`;
    })
    .join('');
}
