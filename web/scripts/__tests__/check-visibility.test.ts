import { describe, expect, it } from 'vitest';
import {
  buildRepositoryApiUrl,
  hasAtomAutodiscoveryLink,
  hasTwitterImageAltText,
  isValidOpenGraphImageType,
  normalizeHttpsUrl,
  resolveDeployedPageUrl,
  resolveRepositoryHomepage,
  resolveVisibilityRepository,
  resolveVisibilityToken,
  resolveVisibilityUserAgent,
  type CheckResult,
  type VisibilityReport,
} from '../check-visibility';

describe('resolveVisibilityUserAgent', () => {
  it('returns the default user agent when override is missing', () => {
    expect(resolveVisibilityUserAgent({})).toBe('colony-visibility-check');
  });

  it('uses VISIBILITY_USER_AGENT when configured', () => {
    expect(
      resolveVisibilityUserAgent({
        VISIBILITY_USER_AGENT: 'hivemoot-polisher-visibility-check',
      })
    ).toBe('hivemoot-polisher-visibility-check');
  });

  it('falls back to default when VISIBILITY_USER_AGENT is blank', () => {
    expect(
      resolveVisibilityUserAgent({
        VISIBILITY_USER_AGENT: '   ',
      })
    ).toBe('colony-visibility-check');
  });
});

describe('resolveVisibilityToken', () => {
  it('returns GITHUB_TOKEN when it is the only configured token', () => {
    expect(
      resolveVisibilityToken({
        GITHUB_TOKEN: 'github-token',
      })
    ).toBe('github-token');
  });

  it('falls back to GH_TOKEN when GITHUB_TOKEN is missing', () => {
    expect(
      resolveVisibilityToken({
        GH_TOKEN: 'gh-token',
      })
    ).toBe('gh-token');
  });

  it('prefers GITHUB_TOKEN when both tokens are set', () => {
    expect(
      resolveVisibilityToken({
        GITHUB_TOKEN: 'github-token',
        GH_TOKEN: 'gh-token',
      })
    ).toBe('github-token');
  });

  it('treats blank GITHUB_TOKEN as absent and falls back to GH_TOKEN', () => {
    expect(
      resolveVisibilityToken({
        GITHUB_TOKEN: '',
        GH_TOKEN: 'gh-token',
      })
    ).toBe('gh-token');
  });

  it('returns undefined when neither token is configured', () => {
    expect(resolveVisibilityToken({})).toBeUndefined();
  });
});

describe('resolveRepositoryHomepage', () => {
  it('accepts custom-domain homepage URLs', () => {
    expect(
      resolveRepositoryHomepage('https://colony.example.org/dashboard')
    ).toBe('https://colony.example.org/dashboard');
  });

  it('normalizes trailing slashes', () => {
    expect(resolveRepositoryHomepage('https://colony.example.org/')).toBe(
      'https://colony.example.org'
    );
  });

  it('drops query and hash fragments', () => {
    expect(
      resolveRepositoryHomepage('https://colony.example.org/path/?utm=foo#bar')
    ).toBe('https://colony.example.org/path');
  });

  it('rejects invalid or unsupported homepage URLs', () => {
    expect(resolveRepositoryHomepage('http://colony.example.org')).toBe('');
    expect(resolveRepositoryHomepage('ftp://colony.example.org')).toBe('');
    expect(resolveRepositoryHomepage('https://localhost:4173')).toBe('');
    expect(resolveRepositoryHomepage('https://dev.localhost/dashboard')).toBe(
      ''
    );
    expect(resolveRepositoryHomepage('https://127.0.0.1:8443')).toBe('');
    expect(resolveRepositoryHomepage('https://[::1]/')).toBe('');
    expect(resolveRepositoryHomepage('https://user@colony.example.org')).toBe(
      ''
    );
    expect(
      resolveRepositoryHomepage('https://user:pass@colony.example.org')
    ).toBe('');
    expect(resolveRepositoryHomepage('not-a-url')).toBe('');
    expect(resolveRepositoryHomepage('   ')).toBe('');
  });
});

describe('normalizeHttpsUrl', () => {
  it('accepts absolute https URLs', () => {
    expect(normalizeHttpsUrl('https://colony.example.org/og-image.png')).toBe(
      'https://colony.example.org/og-image.png'
    );
  });

  it('resolves relative paths against a base URL', () => {
    expect(
      normalizeHttpsUrl('icons/icon-192.png', 'https://colony.example.org/app/')
    ).toBe('https://colony.example.org/app/icons/icon-192.png');
  });

  it('rejects non-https, data, and invalid URLs', () => {
    expect(normalizeHttpsUrl('http://colony.example.org/image.png')).toBe('');
    expect(normalizeHttpsUrl('data:image/png;base64,abcd')).toBe('');
    expect(normalizeHttpsUrl('not-a-url')).toBe('');
  });

  it('rejects credential-bearing URLs', () => {
    expect(
      normalizeHttpsUrl('https://user:pass@colony.example.org/image.png')
    ).toBe('');
    expect(
      normalizeHttpsUrl('/icon.png', 'https://user@colony.example.org/')
    ).toBe('');
  });
});

