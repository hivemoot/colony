import { describe, it, expect } from 'vitest';
import {
  resolveSiteTitle,
  resolveOrgName,
  resolveSiteUrl,
  resolveSiteDescription,
  resolveGitHubUrl,
  resolveBasePath,
  resolveColonyConfig,
} from '../colony-config';

describe('resolveSiteTitle', () => {
  it('returns default when no env var is set', () => {
    expect(resolveSiteTitle({})).toBe('Colony');
  });

  it('uses COLONY_SITE_TITLE when set', () => {
    expect(resolveSiteTitle({ COLONY_SITE_TITLE: 'Swarm' })).toBe('Swarm');
  });

  it('trims whitespace', () => {
    expect(resolveSiteTitle({ COLONY_SITE_TITLE: '  Hive  ' })).toBe('Hive');
  });

  it('falls back to default for empty string', () => {
    expect(resolveSiteTitle({ COLONY_SITE_TITLE: '' })).toBe('Colony');
  });

  it('falls back to default for whitespace-only', () => {
    expect(resolveSiteTitle({ COLONY_SITE_TITLE: '   ' })).toBe('Colony');
  });
});

describe('resolveOrgName', () => {
  it('returns default when no env var is set', () => {
    expect(resolveOrgName({})).toBe('Hivemoot');
  });

  it('uses COLONY_ORG_NAME when set', () => {
    expect(resolveOrgName({ COLONY_ORG_NAME: 'MyOrg' })).toBe('MyOrg');
  });

  it('trims whitespace', () => {
    expect(resolveOrgName({ COLONY_ORG_NAME: '  Acme  ' })).toBe('Acme');
  });

  it('falls back to default for empty string', () => {
    expect(resolveOrgName({ COLONY_ORG_NAME: '' })).toBe('Hivemoot');
  });
});

describe('resolveSiteUrl', () => {
  it('returns default when no env var is set', () => {
    expect(resolveSiteUrl({})).toBe('https://hivemoot.github.io/colony');
  });

  it('uses COLONY_SITE_URL when set', () => {
    expect(
      resolveSiteUrl({ COLONY_SITE_URL: 'https://myorg.github.io/dashboard' })
    ).toBe('https://myorg.github.io/dashboard');
  });

  it('strips trailing slash', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: 'https://example.com/' })).toBe(
      'https://example.com'
    );
  });

  it('trims whitespace', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: '  https://example.com  ' })).toBe(
      'https://example.com'
    );
  });

  it('falls back to default for empty string', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: '' })).toBe(
      'https://hivemoot.github.io/colony'
    );
  });

  it('falls back to default for invalid URL', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: ':::bad:::' })).toBe(
      'https://hivemoot.github.io/colony'
    );
  });

  it('falls back to default for URL without scheme', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: 'myorg.github.io/colony' })).toBe(
      'https://hivemoot.github.io/colony'
    );
  });

  it('falls back to default for non-HTTP protocol', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: 'ftp://example.com' })).toBe(
      'https://hivemoot.github.io/colony'
    );
  });

  it('accepts http:// URLs', () => {
    expect(resolveSiteUrl({ COLONY_SITE_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000'
    );
  });
});

describe('resolveSiteDescription', () => {
  it('returns default when no env var is set', () => {
    expect(resolveSiteDescription({})).toContain('autonomous agents');
  });

  it('uses COLONY_SITE_DESCRIPTION when set', () => {
    expect(
      resolveSiteDescription({ COLONY_SITE_DESCRIPTION: 'Custom description' })
    ).toBe('Custom description');
  });

  it('falls back to default for empty string', () => {
    expect(resolveSiteDescription({ COLONY_SITE_DESCRIPTION: '' })).toContain(
      'autonomous agents'
    );
  });
});

describe('resolveGitHubUrl', () => {
  it('returns default when no env var is set', () => {
    expect(resolveGitHubUrl({})).toBe('https://github.com/hivemoot/colony');
  });

  it('uses COLONY_GITHUB_URL when set', () => {
    expect(
      resolveGitHubUrl({ COLONY_GITHUB_URL: 'https://github.com/myorg/myrepo' })
    ).toBe('https://github.com/myorg/myrepo');
  });

  it('falls back to default for invalid URL', () => {
    expect(resolveGitHubUrl({ COLONY_GITHUB_URL: 'not-a-url' })).toBe(
      'https://github.com/hivemoot/colony'
    );
  });

  it('falls back to default for non-HTTP protocol', () => {
    expect(resolveGitHubUrl({ COLONY_GITHUB_URL: 'ftp://github.com/x' })).toBe(
      'https://github.com/hivemoot/colony'
    );
  });

  it('strips trailing slash', () => {
    expect(
      resolveGitHubUrl({ COLONY_GITHUB_URL: 'https://github.com/org/repo/' })
    ).toBe('https://github.com/org/repo');
  });
});

describe('resolveBasePath', () => {
  it('returns default when no env var is set', () => {
    expect(resolveBasePath({})).toBe('/colony/');
  });

  it('uses COLONY_BASE_PATH when set', () => {
    expect(resolveBasePath({ COLONY_BASE_PATH: '/dashboard/' })).toBe(
      '/dashboard/'
    );
  });

  it('adds leading slash', () => {
    expect(resolveBasePath({ COLONY_BASE_PATH: 'app/' })).toBe('/app/');
  });

  it('adds trailing slash', () => {
    expect(resolveBasePath({ COLONY_BASE_PATH: '/app' })).toBe('/app/');
  });

  it('normalizes bare path', () => {
    expect(resolveBasePath({ COLONY_BASE_PATH: 'app' })).toBe('/app/');
  });

  it('falls back to default for empty string', () => {
    expect(resolveBasePath({ COLONY_BASE_PATH: '' })).toBe('/colony/');
  });

  it('falls back to default for whitespace-only', () => {
    expect(resolveBasePath({ COLONY_BASE_PATH: '   ' })).toBe('/colony/');
  });
});

describe('resolveColonyConfig', () => {
  it('returns all defaults when no env vars are set', () => {
    const config = resolveColonyConfig({});
    expect(config).toEqual({
      siteTitle: 'Colony',
      orgName: 'Hivemoot',
      siteUrl: 'https://hivemoot.github.io/colony',
      siteDescription: expect.stringContaining('autonomous agents'),
      githubUrl: 'https://github.com/hivemoot/colony',
      basePath: '/colony/',
    });
  });

  it('uses all custom values when provided', () => {
    const env = {
      COLONY_SITE_TITLE: 'Swarm',
      COLONY_ORG_NAME: 'Acme',
      COLONY_SITE_URL: 'https://acme.github.io/swarm',
      COLONY_SITE_DESCRIPTION: 'Agent dashboard for Acme',
      COLONY_GITHUB_URL: 'https://github.com/acme/swarm',
      COLONY_BASE_PATH: '/swarm/',
    };

    const config = resolveColonyConfig(env);
    expect(config).toEqual({
      siteTitle: 'Swarm',
      orgName: 'Acme',
      siteUrl: 'https://acme.github.io/swarm',
      siteDescription: 'Agent dashboard for Acme',
      githubUrl: 'https://github.com/acme/swarm',
      basePath: '/swarm/',
    });
  });
});
