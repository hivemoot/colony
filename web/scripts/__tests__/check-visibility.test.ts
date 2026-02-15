import { describe, expect, it } from 'vitest';
import {
  evaluateGeneratedAtFreshness,
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

describe('evaluateGeneratedAtFreshness', () => {
  it('fails when generatedAt is in the future', () => {
    const result = evaluateGeneratedAtFreshness('2026-02-16T00:00:00Z', {
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.details).toContain('future');
  });

  it('fails when generatedAt is older than the freshness threshold', () => {
    const result = evaluateGeneratedAtFreshness('2026-02-14T00:00:00Z', {
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
      maxAgeHours: 18,
    });

    expect(result.ok).toBe(false);
    expect(result.details).toBe('Deployed data is 24h old');
  });

  it('passes when generatedAt is recent', () => {
    const result = evaluateGeneratedAtFreshness('2026-02-14T20:00:00Z', {
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
      maxAgeHours: 18,
    });

    expect(result.ok).toBe(true);
    expect(result.details).toBe('Deployed data is 4h old');
  });
});
