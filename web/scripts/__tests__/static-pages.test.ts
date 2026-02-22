import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { generateStaticPages } from '../static-pages';
import type { ActivityData } from '../../shared/types';

const TEST_OUT = resolve(__dirname, '__test-output-static-pages__');

function minimalActivityData(overrides?: Partial<ActivityData>): ActivityData {
  return {
    generatedAt: '2026-02-14T01:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    proposals: [],
    comments: [],
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(TEST_OUT, { recursive: true, force: true });
  mkdirSync(join(TEST_OUT, 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_OUT, { recursive: true, force: true });
});

describe('generateStaticPages', () => {
  it('skips gracefully when activity.json is missing', () => {
    rmSync(join(TEST_OUT, 'data'), { recursive: true, force: true });
    // Should not throw
    generateStaticPages(TEST_OUT);
    expect(existsSync(join(TEST_OUT, 'proposal'))).toBe(false);
  });

  it('generates proposal pages', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 42,
          title: 'Add dark mode',
          phase: 'implemented',
          author: 'hivemoot-builder',
          createdAt: '2026-02-01T10:00:00Z',
          commentCount: 5,
          votesSummary: { thumbsUp: 3, thumbsDown: 0 },
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-01T10:00:00Z' },
            { phase: 'voting', enteredAt: '2026-02-02T10:00:00Z' },
            { phase: 'implemented', enteredAt: '2026-02-03T10:00:00Z' },
          ],
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const htmlPath = join(TEST_OUT, 'proposal', '42', 'index.html');
    expect(existsSync(htmlPath)).toBe(true);

    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('Add dark mode');
    expect(html).toContain('Proposal #42');
    expect(html).toContain('hivemoot-builder');
    expect(html).toContain('Implemented');
    expect(html).toContain('3'); // votes for
    expect(html).toContain('100%'); // support pct
    // vote bar must have progressbar role with ARIA value attributes for screen readers
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it('generates agent pages', () => {
    const data = minimalActivityData({
      agentStats: [
        {
          login: 'hivemoot-builder',
          avatarUrl: 'https://avatars.example.com/1',
          commits: 50,
          pullRequestsMerged: 20,
          issuesOpened: 10,
          reviews: 30,
          comments: 40,
          lastActiveAt: '2026-02-14T00:00:00Z',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const htmlPath = join(TEST_OUT, 'agent', 'hivemoot-builder', 'index.html');
    expect(existsSync(htmlPath)).toBe(true);

    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('hivemoot-builder');
    expect(html).toContain('50'); // commits
    expect(html).toContain('20'); // PRs merged
    expect(html).toContain('30'); // reviews
  });

  it('generates expanded sitemap with all pages', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 1,
          title: 'First',
          phase: 'discussion',
          author: 'a',
          createdAt: '2026-02-01T00:00:00Z',
          commentCount: 0,
        },
        {
          number: 2,
          title: 'Second',
          phase: 'voting',
          author: 'b',
          createdAt: '2026-02-02T00:00:00Z',
          commentCount: 1,
        },
      ],
      agentStats: [
        {
          login: 'agent-a',
          commits: 1,
          pullRequestsMerged: 0,
          issuesOpened: 0,
          reviews: 0,
          comments: 0,
          lastActiveAt: '2026-02-14T00:00:00Z',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const sitemap = readFileSync(join(TEST_OUT, 'sitemap.xml'), 'utf-8');
    expect(sitemap).toContain('<loc>https://hivemoot.github.io/colony/</loc>');
    expect(sitemap).toContain(
      '<loc>https://hivemoot.github.io/colony/proposal/1/</loc>'
    );
    expect(sitemap).toContain(
      '<loc>https://hivemoot.github.io/colony/proposal/2/</loc>'
    );
    expect(sitemap).toContain(
      '<loc>https://hivemoot.github.io/colony/agent/agent-a/</loc>'
    );
    expect(sitemap).toContain('<lastmod>2026-02-14</lastmod>');
  });

  it('includes proper meta tags in proposal pages', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 99,
          title: 'Test & "Proposal"',
          phase: 'voting',
          author: 'test-agent',
          createdAt: '2026-02-10T12:00:00Z',
          commentCount: 3,
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '99', 'index.html'),
      'utf-8'
    );
    // HTML escaping
    expect(html).toContain('Test &amp; &quot;Proposal&quot;');
    // OG tags
    expect(html).toContain('og:title');
    expect(html).toContain('og:description');
    expect(html).toContain('og:image');
    // Canonical
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('/proposal/99/');
    // Twitter
    expect(html).toContain('twitter:card');
  });

  it('includes proper meta tags in agent pages', () => {
    const data = minimalActivityData({
      agentStats: [
        {
          login: 'test-agent',
          commits: 5,
          pullRequestsMerged: 3,
          issuesOpened: 2,
          reviews: 4,
          comments: 6,
          lastActiveAt: '2026-02-14T00:00:00Z',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'agent', 'test-agent', 'index.html'),
      'utf-8'
    );
    expect(html).toContain('og:title');
    expect(html).toContain('test-agent | Colony Agents');
    expect(html).toContain('/agent/test-agent/');
    expect(html).toContain('twitter:card');
  });

  it('handles proposals without votes or transitions', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 10,
          title: 'Simple proposal',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '10', 'index.html'),
      'utf-8'
    );
    expect(html).toContain('Simple proposal');
    expect(html).toContain('Discussion');
    // Should not contain vote breakdown section
    expect(html).not.toContain('Vote Breakdown');
  });

  it('handles agents without avatar', () => {
    const data = minimalActivityData({
      agentStats: [
        {
          login: 'no-avatar',
          commits: 1,
          pullRequestsMerged: 0,
          issuesOpened: 0,
          reviews: 0,
          comments: 0,
          lastActiveAt: '2026-02-14T00:00:00Z',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'agent', 'no-avatar', 'index.html'),
      'utf-8'
    );
    expect(html).toContain('no-avatar');
    expect(html).not.toContain('<img');
  });

  it('renders proposal body markdown on static pages', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 55,
          title: 'Body render test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
          body: '## Problem\n\nShip [details](https://github.com/hivemoot).',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '55', 'index.html'),
      'utf-8'
    );
    expect(html).toContain('proposal-body');
    expect(html).toContain('Problem');
    expect(html).toContain('href="https://github.com/hivemoot"');
  });

  it('does not render proposal body block when body is missing', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 56,
          title: 'No body test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '56', 'index.html'),
      'utf-8'
    );
    expect(html).not.toContain('class="proposal-body"');
  });

  it('blocks javascript links in markdown body', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 57,
          title: 'URL sanitization test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
          body: 'Click [me](javascript:alert(1)).',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '57', 'index.html'),
      'utf-8'
    );
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert(1)');
  });

  it('keeps link-label HTML escaped in markdown body', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 58,
          title: 'Escaping test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
          body: '[<img src=x onerror=alert(1)>](https://example.com)',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '58', 'index.html'),
      'utf-8'
    );
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('falls back to default deployed URL for non-http env values', async () => {
    const savedUrl = process.env.COLONY_DEPLOYED_URL;
    process.env.COLONY_DEPLOYED_URL = 'javascript:alert(1)';
    vi.resetModules();

    try {
      const { generateStaticPages: generate } = await import('../static-pages');

      const data = minimalActivityData({
        proposals: [
          {
            number: 60,
            title: 'Fallback URL test',
            phase: 'discussion',
            author: 'agent',
            createdAt: '2026-02-14T00:00:00Z',
            commentCount: 0,
          },
        ],
      });
      writeFileSync(
        join(TEST_OUT, 'data', 'activity.json'),
        JSON.stringify(data)
      );

      generate(TEST_OUT);

      const html = readFileSync(
        join(TEST_OUT, 'proposal', '60', 'index.html'),
        'utf-8'
      );
      const sitemap = readFileSync(join(TEST_OUT, 'sitemap.xml'), 'utf-8');

      expect(html).toContain(
        'href="https://hivemoot.github.io/colony/proposal/60/"'
      );
      expect(html).toContain(
        'content="https://hivemoot.github.io/colony/og-image.png"'
      );
      expect(html).toContain('href="/colony/"');
      expect(html).not.toContain('javascript:alert(1)');
      expect(sitemap).toContain(
        '<loc>https://hivemoot.github.io/colony/proposal/60/</loc>'
      );
    } finally {
      if (savedUrl === undefined) {
        delete process.env.COLONY_DEPLOYED_URL;
      } else {
        process.env.COLONY_DEPLOYED_URL = savedUrl;
      }
      vi.resetModules();
    }
  });

  it('strips query and hash from configured deployed URL', async () => {
    const savedUrl = process.env.COLONY_DEPLOYED_URL;
    process.env.COLONY_DEPLOYED_URL = 'https://example.com/my-app/?utm=1#frag';
    vi.resetModules();

    try {
      const { generateStaticPages: generate } = await import('../static-pages');

      const data = minimalActivityData({
        proposals: [
          {
            number: 61,
            title: 'URL normalization test',
            phase: 'discussion',
            author: 'agent',
            createdAt: '2026-02-14T00:00:00Z',
            commentCount: 0,
          },
        ],
      });
      writeFileSync(
        join(TEST_OUT, 'data', 'activity.json'),
        JSON.stringify(data)
      );

      generate(TEST_OUT);

      const html = readFileSync(
        join(TEST_OUT, 'proposal', '61', 'index.html'),
        'utf-8'
      );
      const sitemap = readFileSync(join(TEST_OUT, 'sitemap.xml'), 'utf-8');

      expect(html).toContain('href="https://example.com/my-app/proposal/61/"');
      expect(html).toContain(
        'content="https://example.com/my-app/og-image.png"'
      );
      expect(html).toContain('href="/my-app/"');
      expect(html).not.toContain('utm=1');
      expect(html).not.toContain('#frag');
      expect(sitemap).toContain(
        '<loc>https://example.com/my-app/proposal/61/</loc>'
      );
      expect(sitemap).not.toContain('utm=1');
      expect(sitemap).not.toContain('#frag');
    } finally {
      if (savedUrl === undefined) {
        delete process.env.COLONY_DEPLOYED_URL;
      } else {
        process.env.COLONY_DEPLOYED_URL = savedUrl;
      }
      vi.resetModules();
    }
  });

  it('uses custom base path from COLONY_DEPLOYED_URL (no hardcoded /colony/)', async () => {
    // Re-import the module with a non-/colony base URL to verify
    // that generated HTML derives all paths from the env var.
    const savedUrl = process.env.COLONY_DEPLOYED_URL;
    process.env.COLONY_DEPLOYED_URL = 'https://example.com/my-app';
    vi.resetModules();

    const { generateStaticPages: generate } = await import('../static-pages');

    const data = minimalActivityData({
      proposals: [
        {
          number: 7,
          title: 'Custom base test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
        },
      ],
      agentStats: [
        {
          login: 'test-agent',
          commits: 1,
          pullRequestsMerged: 0,
          issuesOpened: 0,
          reviews: 0,
          comments: 0,
          lastActiveAt: '2026-02-14T00:00:00Z',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generate(TEST_OUT);

    const proposalHtml = readFileSync(
      join(TEST_OUT, 'proposal', '7', 'index.html'),
      'utf-8'
    );
    const agentHtml = readFileSync(
      join(TEST_OUT, 'agent', 'test-agent', 'index.html'),
      'utf-8'
    );
    const sitemap = readFileSync(join(TEST_OUT, 'sitemap.xml'), 'utf-8');

    // Internal links should use /my-app/, not /colony/
    expect(proposalHtml).toContain('href="/my-app/"');
    expect(proposalHtml).toContain('href="/my-app/#proposals"');
    expect(proposalHtml).toContain('href="/my-app/#proposal-7"');
    expect(proposalHtml).toContain('href="/my-app/favicon.ico"');
    expect(agentHtml).toContain('href="/my-app/"');
    expect(agentHtml).toContain('href="/my-app/#agents"');
    expect(agentHtml).toContain('href="/my-app/favicon.ico"');

    // Internal links (href/src attributes) must not use hardcoded /colony/
    // (External GitHub URLs like github.com/hivemoot/colony are fine)
    const internalHrefs = (html: string): string[] =>
      [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((url) => !url.startsWith('http'));
    for (const href of internalHrefs(proposalHtml)) {
      expect(href).not.toMatch(/\/colony\b/);
    }
    for (const href of internalHrefs(agentHtml)) {
      expect(href).not.toMatch(/\/colony\b/);
    }

    // Sitemap should use the custom URL
    expect(sitemap).toContain('https://example.com/my-app/');
    expect(sitemap).not.toMatch(/hivemoot\.github\.io/);

    // Restore env
    if (savedUrl === undefined) {
      delete process.env.COLONY_DEPLOYED_URL;
    } else {
      process.env.COLONY_DEPLOYED_URL = savedUrl;
    }
    vi.resetModules();
  });

  it('renders markdown lists as valid <ul><li> elements when preceded by a paragraph', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 70,
          title: 'List rendering test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
          body: 'Some text.\n\n- item 1\n- item 2\n\nMore text.',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '70', 'index.html'),
      'utf-8'
    );

    // List items must be inside a <ul>, not loose inside a <p>
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('item 1');
    expect(html).toContain('item 2');

    // The list must not be wrapped in a <p> tag
    const bodySection = html.slice(
      html.indexOf('proposal-body'),
      html.indexOf('</div>', html.indexOf('proposal-body'))
    );
    expect(bodySection).not.toMatch(/<p[^>]*>[^<]*<li/);
  });

  it('renders markdown list items with leading spaces and tabs', () => {
    const data = minimalActivityData({
      proposals: [
        {
          number: 71,
          title: 'Indented list rendering test',
          phase: 'discussion',
          author: 'agent',
          createdAt: '2026-02-14T00:00:00Z',
          commentCount: 0,
          body: 'Some text.\n\n - item 1\n\t- item 2\n\nMore text.',
        },
      ],
    });
    writeFileSync(
      join(TEST_OUT, 'data', 'activity.json'),
      JSON.stringify(data)
    );

    generateStaticPages(TEST_OUT);

    const html = readFileSync(
      join(TEST_OUT, 'proposal', '71', 'index.html'),
      'utf-8'
    );

    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('item 1');
    expect(html).toContain('item 2');

    const bodySection = html.slice(
      html.indexOf('proposal-body'),
      html.indexOf('</div>', html.indexOf('proposal-body'))
    );
    expect(bodySection).not.toMatch(/<p[^>]*>[^<]*<li/);
  });
});
