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
    const result = evaluateEligibility(
      {
        number: 101,
        title: 'fix: keep output machine-readable',
        url: 'https://example.test/pr/101',
        latestReviews: [
          { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
          { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
        ],
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
        closingIssuesReferences: [
          {
            number: 307,
            state: 'OPEN',
            url: 'https://api.github.com/repos/hivemoot/colony/issues/307',
          },
        ],
      },
      new Map<string, string>(),
      'hivemoot/colony'
    );

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.approvals).toBe(2);
    expect(result.ciState).toBe('SUCCESS');
    expect(result.linkedOpenIssues).toEqual(['hivemoot/colony#307']);
  });

  it('explains all failed criteria', () => {
    const result = evaluateEligibility(
      {
        number: 102,
        title: 'feat: add fast-track bot support',
        url: 'https://example.test/pr/102',
        latestReviews: [
          { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        ],
        statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: null }],
        closingIssuesReferences: [{ number: 307, state: 'CLOSED' }],
      },
      new Map<string, string>(),
      'hivemoot/colony'
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(4);
    expect(result.reasons[0]).toMatch(/title prefix/);
    expect(result.reasons[1]).toMatch(/at least 2 distinct approvals/);
    expect(result.reasons[2]).toMatch(/CI checks must be SUCCESS/);
    expect(result.reasons[3]).toMatch(/OPEN linked issue/);
  });

  it('marks PR ineligible when a thumbs-down veto is present', () => {
    const result = evaluateEligibility(
      {
        number: 103,
        title: 'fix: improve merge readiness report',
        url: 'https://example.test/pr/103',
        latestReviews: [
          { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
          { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
        ],
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
        closingIssuesReferences: [
          {
            number: 307,
            state: 'OPEN',
            url: 'https://api.github.com/repos/hivemoot/colony/issues/307',
          },
        ],
        reactionGroups: [
          {
            content: 'THUMBS_DOWN',
            users: { totalCount: 1 },
          },
        ],
      },
      new Map<string, string>(),
      'hivemoot/colony'
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      'cannot have a 👎 veto reaction on the PR'
    );
  });

  it('does not misclassify cross-repo issues with the same number', () => {
    const result = evaluateEligibility(
      {
        number: 104,
        title: 'fix: keep issue resolution repo-aware',
        url: 'https://example.test/pr/104',
        latestReviews: [
          { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
          { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
        ],
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
        closingIssuesReferences: [
          {
            number: 307,
            state: 'CLOSED',
            url: 'https://api.github.com/repos/other/repo/issues/307',
          },
        ],
      },
      new Map<string, string>([
        ['hivemoot/colony#307', 'OPEN'],
        ['other/repo#307', 'CLOSED'],
      ]),
      'hivemoot/colony'
    );

    expect(result.eligible).toBe(false);
    expect(result.linkedOpenIssues).toEqual([]);
    expect(result.reasons).toContain(
      'must reference at least one OPEN linked issue'
    );
  });
});
