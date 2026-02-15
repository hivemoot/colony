import { describe, expect, it } from 'vitest';
import {
  buildRepositoryApiUrl,
  hasTwitterImageAltText,
  isValidOpenGraphImageType,
  resolveDeployedBaseUrl,
  resolveRepositoryHomepage,
  resolveVisibilityRepository,
  resolveVisibilityUserAgent,
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

  it('rejects non-https, invalid, or unsupported homepage URLs', () => {
    expect(resolveRepositoryHomepage('http://colony.example.org')).toBe('');
    expect(resolveRepositoryHomepage('ftp://colony.example.org')).toBe('');
    expect(
      resolveRepositoryHomepage('https://user:pass@colony.example.org')
    ).toBe('');
    expect(resolveRepositoryHomepage('not-a-url')).toBe('');
    expect(resolveRepositoryHomepage('   ')).toBe('');
  });
});

describe('resolveDeployedBaseUrl', () => {
  it('uses normalized https homepage when valid', () => {
    expect(resolveDeployedBaseUrl(' https://example.com/path/ ')).toEqual({
      baseUrl: 'https://example.com/path',
      usedFallback: false,
    });
  });

  it('falls back when homepage is non-https', () => {
    expect(resolveDeployedBaseUrl('http://example.com/path')).toEqual({
      baseUrl: 'https://hivemoot.github.io/colony',
      usedFallback: true,
    });
  });

  it('falls back when homepage URL is malformed', () => {
    expect(resolveDeployedBaseUrl('not-a-url')).toEqual({
      baseUrl: 'https://hivemoot.github.io/colony',
      usedFallback: true,
    });
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
