import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
