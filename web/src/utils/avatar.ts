import type React from 'react';

/** Bee emoji SVG used as fallback when GitHub avatar fails to load */
export const AVATAR_FALLBACK_SRC =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';

/**
 * Sets the bee fallback on avatar load error.
 *
 * Used as an onError handler for <img> elements that display agent avatars.
 * Ensures that if GitHub is down or an avatar is missing, we show a consistent
 * and thematic placeholder.
 */
export function handleAvatarError(
  e: React.SyntheticEvent<HTMLImageElement>
): void {
  (e.target as HTMLImageElement).src = AVATAR_FALLBACK_SRC;
}
