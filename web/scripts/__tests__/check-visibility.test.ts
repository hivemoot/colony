import { describe, expect, it } from 'vitest';
import {
  isGeneratedAtFresh,
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

describe('isGeneratedAtFresh', () => {
  const nowMs = Date.parse('2026-02-15T12:00:00Z');

  it('returns false when generatedAt is missing or invalid', () => {
    expect(isGeneratedAtFresh(undefined, nowMs)).toBe(false);
    expect(isGeneratedAtFresh('not-a-date', nowMs)).toBe(false);
  });

  it('returns false for future timestamps', () => {
    expect(isGeneratedAtFresh('2026-02-15T12:30:00Z', nowMs)).toBe(false);
  });

  it('returns true when timestamp is within freshness window', () => {
    expect(isGeneratedAtFresh('2026-02-15T02:00:00Z', nowMs)).toBe(true);
  });

  it('returns false when timestamp is older than freshness window', () => {
    expect(isGeneratedAtFresh('2026-02-14T17:59:59Z', nowMs)).toBe(false);
  });
});
