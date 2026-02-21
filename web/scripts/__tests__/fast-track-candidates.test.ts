import { describe, expect, it } from 'vitest';
import {
  countDistinctApprovals,
  evaluateEligibility,
  FAST_TRACK_HIGH_APPROVAL_WAIVER_THRESHOLD,
  hasAllowedPrefix,
  hasChangesRequested,
  isMergeReady,
  normalizeMergeStateStatus,
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

describe('merge state helpers', () => {
  it('normalizes missing merge state to UNKNOWN', () => {
    expect(normalizeMergeStateStatus(undefined)).toBe('UNKNOWN');
    expect(normalizeMergeStateStatus('')).toBe('UNKNOWN');
  });

  it('treats CLEAN as merge-ready and non-clean states as not ready', () => {
    expect(isMergeReady('CLEAN')).toBe(true);
    expect(isMergeReady(' clean ')).toBe(true);
    expect(isMergeReady('DIRTY')).toBe(false);
    expect(isMergeReady('UNKNOWN')).toBe(false);
  });
});

describe('hasChangesRequested', () => {
  it('returns true when any review is CHANGES_REQUESTED', () => {
    expect(
      hasChangesRequested([
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'CHANGES_REQUESTED', author: { login: 'hivemoot-nurse' } },
      ])
    ).toBe(true);
  });

  it('returns false when no review is CHANGES_REQUESTED', () => {
    expect(
      hasChangesRequested([
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'COMMENTED', author: { login: 'hivemoot-builder' } },
      ])
    ).toBe(false);
  });

  it('returns false for undefined reviews', () => {
    expect(hasChangesRequested(undefined)).toBe(false);
  });
});

describe('FAST_TRACK_HIGH_APPROVAL_WAIVER_THRESHOLD', () => {
  it('is 6', () => {
    expect(FAST_TRACK_HIGH_APPROVAL_WAIVER_THRESHOLD).toBe(6);
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
    expect(result.waiverApplied).toBe(false);
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

  it('marks PR ineligible when a thumbs-down veto is present', () => {
    const result = evaluateEligibility({
      number: 103,
      title: 'fix: improve merge readiness report',
      url: 'https://example.test/pr/103',
      latestReviews: [
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
      ],
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 307, state: 'OPEN' }],
      reactionGroups: [
        {
          content: 'THUMBS_DOWN',
          users: { totalCount: 1 },
        },
      ],
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      'cannot have a 👎 veto reaction on the PR'
    );
  });

  it('grants high-approval waiver when ≥6 approvals and linked issue is closed', () => {
    const sixApprovers = [
      { state: 'APPROVED', author: { login: 'agent-a' } },
      { state: 'APPROVED', author: { login: 'agent-b' } },
      { state: 'APPROVED', author: { login: 'agent-c' } },
      { state: 'APPROVED', author: { login: 'agent-d' } },
      { state: 'APPROVED', author: { login: 'agent-e' } },
      { state: 'APPROVED', author: { login: 'agent-f' } },
    ];
    const result = evaluateEligibility({
      number: 200,
      title: 'fix: apply high-approval waiver',
      url: 'https://example.test/pr/200',
      latestReviews: sixApprovers,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 445, state: 'CLOSED' }],
    });

    expect(result.eligible).toBe(true);
    expect(result.waiverApplied).toBe(true);
    expect(result.approvals).toBe(6);
    expect(result.reasons).toEqual([]);
  });

  it('does not grant waiver when a CHANGES_REQUESTED review is present', () => {
    const reviews = [
      { state: 'APPROVED', author: { login: 'agent-a' } },
      { state: 'APPROVED', author: { login: 'agent-b' } },
      { state: 'APPROVED', author: { login: 'agent-c' } },
      { state: 'APPROVED', author: { login: 'agent-d' } },
      { state: 'APPROVED', author: { login: 'agent-e' } },
      { state: 'APPROVED', author: { login: 'agent-f' } },
      { state: 'CHANGES_REQUESTED', author: { login: 'agent-g' } },
    ];
    const result = evaluateEligibility({
      number: 201,
      title: 'fix: blocked by changes-requested',
      url: 'https://example.test/pr/201',
      latestReviews: reviews,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 445, state: 'CLOSED' }],
    });

    expect(result.eligible).toBe(false);
    expect(result.waiverApplied).toBe(false);
    expect(result.reasons).toContain(
      'must reference at least one OPEN linked issue'
    );
  });

  it('does not grant waiver when approval count is below threshold', () => {
    const result = evaluateEligibility({
      number: 202,
      title: 'fix: insufficient approvals for waiver',
      url: 'https://example.test/pr/202',
      latestReviews: [
        { state: 'APPROVED', author: { login: 'agent-a' } },
        { state: 'APPROVED', author: { login: 'agent-b' } },
        { state: 'APPROVED', author: { login: 'agent-c' } },
        { state: 'APPROVED', author: { login: 'agent-d' } },
        { state: 'APPROVED', author: { login: 'agent-e' } },
      ],
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 445, state: 'CLOSED' }],
    });

    expect(result.eligible).toBe(false);
    expect(result.waiverApplied).toBe(false);
    expect(result.reasons).toContain(
      'must reference at least one OPEN linked issue'
    );
  });

  it('sets waiverApplied to false when PR has an open linked issue (no waiver needed)', () => {
    const sixApprovers = [
      { state: 'APPROVED', author: { login: 'agent-a' } },
      { state: 'APPROVED', author: { login: 'agent-b' } },
      { state: 'APPROVED', author: { login: 'agent-c' } },
      { state: 'APPROVED', author: { login: 'agent-d' } },
      { state: 'APPROVED', author: { login: 'agent-e' } },
      { state: 'APPROVED', author: { login: 'agent-f' } },
    ];
    const result = evaluateEligibility({
      number: 203,
      title: 'fix: waiver not needed, open issue present',
      url: 'https://example.test/pr/203',
      latestReviews: sixApprovers,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 445, state: 'OPEN' }],
    });

    expect(result.eligible).toBe(true);
    expect(result.waiverApplied).toBe(false);
  });

  it('does not treat same-number issues in other repos as open', () => {
    const result = evaluateEligibility(
      {
        number: 104,
        title: 'fix: keep fast-track issue checks scoped correctly',
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
            url: 'https://github.com/hivemoot/hivemoot/issues/307',
          },
        ],
      },
      new Map([
        ['hivemoot/colony#307', 'OPEN'],
        ['hivemoot/hivemoot#307', 'CLOSED'],
      ]),
      'hivemoot/colony'
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      'must reference at least one OPEN linked issue'
    );
  });
});
