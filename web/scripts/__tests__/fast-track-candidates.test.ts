import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  countDistinctApprovals,
  DEFAULT_LIMIT,
  evaluateEligibility,
  getWorkflowApprovalBlocker,
  hasAllowedPrefix,
  hasChangesRequested,
  HIGH_APPROVAL_WAIVER_THRESHOLD,
  isMergeReady,
  normalizeMergeStateStatus,
  parseArgs,
  printHumanReport,
  resolveIssueStates,
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
    highApprovalWaiver: false,
    workflowApprovalBlocked: false,
    workflowApprovalOwner: null,
  }));

  return {
    generatedAt: '2026-02-22T00:00:00Z',
    repo: 'hivemoot/colony',
    allowedPrefixes: ALLOWED_PREFIXES,
    summary: {
      totalOpenPrs: candidates.length,
      eligiblePrs: 0,
      mergeReadyEligiblePrs: 0,
      workflowApprovalBlockedPrs: 0,
    },
    candidates,
  };
}

function makeWorkflowApprovalBlockedReport(
  blockedPrs: Array<{ number: number; approvals: number; owner: string }>
): Parameters<typeof printHumanReport>[0] {
  const candidates = blockedPrs.map((pr) => ({
    number: pr.number,
    title: `fix: pr ${pr.number}`,
    url: `https://github.com/hivemoot/colony/pull/${pr.number}`,
    mergeStateStatus: 'UNSTABLE',
    eligible: false,
    reasons: [
      'CI checks must be SUCCESS (found UNKNOWN)',
      `likely waiting on first-time fork workflow approval for ${pr.owner}`,
    ],
    approvals: pr.approvals,
    ciState: 'UNKNOWN',
    linkedOpenIssues: [] as number[],
    highApprovalWaiver: false,
    workflowApprovalBlocked: true,
    workflowApprovalOwner: pr.owner,
  }));

  return {
    generatedAt: '2026-03-13T00:00:00Z',
    repo: 'hivemoot/colony',
    allowedPrefixes: ALLOWED_PREFIXES,
    summary: {
      totalOpenPrs: candidates.length,
      eligiblePrs: 0,
      mergeReadyEligiblePrs: 0,
      workflowApprovalBlockedPrs: candidates.length,
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

  it('surfaces likely fork workflow approval blockers with maintainer action', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = makeWorkflowApprovalBlockedReport([
      { number: 536, approvals: 5, owner: 'hivemoot-heater' },
      { number: 572, approvals: 4, owner: 'hivemoot-heater' },
    ]);

    printHumanReport(report);

    const output = logSpy.mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('Workflow approval blockers: 2');
    expect(output).toContain(
      'likely waiting on first-time fork workflow approval'
    );
    expect(output).toContain('Approve and run workflows');
    expect(output).toContain('Fork owners: hivemoot-heater');
    expect(output).toContain('#536 (5 approvals, owner hivemoot-heater');
    expect(output).toContain('#572 (4 approvals, owner hivemoot-heater');
  });
});

