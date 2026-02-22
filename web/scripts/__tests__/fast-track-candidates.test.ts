import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  countDistinctApprovals,
  evaluateEligibility,
  hasAllowedPrefix,
  isMergeReady,
  normalizeMergeStateStatus,
  printHumanReport,
} from '../fast-track-candidates';

const ALLOWED_PREFIXES = [
  'fix:',
  'test:',
  'docs:',
  'chore:',
  'a11y:',
  'polish:',
] as const;

function makeBlockedReport(
  blockedPrs: Array<{ number: number; approvals: number }>
): Parameters<typeof printHumanReport>[0] {
  const candidates = blockedPrs.map((pr) => ({
    number: pr.number,
    title: `fix: pr ${pr.number}`,
    url: `https://github.com/hivemoot/colony/pull/${pr.number}`,
    mergeStateStatus: 'DIRTY',
    eligible: false,
    reasons: ['must reference at least one OPEN linked issue'],
    approvals: pr.approvals,
    ciState: 'SUCCESS',
    linkedOpenIssues: [] as number[],
  }));

  return {
    generatedAt: '2026-02-22T00:00:00Z',
    repo: 'hivemoot/colony',
    allowedPrefixes: ALLOWED_PREFIXES,
    summary: {
      totalOpenPrs: candidates.length,
      eligiblePrs: 0,
      mergeReadyEligiblePrs: 0,
    },
    candidates,
  };
}

describe('printHumanReport — blocked PR display', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows all blocked PRs (no 5-PR cap)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeBlockedReport([
      { number: 301, approvals: 10 },
      { number: 317, approvals: 11 },
      { number: 347, approvals: 8 },
      { number: 397, approvals: 12 },
      { number: 286, approvals: 12 },
      { number: 292, approvals: 7 },
    ]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    // All 6 PRs must appear — no "... and N more" truncation
    for (const pr of [301, 317, 347, 397, 286, 292]) {
      expect(output).toContain(`#${pr}`);
    }
    expect(output).not.toContain('more');
  });

  it('sorts blocked PRs by approval count descending', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeBlockedReport([
      { number: 100, approvals: 3 },
      { number: 101, approvals: 8 },
      { number: 102, approvals: 5 },
    ]);

    printHumanReport(report);

    const lines = logSpy.mock.calls
      .map((c) => c[0] as string)
      .filter((line) => line.includes('approvals):'));

    expect(lines).toHaveLength(3);
    // Highest approvals first
    expect(lines[0]).toContain('#101');
    expect(lines[1]).toContain('#102');
    expect(lines[2]).toContain('#100');
  });

  it('includes approval count in each blocked PR line', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeBlockedReport([{ number: 200, approvals: 7 }]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('#200 (7 approvals):');
  });
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