describe('resolveVisibilityRepository', () => {
  it('returns the default repository when no env vars are set', () => {
    expect(resolveVisibilityRepository({})).toEqual({
      owner: 'hivemoot',
      repo: 'colony',
    });
  });

  it('uses COLONY_REPOSITORY when configured', () => {
    expect(
      resolveVisibilityRepository({
        COLONY_REPOSITORY: 'example-org/example-colony',
      })
    ).toEqual({
      owner: 'example-org',
      repo: 'example-colony',
    });
  });

  it('rejects malformed repository values', () => {
    expect(() =>
      resolveVisibilityRepository({
        COLONY_REPOSITORY: 'example-org/example-colony/extra',
      })
    ).toThrow(/Expected format "owner\/repo"/);
  });
});

describe('buildRepositoryApiUrl', () => {
  it('builds the GitHub API URL from owner/repo', () => {
    expect(
      buildRepositoryApiUrl({
        owner: 'example-org',
        repo: 'example-colony',
      })
    ).toBe('https://api.github.com/repos/example-org/example-colony');
  });
});

describe('resolveDeployedPageUrl', () => {
  it('resolves hub URLs from a root deployment base', () => {
    expect(resolveDeployedPageUrl('https://example.org', 'agents/')).toBe(
      'https://example.org/agents/'
    );
    expect(resolveDeployedPageUrl('https://example.org/', '/proposals/')).toBe(
      'https://example.org/proposals/'
    );
  });

  it('preserves nested base paths used by template deployments', () => {
    expect(
      resolveDeployedPageUrl('https://example.org/my-colony', 'agents/')
    ).toBe('https://example.org/my-colony/agents/');
    expect(
      resolveDeployedPageUrl('https://example.org/my-colony/', '/proposals/')
    ).toBe('https://example.org/my-colony/proposals/');
  });
});

describe('isValidOpenGraphImageType', () => {
  it('accepts image MIME types', () => {
    expect(isValidOpenGraphImageType('image/png')).toBe(true);
    expect(isValidOpenGraphImageType(' image/webp ')).toBe(true);
  });

  it('rejects missing or non-image MIME types', () => {
    expect(isValidOpenGraphImageType('')).toBe(false);
    expect(isValidOpenGraphImageType('text/html')).toBe(false);
  });
});

describe('hasTwitterImageAltText', () => {
  it('accepts non-empty alt text', () => {
    expect(hasTwitterImageAltText('Colony dashboard preview')).toBe(true);
  });

  it('rejects blank alt text', () => {
    expect(hasTwitterImageAltText('   ')).toBe(false);
  });
});

describe('hasAtomAutodiscoveryLink', () => {
  it('detects a well-formed Atom autodiscovery link tag', () => {
    const html = `<head>
      <link rel="alternate" type="application/atom+xml" href="/feed.xml" title="Colony Proposals">
    </head>`;
    expect(hasAtomAutodiscoveryLink(html)).toBe(true);
  });

  it('returns false when the autodiscovery link is absent', () => {
    const html = `<head>
      <link rel="stylesheet" href="/style.css">
    </head>`;
    expect(hasAtomAutodiscoveryLink(html)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(hasAtomAutodiscoveryLink('')).toBe(false);
  });

  it('handles attribute order variations', () => {
    const html = `<link type="application/atom+xml" rel="alternate" href="/feed.xml">`;
    expect(hasAtomAutodiscoveryLink(html)).toBe(true);
  });

  it('is case-insensitive for the type attribute', () => {
    const html = `<link rel="alternate" type="Application/Atom+XML" href="/feed.xml">`;
    expect(hasAtomAutodiscoveryLink(html)).toBe(true);
  });

  it('detects Atom link when another alternate link comes first', () => {
    const html = `<head>
      <link rel="alternate" type="application/json" href="/api/feed">
      <link rel="alternate" type="application/atom+xml" href="/feed.xml" title="Colony Proposals">
    </head>`;
    expect(hasAtomAutodiscoveryLink(html)).toBe(true);
  });
});

describe('VisibilityReport', () => {
  it('has the expected shape with summary and checks fields', () => {
    const checks: CheckResult[] = [
      { label: 'Index HTML exists', ok: true },
      { label: 'Sitemap present', ok: false, details: 'sitemap.xml not found' },
    ];

    const report: VisibilityReport = {
      generatedAt: '2026-03-05T00:00:00.000Z',
      summary: {
        total: checks.length,
        passed: checks.filter((c) => c.ok).length,
        failed: checks.filter((c) => !c.ok).length,
      },
      checks,
    };

    expect(report.summary.total).toBe(2);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.checks[0]).toEqual({ label: 'Index HTML exists', ok: true });
    expect(report.checks[1]).toMatchObject({
      label: 'Sitemap present',
      ok: false,
      details: 'sitemap.xml not found',
    });
  });
});
