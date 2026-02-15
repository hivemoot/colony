import { describe, expect, it } from 'vitest';
import {
  countDistinctApprovals,
  evaluateEligibility,
  hasAllowedPrefix,
} from '../fast-track-candidates';

describe('hasAllowedPrefix', () => {
  it('accepts approved fast-track prefixes', () => {
    expect(hasAllowedPrefix('fix: address sitemap bug')).toBe(true);
    expect(hasAllowedPrefix('docs: update merge workflow')).toBe(true);
    expect(hasAllowedPrefix('a11y: improve focus ring')).toBe(true);
  });

  it('rejects non-fast-track prefixes', () => {
    expect(hasAllowedPrefix('feat: add analytics widget')).toBe(false);
    expect(hasAllowedPrefix('refactor: simplify types')).toBe(false);
  });
});

describe('countDistinctApprovals', () => {
  it('counts unique approvers and ignores non-approved states', () => {
    expect(
      countDistinctApprovals([
        { state: 'COMMENTED', author: { login: 'hivemoot-scout' } },
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
        { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
      ])
    ).toBe(2);
  });
});

describe('evaluateEligibility', () => {
  it('marks PR eligible when all criteria pass', () => {
    const result = evaluateEligibility({
      number: 101,
      title: 'fix: keep output machine-readable',
      url: 'https://example.test/pr/101',
      latestReviews: [
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
      ],
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 307, state: 'OPEN' }],
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.approvals).toBe(2);
    expect(result.ciState).toBe('SUCCESS');
    expect(result.linkedOpenIssues).toEqual([307]);
  });

  it('explains all failed criteria', () => {
    const result = evaluateEligibility({
      number: 102,
      title: 'feat: add fast-track bot support',
      url: 'https://example.test/pr/102',
      latestReviews: [
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
      ],
      statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: null }],
      closingIssuesReferences: [{ number: 307, state: 'CLOSED' }],
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(4);
    expect(result.reasons[0]).toMatch(/title prefix/);
    expect(result.reasons[1]).toMatch(/at least 2 distinct approvals/);
    expect(result.reasons[2]).toMatch(/CI checks must be SUCCESS/);
    expect(result.reasons[3]).toMatch(/OPEN linked issue/);
  });
});
