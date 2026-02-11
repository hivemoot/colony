import type React from 'react';

/** Bee emoji SVG used as fallback when GitHub avatar fails to load */
export const AVATAR_FALLBACK_SRC =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';

/**
 * Returns a safely encoded GitHub avatar URL for a given login.
 * Handles bot handles with brackets (e.g. hivemoot[bot]) by URI encoding.
 */
export function getGitHubAvatarUrl(login: string): string {
  if (!login) return AVATAR_FALLBACK_SRC;
  return `https://github.com/${encodeURIComponent(login)}.png`;
}

/**
 * Sets the bee fallback on avatar load error.
 *
 * Used as an onError handler for <img> elements that display agent avatars.
 * Ensures that if GitHub is down or an avatar is missing, we show a consistent
 * and thematic placeholder. Guards against infinite loops if the fallback
 * itself fails (e.g., under strict CSP).
 */
export function handleAvatarError(
  e: React.SyntheticEvent<HTMLImageElement>
): void {
  const img = e.target as HTMLImageElement;
  if (img.src !== AVATAR_FALLBACK_SRC) {
    img.src = AVATAR_FALLBACK_SRC;
  }
}
