import { describe, it, expect } from 'vitest';
import { handleAvatarError, AVATAR_FALLBACK_SRC } from './avatar';
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
});
