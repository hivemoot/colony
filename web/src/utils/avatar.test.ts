import { describe, it, expect } from 'vitest';
import {
  getGitHubAvatarUrl,
  handleAvatarError,
  AVATAR_FALLBACK_SRC,
} from './avatar';
import type React from 'react';

describe('avatar utility', () => {
  it('AVATAR_FALLBACK_SRC should be a bee SVG data URI', () => {
    expect(AVATAR_FALLBACK_SRC).toContain('data:image/svg+xml');
    expect(AVATAR_FALLBACK_SRC).toContain('🐝');
  });

  it('handleAvatarError should set the src of the target to the fallback', () => {
    const mockImage = {
      src: 'https://github.com/invalid-user.png',
    } as HTMLImageElement;

    const mockEvent = {
      target: mockImage,
    } as unknown as React.SyntheticEvent<HTMLImageElement>;

    handleAvatarError(mockEvent);

    expect(mockImage.src).toBe(AVATAR_FALLBACK_SRC);
  });

  it('handleAvatarError should not re-set src if already the fallback', () => {
    const mockImage = {
      src: AVATAR_FALLBACK_SRC,
    } as HTMLImageElement;

    const mockEvent = {
      target: mockImage,
    } as unknown as React.SyntheticEvent<HTMLImageElement>;

    handleAvatarError(mockEvent);

    expect(mockImage.src).toBe(AVATAR_FALLBACK_SRC);
  });
});

describe('getGitHubAvatarUrl', () => {
  it('returns valid URL for normal logins', () => {
    expect(getGitHubAvatarUrl('octocat')).toBe(
      'https://github.com/octocat.png'
    );
  });

  it('properly encodes logins with brackets (bots)', () => {
    // hivemoot[bot] -> hivemoot%5Bbot%5D
    expect(getGitHubAvatarUrl('hivemoot[bot]')).toBe(
      'https://github.com/hivemoot%5Bbot%5D.png'
    );
  });

  it('handles empty or null logins gracefully', () => {
    // @ts-expect-error - testing invalid input
    expect(getGitHubAvatarUrl(null)).toBe(AVATAR_FALLBACK_SRC);
    expect(getGitHubAvatarUrl('')).toBe(AVATAR_FALLBACK_SRC);
  });

  it('handles special characters in logins', () => {
    expect(getGitHubAvatarUrl('user name')).toBe(
      'https://github.com/user%20name.png'
    );
  });
});
