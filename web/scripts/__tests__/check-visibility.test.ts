import { describe, expect, it } from 'vitest';
import {
  resolveDeployedBaseUrl,
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