describe('hasAllowedPrefix', () => {
  it('accepts approved fast-track prefixes', () => {
    expect(hasAllowedPrefix('fix: address sitemap bug')).toBe(true);
    expect(hasAllowedPrefix('docs: update merge workflow')).toBe(true);
    expect(hasAllowedPrefix('a11y: improve focus ring')).toBe(true);
  });

  it('accepts scoped Conventional Commits variants of approved prefixes', () => {
    expect(
      hasAllowedPrefix('a11y(web): make vote bar transitions motion-safe')
    ).toBe(true);
    expect(hasAllowedPrefix('fix(scope): correct behaviour')).toBe(true);
    expect(hasAllowedPrefix('chore(deps): bump package')).toBe(true);
  });

  it('rejects non-fast-track prefixes', () => {
    expect(hasAllowedPrefix('feat: add analytics widget')).toBe(false);
    expect(hasAllowedPrefix('refactor: simplify types')).toBe(false);
  });

  it('rejects scoped variants of non-fast-track prefixes', () => {
    expect(hasAllowedPrefix('feat(ui): add analytics widget')).toBe(false);
    expect(hasAllowedPrefix('refactor(utils): simplify types')).toBe(false);
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

  it('flags likely first-time fork workflow approval blockers', () => {
    const result = evaluateEligibility({
      number: 109,
      title: 'fix: unblock queue visibility',
      url: 'https://example.test/pr/109',
      mergeStateStatus: 'UNSTABLE',
      headRepositoryOwner: { login: 'hivemoot-heater' },
      latestReviews: [
        { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
        { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
      ],
      statusCheckRollup: [],
      closingIssuesReferences: [{ number: 662, state: 'OPEN' }],
    });

    expect(result.workflowApprovalBlocked).toBe(true);
    expect(result.workflowApprovalOwner).toBe('hivemoot-heater');
    expect(result.reasons).toContain(
      'CI checks must be SUCCESS (found UNKNOWN)'
    );
    expect(result.reasons).toContain(
      'likely waiting on first-time fork workflow approval for hivemoot-heater'
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

  it('waives prefix requirement for feat: PR with 6+ approvals and no CHANGES_REQUESTED', () => {
    const approvers = Array.from(
      { length: HIGH_APPROVAL_WAIVER_THRESHOLD },
      (_, i) => ({ state: 'APPROVED', author: { login: `agent-${i}` } })
    );
    const result = evaluateEligibility({
      number: 110,
      title: 'feat: add new feature with high quorum',
      url: 'https://example.test/pr/110',
      latestReviews: approvers,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [],
    });

    expect(result.eligible).toBe(true);
    expect(result.highApprovalWaiver).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('does not waive prefix for feat: PR with fewer than 6 approvals', () => {
    const result = evaluateEligibility({
      number: 111,
      title: 'feat: add feature with insufficient quorum',
      url: 'https://example.test/pr/111',
      latestReviews: Array.from({ length: 5 }, (_, i) => ({
        state: 'APPROVED',
        author: { login: `agent-${i}` },
      })),
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      closingIssuesReferences: [{ number: 42, state: 'OPEN' }],
    });

    expect(result.eligible).toBe(false);
    expect(result.highApprovalWaiver).toBe(false);
    expect(result.reasons).toContain(
      `title prefix must be one of: ${ALLOWED_PREFIXES.join(', ')}`
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

  it('ignores non-github issue URL hosts and falls back to default repo', () => {
    const result = evaluateEligibility(
      {
        number: 108,
        title: 'fix: ignore non-github linked issue URLs',
        url: 'https://example.test/pr/108',
        latestReviews: [
          { state: 'APPROVED', author: { login: 'hivemoot-scout' } },
          { state: 'APPROVED', author: { login: 'hivemoot-builder' } },
        ],
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
        closingIssuesReferences: [
          {
            number: 556,
            state: 'OPEN',
            url: 'https://malicious.example/hivemoot/hivemoot/issues/556',
          },
        ],
      },
      new Map([
        ['hivemoot/colony#556', 'OPEN'],
        ['hivemoot/hivemoot#556', 'CLOSED'],
      ]),
      'hivemoot/colony'
    );

    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

describe('getWorkflowApprovalBlocker', () => {
  it('detects cross-repo PRs with no checks and unstable merge state', () => {
    expect(
      getWorkflowApprovalBlocker({
        number: 200,
        title: 'fix: queue blocker',
        url: 'https://example.test/pr/200',
        mergeStateStatus: 'UNSTABLE',
        headRepositoryOwner: { login: 'hivemoot-heater' },
        statusCheckRollup: [],
      })
    ).toBe('hivemoot-heater');
  });

  it('detects cross-repo PRs with no checks and clean merge state', () => {
    expect(
      getWorkflowApprovalBlocker({
        number: 203,
        title: 'fix: no required checks repo',
        url: 'https://example.test/pr/203',
        mergeStateStatus: 'CLEAN',
        headRepositoryOwner: { login: 'hivemoot-heater' },
        statusCheckRollup: [],
      })
    ).toBe('hivemoot-heater');
  });

  it('does not flag same-owner PRs or PRs that already have checks', () => {
    expect(
      getWorkflowApprovalBlocker({
        number: 201,
        title: 'fix: local branch',
        url: 'https://example.test/pr/201',
        mergeStateStatus: 'UNSTABLE',
        headRepositoryOwner: { login: 'hivemoot' },
        statusCheckRollup: [],
      })
    ).toBeNull();

    expect(
      getWorkflowApprovalBlocker({
        number: 202,
        title: 'fix: checks already ran',
        url: 'https://example.test/pr/202',
        mergeStateStatus: 'UNSTABLE',
        headRepositoryOwner: { login: 'hivemoot-heater' },
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      })
    ).toBeNull();
  });
});

describe('resolveIssueStates', () => {
  it('uses direct issue states without extra gh lookups', () => {
    const runGh = vi.fn();

    const states = resolveIssueStates(
      'hivemoot/colony',
      [
        {
          number: 200,
          title: 'fix: keep queue moving',
          url: 'https://example.test/pr/200',
          closingIssuesReferences: [
            { number: 441, state: 'OPEN' },
            { number: 662, state: 'CLOSED' },
          ],
        },
      ],
      runGh as unknown as typeof import('node:child_process').execFileSync
    );

    expect(states.get('hivemoot/colony#441')).toBe('OPEN');
    expect(states.get('hivemoot/colony#662')).toBe('CLOSED');
    expect(runGh).not.toHaveBeenCalled();
  });

  it('batches unresolved issue lookups into one GraphQL call', () => {
    const runGh = vi.fn(() =>
      JSON.stringify({
        data: {
          repo0: {
            issue0: { state: 'OPEN' },
            issue1: { state: 'CLOSED' },
          },
          repo1: {
            issue0: { state: 'OPEN' },
          },
        },
      })
    );

    const states = resolveIssueStates(
      'hivemoot/colony',
      [
        {
          number: 201,
          title: 'fix: batch issue state lookups',
          url: 'https://example.test/pr/201',
          closingIssuesReferences: [
            { number: 441 },
            { number: 483 },
            {
              number: 307,
              url: 'https://github.com/hivemoot/hivemoot/issues/307',
            },
          ],
        },
      ],
      runGh as unknown as typeof import('node:child_process').execFileSync
    );

    expect(runGh).toHaveBeenCalledTimes(1);
    expect(runGh.mock.calls[0][0]).toBe('gh');
    expect(runGh.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['api', 'graphql'])
    );
    expect(runGh.mock.calls[0][1][3]).toContain(
      'repo0: repository(owner: "hivemoot", name: "colony")'
    );
    expect(runGh.mock.calls[0][1][3]).toContain('issue0: issue(number: 441)');
    expect(runGh.mock.calls[0][1][3]).toContain('issue1: issue(number: 483)');
    expect(runGh.mock.calls[0][1][3]).toContain(
      'repo1: repository(owner: "hivemoot", name: "hivemoot")'
    );
    expect(states.get('hivemoot/colony#441')).toBe('OPEN');
    expect(states.get('hivemoot/colony#483')).toBe('CLOSED');
    expect(states.get('hivemoot/hivemoot#307')).toBe('OPEN');
  });
});

describe('parseArgs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid --limit value', () => {
    const opts = parseArgs(['--limit=50']);
    expect(opts.limit).toBe(50);
  });

  it('warns and ignores a partial-numeric --limit value (5oops)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = parseArgs(['--limit=5oops']);
    expect(opts.limit).toBe(DEFAULT_LIMIT);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('--limit="5oops"')
    );
  });

  it('warns and ignores a non-numeric --limit value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = parseArgs(['--limit=abc']);
    expect(opts.limit).toBe(DEFAULT_LIMIT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--limit="abc"'));
  });

  it('warns and ignores --limit=0 (not a positive integer)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = parseArgs(['--limit=0']);
    expect(opts.limit).toBe(DEFAULT_LIMIT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--limit="0"'));
  });
});
