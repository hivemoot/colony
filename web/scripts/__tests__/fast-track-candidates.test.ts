import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  countDistinctApprovals,
  evaluateEligibility,
  hasAllowedPrefix,
  isMergeReady,
  normalizeMergeStateStatus,
  printHumanReport,
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

const ALLOWED_PREFIXES = [
  'fix:',
  'test:',
  'docs:',
  'chore:',
  'a11y:',
  'polish:',
] as const;

function makeReport(
  candidates: Array<{
    number: number;
    eligible: boolean;
    mergeStateStatus: string;
    approvals: number;
  }>
): Parameters<typeof printHumanReport>[0] {
  return {
    generatedAt: '2026-02-22T00:00:00Z',
    repo: 'hivemoot/colony',
    allowedPrefixes: ALLOWED_PREFIXES,
    summary: {
      totalOpenPrs: candidates.length,
      eligiblePrs: candidates.filter((c) => c.eligible).length,
      mergeReadyEligiblePrs: candidates.filter(
        (c) => c.eligible && c.mergeStateStatus === 'CLEAN'
      ).length,
    },
    candidates: candidates.map((c) => ({
      number: c.number,
      title: `fix: pr ${c.number}`,
      url: `https://github.com/hivemoot/colony/pull/${c.number}`,
      mergeStateStatus: c.mergeStateStatus,
      eligible: c.eligible,
      reasons: c.eligible
        ? []
        : ['requires at least 2 distinct approvals (found 0)'],
      approvals: c.approvals,
      ciState: 'SUCCESS',
      linkedOpenIssues: c.eligible ? [999] : [],
    })),
  };
}

describe('printHumanReport — conflict-blocked eligible PR display', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no conflict section when all eligible PRs are CLEAN', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeReport([
      { number: 100, eligible: true, mergeStateStatus: 'CLEAN', approvals: 4 },
      { number: 101, eligible: true, mergeStateStatus: 'CLEAN', approvals: 6 },
    ]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).not.toContain('merge conflicts');
  });

  it('shows conflict section when eligible PRs have non-CLEAN merge state', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeReport([
      { number: 200, eligible: true, mergeStateStatus: 'DIRTY', approvals: 6 },
      { number: 201, eligible: true, mergeStateStatus: 'CLEAN', approvals: 3 },
    ]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('1 PR(s) eligible but blocked by merge conflicts');
    // #200 (DIRTY) must appear in the conflict section
    const conflictSectionStart = output.indexOf('merge conflicts');
    expect(conflictSectionStart).toBeGreaterThan(-1);
    const conflictSection = output.slice(conflictSectionStart);
    expect(conflictSection).toContain('#200');
    // #201 (CLEAN) must NOT appear in the conflict section
    expect(conflictSection).not.toContain('#201');
  });

  it('sorts conflict-blocked PRs by approval count descending', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeReport([
      { number: 300, eligible: true, mergeStateStatus: 'DIRTY', approvals: 3 },
      {
        number: 301,
        eligible: true,
        mergeStateStatus: 'CONFLICTING',
        approvals: 8,
      },
      { number: 302, eligible: true, mergeStateStatus: 'DIRTY', approvals: 5 },
    ]);

    printHumanReport(report);

    const lines = logSpy.mock.calls
      .map((c) => c[0] as string)
      .filter((line) => line.includes('approvals):'));

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('#301');
    expect(lines[1]).toContain('#302');
    expect(lines[2]).toContain('#300');
  });

  it('includes approval count in each conflict-blocked PR line', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeReport([
      { number: 400, eligible: true, mergeStateStatus: 'DIRTY', approvals: 7 },
    ]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('#400 (7 approvals):');
  });

  it('does not show ineligible PRs in conflict section', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeReport([
      { number: 500, eligible: false, mergeStateStatus: 'DIRTY', approvals: 1 },
      { number: 501, eligible: true, mergeStateStatus: 'CLEAN', approvals: 4 },
    ]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).not.toContain('merge conflicts');
    expect(output).not.toContain('#500');
  });
});
