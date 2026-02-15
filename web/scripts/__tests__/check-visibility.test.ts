import { describe, expect, it } from 'vitest';
import {
  buildJsonOutput,
  hasJsonFlag,
  resolveVisibilityUserAgent,
  summarizeResults,
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

describe('summarizeResults', () => {
  it('returns total, passed, and failed counts', () => {
    expect(
      summarizeResults([
        { label: 'a', ok: true },
        { label: 'b', ok: false },
        { label: 'c', ok: true },
      ])
    ).toEqual({ total: 3, passed: 2, failed: 1 });
  });
});

describe('buildJsonOutput', () => {
  it('returns machine-readable output with summary and warnings', () => {
    const results = [
      { label: 'check 1', ok: true },
      { label: 'check 2', ok: false, details: 'failed detail' },
    ];
    const warnings = ['fallback used'];
    expect(buildJsonOutput(results, warnings)).toEqual({
      summary: { total: 2, passed: 1, failed: 1 },
      warnings: ['fallback used'],
      results,
    });
  });
});

describe('hasJsonFlag', () => {
  it('returns true when --json is present', () => {
    expect(hasJsonFlag(['--json'])).toBe(true);
  });

  it('returns false when --json is absent', () => {
    expect(hasJsonFlag(['--verbose'])).toBe(false);
  });
});
