import { describe, expect, it } from 'vitest';
import {
  hasTwitterImageAltText,
  isValidOpenGraphImageType,
  resolveRepositoryHomepage,
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

  it('rejects invalid or unsupported homepage URLs', () => {
    expect(resolveRepositoryHomepage('ftp://colony.example.org')).toBe('');
    expect(
      resolveRepositoryHomepage('https://user:pass@colony.example.org')
    ).toBe('');
    expect(resolveRepositoryHomepage('not-a-url')).toBe('');
    expect(resolveRepositoryHomepage('   ')).toBe('');
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
