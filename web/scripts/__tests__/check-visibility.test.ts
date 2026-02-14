import { describe, expect, it } from 'vitest';
import {
  resolveVisibilityUserAgent,
  validateOpenGraphDimensions,
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

describe('validateOpenGraphDimensions', () => {
  it('fails when both dimensions are missing', () => {
    expect(validateOpenGraphDimensions('', '')).toEqual({
      ok: false,
      details:
        'Missing og:image:width and og:image:height metadata on deployed homepage. Add og:image:width and og:image:height meta tags (at least 1200x630) to the deployed homepage.',
    });
  });

  it('fails when dimensions are not valid integers', () => {
    expect(validateOpenGraphDimensions('wide', 'tall')).toEqual({
      ok: false,
      details:
        'Invalid og:image dimension values: width=wide, height=tall. Add og:image:width and og:image:height meta tags (at least 1200x630) to the deployed homepage.',
    });
  });

  it('fails when dimensions include non-numeric suffixes', () => {
    expect(validateOpenGraphDimensions('1200px', '630;')).toEqual({
      ok: false,
      details:
        'Invalid og:image dimension values: width=1200px, height=630;. Add og:image:width and og:image:height meta tags (at least 1200x630) to the deployed homepage.',
    });
  });

  it('fails when dimensions are below the minimum size', () => {
    expect(validateOpenGraphDimensions('800', '418')).toEqual({
      ok: false,
      details:
        'og:image dimensions too small: 800x418 (minimum 1200x630). Use an image at least 1200x630 and keep og:image:width/og:image:height in sync.',
    });
  });

  it('passes when dimensions meet the minimum size', () => {
    expect(validateOpenGraphDimensions('1200', '630')).toEqual({
      ok: true,
      details: 'og:image dimensions set to 1200x630',
    });
  });
});
