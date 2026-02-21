import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeUrl, renderMarkdown } from './markdown';

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('sanitizeUrl', () => {
  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe(
      'https://example.com/path'
    );
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  });

  it('allows mailto URLs', () => {
    expect(sanitizeUrl('mailto:test@example.com')).toBe(
      'mailto:test@example.com'
    );
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('#');
  });

  it('blocks ftp: protocol', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('#');
  });

  it('returns # for malformed URL', () => {
    expect(sanitizeUrl('not a url')).toBe('#');
  });

  it('returns # for relative path', () => {
    expect(sanitizeUrl('/relative/path')).toBe('#');
  });

  it('blocks credential-bearing URLs with username and password', () => {
    expect(sanitizeUrl('https://user:pass@example.com')).toBe('#');
  });

  it('blocks credential-bearing URLs with username only', () => {
    expect(sanitizeUrl('https://token@example.com')).toBe('#');
  });
});

describe('renderMarkdown', () => {
  it('renders a paragraph', () => {
    expect(renderMarkdown('Hello world')).toBe(
      '<p class="md-p">Hello world</p>'
    );
  });

  it('renders bold text', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
  });

  it('renders bold italic text', () => {
    expect(renderMarkdown('***both***')).toContain(
      '<strong><em>both</em></strong>'
    );
  });

  it('renders inline code', () => {
    const html = renderMarkdown('use `console.log`');
    expect(html).toContain('<code class="md-code">console.log</code>');
  });

  it('renders headings', () => {
    expect(renderMarkdown('# H1')).toContain('<h1 class="md-h1">H1</h1>');
    expect(renderMarkdown('## H2')).toContain('<h2 class="md-h2">H2</h2>');
    expect(renderMarkdown('### H3')).toContain('<h3 class="md-h3">H3</h3>');
  });

  it('renders unordered list items wrapped in ul', () => {
    const html = renderMarkdown('- item one\n- item two');
    expect(html).toContain('<ul class="md-ul">');
    expect(html).toContain('<li class="md-li">item one</li>');
  });

  it('renders fenced code blocks', () => {
    const html = renderMarkdown('```\nconst x = 1;\n```');
    expect(html).toContain('<pre class="md-pre">');
    expect(html).toContain('<code>');
  });

  it('renders safe links', () => {
    const html = renderMarkdown('[Colony](https://example.com)');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('class="md-link"');
    expect(html).toContain('target="_blank"');
  });

  it('sanitizes unsafe link protocols', () => {
    const html = renderMarkdown('[bad](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });

  it('escapes HTML in text content', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles empty body gracefully', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('handles single-newline soft wraps within a paragraph', () => {
    const html = renderMarkdown('line one\nline two');
    // Single newline doesn't split into two paragraphs
    expect(html).toContain('line one');
    expect(html).toContain('line two');
    // Only one paragraph wrapper
    const matches = [...html.matchAll(/<p /g)];
    expect(matches.length).toBe(1);
  });
});
