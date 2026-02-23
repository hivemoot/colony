import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  countDistinctApprovals,
  evaluateEligibility,
  hasAllowedPrefix,
  hasChangesRequested,
  HIGH_APPROVAL_WAIVER_THRESHOLD,
  isMergeReady,
  mergeCandidates,
  normalizeMergeStateStatus,
} from '../fast-track-candidates';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi
    .fn<Parameters<typeof import('node:child_process').execFileSync>, string>()
    .mockReturnValue(''),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const mod = await importOriginal<
    { default: unknown } & typeof import('node:child_process')
  >();
  return {
    ...mod,
    default: { ...(mod.default as object), execFileSync: mockExecFileSync },
    execFileSync: mockExecFileSync,
  };
});

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

describe('hasChangesRequested', () => {
  it('returns true when any review is CHANGES_REQUESTED', () => {
    expect(
      hasChangesRequested([
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'CHANGES_REQUESTED', author: { login: 'hivemoot-heater' } },
      ])
    ).toBe(true);
  });

  it('returns false when no reviews are CHANGES_REQUESTED', () => {
    expect(
      hasChangesRequested([
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'COMMENTED', author: { login: 'hivemoot-builder' } },
      ])
    ).toBe(false);
  });

  it('returns false for empty or missing reviews', () => {
    expect(hasChangesRequested([])).toBe(false);
    expect(hasChangesRequested(undefined)).toBe(false);
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
    expect(result.highApprovalWaiver).toBe(false);
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

  it('applies high-approval waiver when 6+ approvals and no linked open issue', () => {
    const approvers = Array.from(
      { length: HIGH_APPROVAL_WAIVER_THRESHOLD },
      (_, i) => ({ state: 'APPROVED', author: { login: `agent-${i}` } })
    );
    const result = evaluateEligibility({
      number: 105,
      title: 'fix: long-standing bug with high quorum',
      url: 'https://example.test/pr/105',
      latestReviews: approvers,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [],
    });

    expect(result.eligible).toBe(true);
    expect(result.highApprovalWaiver).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('does not apply waiver when 6+ approvals but CHANGES_REQUESTED present', () => {
    const approvers = Array.from(
      { length: HIGH_APPROVAL_WAIVER_THRESHOLD },
      (_, i) => ({ state: 'APPROVED', author: { login: `agent-${i}` } })
    );
    const result = evaluateEligibility({
      number: 106,
      title: 'fix: high approvals but reviewer blocked',
      url: 'https://example.test/pr/106',
      latestReviews: [
        ...approvers,
        { state: 'CHANGES_REQUESTED', author: { login: 'strict-reviewer' } },
      ],
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.highApprovalWaiver).toBe(false);
    expect(result.reasons).toContain(
      'must reference at least one OPEN linked issue'
    );
    expect(result.reasons).toContain(
      'cannot have a pending CHANGES_REQUESTED review'
    );
  });

  it('does not apply waiver when fewer than 6 approvals', () => {
    const result = evaluateEligibility({
      number: 107,
      title: 'fix: only 5 approvals',
      url: 'https://example.test/pr/107',
      latestReviews: Array.from({ length: 5 }, (_, i) => ({
        state: 'APPROVED',
        author: { login: `agent-${i}` },
      })),
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.highApprovalWaiver).toBe(false);
    expect(result.reasons).toContain(
      'must reference at least one OPEN linked issue'
    );
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

describe('mergeCandidates', () => {
  const makeReport = (
    candidates: Parameters<typeof mergeCandidates>[0]['candidates']
  ): Parameters<typeof mergeCandidates>[0] => ({
    generatedAt: '2026-02-22T00:00:00Z',
    repo: 'hivemoot/colony',
    allowedPrefixes: [
      'fix:',
      'docs:',
      'chore:',
      'test:',
      'a11y:',
      'polish:',
    ] as const,
    summary: {
      totalOpenPrs: candidates.length,
      eligiblePrs: candidates.filter((c) => c.eligible).length,
      mergeReadyEligiblePrs: candidates.filter(
        (c) => c.eligible && c.mergeStateStatus === 'CLEAN'
      ).length,
    },
    candidates,
  });

  beforeEach(() => {
    mockExecFileSync.mockClear();
  });

  it('exits silently with no gh calls when no eligible+CLEAN candidates', () => {
    mergeCandidates(makeReport([]));
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('does not merge eligible PRs that are not CLEAN', () => {
    const report = makeReport([
      {
        number: 200,
        title: 'fix: improve logging',
        url: 'https://github.com/hivemoot/colony/pull/200',
        mergeStateStatus: 'DIRTY',
        eligible: true,
        reasons: [],
        approvals: 2,
        ciState: 'SUCCESS',
        linkedOpenIssues: [100],
      },
    ]);
    mergeCandidates(report);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('merges eligible CLEAN PRs and posts an audit comment', () => {
    const report = makeReport([
      {
        number: 201,
        title: 'fix: correct sitemap priority',
        url: 'https://github.com/hivemoot/colony/pull/201',
        mergeStateStatus: 'CLEAN',
        eligible: true,
        reasons: [],
        approvals: 3,
        ciState: 'SUCCESS',
        linkedOpenIssues: [101],
      },
    ]);
    mergeCandidates(report);

    // First call: gh pr merge --squash
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'merge',
        '--squash',
        '--delete-branch',
        '--repo',
        'hivemoot/colony',
        '201',
      ],
      expect.objectContaining({ encoding: 'utf8' })
    );

    // Second call: gh pr comment (audit trail)
    const commentCall = mockExecFileSync.mock.calls[1];
    expect(commentCall[0]).toBe('gh');
    expect(commentCall[1]).toContain('comment');
    expect(commentCall[1]).toContain('201');
    const bodyArg = commentCall[1][
      commentCall[1].indexOf('--body') + 1
    ] as string;
    expect(bodyArg).toMatch(/Fast-track auto-merge/);
    expect(bodyArg).toMatch(/#101/);
  });

  it('posts a diagnostic comment and continues when merge fails', () => {
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('branch protection');
      })
      .mockReturnValue('');

    const report = makeReport([
      {
        number: 202,
        title: 'docs: update contributing guide',
        url: 'https://github.com/hivemoot/colony/pull/202',
        mergeStateStatus: 'CLEAN',
        eligible: true,
        reasons: [],
        approvals: 2,
        ciState: 'SUCCESS',
        linkedOpenIssues: [102],
      },
    ]);

    expect(() => mergeCandidates(report)).not.toThrow();

    // First call was the failed merge attempt
    expect(mockExecFileSync.mock.calls[0][1]).toContain('merge');

    // Second call should be the diagnostic comment
    const diagCall = mockExecFileSync.mock.calls[1];
    expect(diagCall[1]).toContain('comment');
    const diagBody = diagCall[1][diagCall[1].indexOf('--body') + 1] as string;
    expect(diagBody).toMatch(/auto-merge attempted but failed/);
  });

  it('skips ineligible PRs even when CLEAN', () => {
    const report = makeReport([
      {
        number: 203,
        title: 'feat: add new feature',
        url: 'https://github.com/hivemoot/colony/pull/203',
        mergeStateStatus: 'CLEAN',
        eligible: false,
        reasons: [
          'title prefix must be one of: fix:, test:, docs:, chore:, a11y:, polish:',
        ],
        approvals: 2,
        ciState: 'SUCCESS',
        linkedOpenIssues: [],
      },
    ]);
    mergeCandidates(report);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});
