import { describe, expect, it } from 'vitest';
import {
  resolveVisibilityUserAgent,
  summarizeResults,
  toVisibilityJsonReport,
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
  it('counts passed and failed checks', () => {
    expect(
      summarizeResults([
        { label: 'A', ok: true },
        { label: 'B', ok: false },
        { label: 'C', ok: true },
      ])
    ).toEqual({
      total: 3,
      failed: 1,
      passed: 2,
    });
  });

  it('handles empty result sets', () => {
    expect(summarizeResults([])).toEqual({
      total: 0,
      failed: 0,
      passed: 0,
    });
  });
});

describe('toVisibilityJsonReport', () => {
  it('builds a stable JSON payload with summary and warnings', () => {
    expect(
      toVisibilityJsonReport(
        [
          { label: 'A', ok: true },
          { label: 'B', ok: false },
        ],
        ['fallback homepage in use']
      )
    ).toEqual({
      summary: {
        total: 2,
        failed: 1,
        passed: 1,
      },
      results: [
        { label: 'A', ok: true },
        { label: 'B', ok: false },
      ],
      warnings: ['fallback homepage in use'],
    });
  });
});
