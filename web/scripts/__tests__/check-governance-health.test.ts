import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ActivityData,
  Comment,
  Proposal,
  PullRequest,
} from '../../shared/types';
import {
  buildHealthReport,
  computeCrossRoleReviewRate,
  computeDataWindowDays,
  computeGini,
  computeMergeBacklogDepth,
  computeMergeLatency,
  computeContestedRate,
  computePrCycleTime,
  computeReviewLatency,
  computeRoleDiversity,
  computeVoterParticipationRate,
  extractRole,
  hadQuorumFailure,
  inferEligibleVoterCount,
  parseArgs,
  percentile,
  resolveActivityFile,
} from '../check-governance-health';

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'test',
    state: 'merged',
    author: 'hivemoot-builder',
    createdAt: '2026-02-01T00:00:00Z',
    mergedAt: '2026-02-02T00:00:00Z', // 1 day = 1440 min
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'test proposal',
    phase: 'implemented',
    author: 'hivemoot-builder',
    createdAt: '2026-02-01T00:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    issueOrPrNumber: 1,
    type: 'review',
    author: 'hivemoot-nurse',
    body: 'LGTM',
    createdAt: '2026-02-01T12:00:00Z',
    url: 'https://github.com/hivemoot/colony/pull/1#pullrequestreview-1',
    ...overrides,
  };
}

function minimalData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-14T01:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 5,
      forks: 1,
      openIssues: 0,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    proposals: [],
    comments: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function stubProcessExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit);
}

// ──────────────────────────────────────────────
// parseArgs
// ──────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults to text output', () => {
    expect(parseArgs([])).toEqual({ json: false });
  });

  it('enables json output with --json', () => {
    expect(parseArgs(['--json'])).toEqual({ json: true });
  });

  it('prints help and exits 0 for --help', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = stubProcessExit();

    expect(() => parseArgs(['--help'])).toThrow('process.exit:0');
    expect(logSpy).toHaveBeenCalledWith(
      'Usage: npm run check-governance-health -- [--json]'
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('rejects unknown flags', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = stubProcessExit();

    expect(() => parseArgs(['--jsom'])).toThrow('process.exit:1');
    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown argument "--jsom". Expected --json or --help.'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ──────────────────────────────────────────────
// extractRole
// ──────────────────────────────────────────────

describe('extractRole', () => {
  it('extracts role from hivemoot-* login', () => {
    expect(extractRole('hivemoot-forager')).toBe('forager');
    expect(extractRole('hivemoot-builder')).toBe('builder');
    expect(extractRole('hivemoot-nurse')).toBe('nurse');
  });

  it('returns null for non-hivemoot logins', () => {
    expect(extractRole('octocat')).toBeNull();
    expect(extractRole('hivemoot')).toBeNull(); // no dash suffix
    expect(extractRole('')).toBeNull();
  });
});

// ──────────────────────────────────────────────
// percentile
// ──────────────────────────────────────────────

describe('percentile', () => {
  it('returns null for empty array', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('returns single element for any percentile', () => {
    expect(percentile([100], 50)).toBe(100);
    expect(percentile([100], 95)).toBe(100);
  });

  it('computes median of sorted array', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  it('computes p95 of sorted array', () => {
    // 10-element array, p95 → index ceil(9.5)-1 = 9 → last element
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    expect(percentile(sorted, 95)).toBe(100);
  });
});

// ──────────────────────────────────────────────
// computeGini
// ──────────────────────────────────────────────

describe('computeGini', () => {
  it('returns 0 for empty or single-element array', () => {
    expect(computeGini([])).toBe(0);
    expect(computeGini([10])).toBe(0);
  });

  it('returns 0 for perfectly equal distribution', () => {
    expect(computeGini([5, 5, 5, 5])).toBe(0);
  });

  it('returns 0 for all-zero values', () => {
    expect(computeGini([0, 0, 0])).toBe(0);
  });

  it('returns near 1 for maximum concentration', () => {
    // One agent has everything, others have 0
    const gini = computeGini([0, 0, 0, 100]);
    expect(gini).toBeGreaterThan(0.7);
  });

  it('returns a value between 0 and 1 for mixed distribution', () => {
    const gini = computeGini([10, 20, 30, 40]);
    expect(gini).toBeGreaterThan(0);
    expect(gini).toBeLessThan(1);
  });
});

// ──────────────────────────────────────────────
// computePrCycleTime
// ──────────────────────────────────────────────

describe('computePrCycleTime', () => {
  it('returns null p50/p95 and zero sample for empty PRs', () => {
    const result = computePrCycleTime([]);
    expect(result.p50).toBeNull();
    expect(result.p95).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  it('ignores open and closed (not merged) PRs', () => {
    const result = computePrCycleTime([
      makePr({ state: 'open', mergedAt: null }),
      makePr({ state: 'closed', mergedAt: null }),
    ]);
    expect(result.sampleSize).toBe(0);
  });

  it('computes cycle time for a single merged PR', () => {
    const pr = makePr({
      createdAt: '2026-02-01T00:00:00Z',
      mergedAt: '2026-02-02T00:00:00Z', // 1440 minutes
    });
    const result = computePrCycleTime([pr]);
    expect(result.p50).toBe(1440);
    expect(result.p95).toBe(1440);
    expect(result.sampleSize).toBe(1);
  });

  it('computes p50 and p95 for multiple PRs', () => {
    const prs = [
      makePr({
        number: 1,
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-02T00:00:00Z',
      }), // 1440 min
      makePr({
        number: 2,
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-03T00:00:00Z',
      }), // 2880 min
      makePr({
        number: 3,
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-08T00:00:00Z',
      }), // 10080 min
    ];
    const result = computePrCycleTime(prs);
    expect(result.sampleSize).toBe(3);
    expect(result.p50).toBe(2880); // median
    expect(result.p95).toBe(10080); // max in 3-element array
  });

  it('ignores PRs with negative cycle time (clock skew)', () => {
    const pr = makePr({
      createdAt: '2026-02-02T00:00:00Z',
      mergedAt: '2026-02-01T00:00:00Z', // merged before created
    });
    const result = computePrCycleTime([pr]);
    expect(result.sampleSize).toBe(0);
  });
});

describe('computeReviewLatency', () => {
  it('computes open-to-first-approval latency for merged PRs', () => {
    const prs = [
      makePr({
        number: 1,
        createdAt: '2026-02-01T00:00:00Z',
        firstApprovalAt: '2026-02-01T12:00:00Z',
      }),
      makePr({
        number: 2,
        createdAt: '2026-02-01T00:00:00Z',
        firstApprovalAt: '2026-02-02T00:00:00Z',
      }),
    ];

    const result = computeReviewLatency(prs);
    expect(result.sampleSize).toBe(2);
    expect(result.p50).toBe(720);
    expect(result.p95).toBe(1440);
  });

  it('ignores PRs without approval timestamps', () => {
    const result = computeReviewLatency([makePr({ firstApprovalAt: null })]);
    expect(result.sampleSize).toBe(0);
    expect(result.p50).toBeNull();
  });
});

describe('computeMergeLatency', () => {
  it('computes first-approval-to-merge latency for merged PRs', () => {
    const prs = [
      makePr({
        number: 1,
        firstApprovalAt: '2026-02-01T12:00:00Z',
        mergedAt: '2026-02-02T00:00:00Z',
      }),
      makePr({
        number: 2,
        firstApprovalAt: '2026-02-01T06:00:00Z',
        mergedAt: '2026-02-03T00:00:00Z',
      }),
    ];

    const result = computeMergeLatency(prs);
    expect(result.sampleSize).toBe(2);
    expect(result.p50).toBe(720);
    expect(result.p95).toBe(2520);
  });

  it('ignores negative approval-to-merge durations', () => {
    const result = computeMergeLatency([
      makePr({
        firstApprovalAt: '2026-02-03T00:00:00Z',
        mergedAt: '2026-02-02T00:00:00Z',
      }),
    ]);
    expect(result.sampleSize).toBe(0);
  });
});

describe('computeMergeBacklogDepth', () => {
  it('counts approved open PRs and reports the oldest age in hours', () => {
    const result = computeMergeBacklogDepth(
      [
        makePr({
          number: 1,
          state: 'open',
          mergedAt: null,
          firstApprovalAt: '2026-02-02T00:00:00Z',
        }),
        makePr({
          number: 2,
          state: 'open',
          mergedAt: null,
          firstApprovalAt: '2026-02-04T00:00:00Z',
        }),
        makePr({
          number: 3,
          state: 'open',
          mergedAt: null,
          firstApprovalAt: null,
        }),
      ],
      '2026-02-05T00:00:00Z'
    );

    expect(result.depth).toBe(2);
    expect(result.eldestApprovedHours).toBe(72);
  });

  it('returns null eldest age when no approved open PRs exist', () => {
    const result = computeMergeBacklogDepth(
      [makePr({ state: 'open', mergedAt: null, firstApprovalAt: null })],
      '2026-02-05T00:00:00Z'
    );
    expect(result.depth).toBe(0);
    expect(result.eldestApprovedHours).toBeNull();
  });
});

// ──────────────────────────────────────────────
// computeRoleDiversity
// ──────────────────────────────────────────────

describe('computeRoleDiversity', () => {
  it('returns zero values for empty proposals', () => {
    const result = computeRoleDiversity([]);
    expect(result.uniqueRoles).toBe(0);
    expect(result.topRole).toBeNull();
    expect(result.topRoleShare).toBe(0);
  });

  it('identifies single role correctly', () => {
    const proposals = [
      makeProposal({ author: 'hivemoot-builder' }),
      makeProposal({ author: 'hivemoot-builder' }),
    ];
    const result = computeRoleDiversity(proposals);
    expect(result.uniqueRoles).toBe(1);
    expect(result.topRole).toBe('builder');
    expect(result.topRoleShare).toBe(1);
    expect(result.giniIndex).toBe(0); // one role = no inequality
  });

  it('counts multiple roles correctly', () => {
    const proposals = [
      makeProposal({ author: 'hivemoot-builder' }),
      makeProposal({ author: 'hivemoot-builder' }),
      makeProposal({ author: 'hivemoot-forager' }),
      makeProposal({ author: 'hivemoot-nurse' }),
    ];
    const result = computeRoleDiversity(proposals);
    expect(result.uniqueRoles).toBe(3);
    expect(result.topRole).toBe('builder');
    expect(result.topRoleShare).toBeCloseTo(0.5);
    expect(result.giniIndex).toBeGreaterThan(0);
  });

  it('bins non-hivemoot authors as a single external role', () => {
    const proposals = [
      makeProposal({ author: 'external-contributor' }),
      makeProposal({ author: 'another-outsider' }),
      makeProposal({ author: 'hivemoot-builder' }),
    ];
    const result = computeRoleDiversity(proposals);
    // Both external logins map to 'external', so there are 2 unique roles
    expect(result.uniqueRoles).toBe(2);
    expect(result.topRole).toBe('external'); // 2 external vs 1 builder
  });
});

// ──────────────────────────────────────────────
// computeContestedRate
// ──────────────────────────────────────────────

describe('computeContestedRate', () => {
  it('returns zeros for no proposals', () => {
    const result = computeContestedRate([]);
    expect(result.contestedCount).toBe(0);
    expect(result.totalVoted).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('excludes proposals without votesSummary', () => {
    const result = computeContestedRate([
      makeProposal({ phase: 'discussion' }), // no votesSummary
    ]);
    expect(result.totalVoted).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('identifies contested proposals (thumbsDown > 0)', () => {
    const result = computeContestedRate([
      makeProposal({ votesSummary: { thumbsUp: 3, thumbsDown: 1 } }),
      makeProposal({ votesSummary: { thumbsUp: 4, thumbsDown: 0 } }),
    ]);
    expect(result.contestedCount).toBe(1);
    expect(result.totalVoted).toBe(2);
    expect(result.rate).toBeCloseTo(0.5);
  });

  it('returns 0 rate when all voted proposals are unanimous', () => {
    const result = computeContestedRate([
      makeProposal({ votesSummary: { thumbsUp: 5, thumbsDown: 0 } }),
      makeProposal({ votesSummary: { thumbsUp: 3, thumbsDown: 0 } }),
    ]);
    expect(result.contestedCount).toBe(0);
    expect(result.rate).toBe(0);
  });
});

// ──────────────────────────────────────────────
// computeCrossRoleReviewRate
// ──────────────────────────────────────────────

describe('computeCrossRoleReviewRate', () => {
  it('returns zeros with no reviews', () => {
    const result = computeCrossRoleReviewRate([], []);
    expect(result.crossRoleCount).toBe(0);
    expect(result.totalReviews).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('ignores non-review comments', () => {
    const comments: Comment[] = [
      makeComment({ type: 'issue' }),
      makeComment({ type: 'pr' }),
      makeComment({ type: 'proposal' }),
    ];
    const result = computeCrossRoleReviewRate([], comments);
    expect(result.totalReviews).toBe(0);
  });

  it('ignores reviews not matched to a known PR', () => {
    const comment = makeComment({ issueOrPrNumber: 999 }); // unknown PR
    const result = computeCrossRoleReviewRate([], [comment]);
    expect(result.totalReviews).toBe(0);
  });

  it('identifies cross-role review when roles differ', () => {
    const pr = makePr({ number: 1, author: 'hivemoot-builder' });
    const review = makeComment({
      issueOrPrNumber: 1,
      author: 'hivemoot-nurse', // different role
    });
    const result = computeCrossRoleReviewRate([pr], [review]);
    expect(result.crossRoleCount).toBe(1);
    expect(result.totalReviews).toBe(1);
    expect(result.rate).toBe(1);
  });

  it('does not count same-role review as cross-role', () => {
    const pr = makePr({ number: 1, author: 'hivemoot-builder' });
    const review = makeComment({
      issueOrPrNumber: 1,
      author: 'hivemoot-builder', // same role
    });
    const result = computeCrossRoleReviewRate([pr], [review]);
    expect(result.crossRoleCount).toBe(0);
    expect(result.totalReviews).toBe(1);
    expect(result.rate).toBe(0);
  });

  it('excludes reviews from parties without a known hivemoot role from denominator', () => {
    const pr = makePr({ number: 1, author: 'hivemoot-builder' });
    const botReview = makeComment({
      id: 1,
      issueOrPrNumber: 1,
      author: 'hivemoot', // queen bot — no role suffix
    });
    const crossRoleReview = makeComment({
      id: 2,
      issueOrPrNumber: 1,
      author: 'hivemoot-nurse',
    });
    const result = computeCrossRoleReviewRate(
      [pr],
      [botReview, crossRoleReview]
    );
    // Bot review excluded from denominator; only the nurse review counts
    expect(result.totalReviews).toBe(1);
    expect(result.crossRoleCount).toBe(1);
    expect(result.rate).toBe(1);
  });

  it('handles mix of cross-role and same-role reviews', () => {
    const prs = [
      makePr({ number: 1, author: 'hivemoot-builder' }),
      makePr({ number: 2, author: 'hivemoot-forager' }),
    ];
    const comments: Comment[] = [
      makeComment({ id: 1, issueOrPrNumber: 1, author: 'hivemoot-nurse' }), // cross-role
      makeComment({ id: 2, issueOrPrNumber: 1, author: 'hivemoot-builder' }), // same-role
      makeComment({ id: 3, issueOrPrNumber: 2, author: 'hivemoot-builder' }), // cross-role
    ];
    const result = computeCrossRoleReviewRate(prs, comments);
    expect(result.totalReviews).toBe(3);
    expect(result.crossRoleCount).toBe(2);
    expect(result.rate).toBeCloseTo(2 / 3);
  });
});

// ──────────────────────────────────────────────
// computeDataWindowDays
// ──────────────────────────────────────────────

describe('computeDataWindowDays', () => {
  it('returns 0 for empty proposals', () => {
    expect(computeDataWindowDays([])).toBe(0);
  });

  it('returns 0 for single proposal', () => {
    expect(computeDataWindowDays([makeProposal()])).toBe(0);
  });

  it('computes days between earliest and latest proposal', () => {
    const proposals = [
      makeProposal({ createdAt: '2026-02-01T00:00:00Z' }),
      makeProposal({ createdAt: '2026-02-11T00:00:00Z' }), // 10 days later
    ];
    expect(computeDataWindowDays(proposals)).toBe(10);
  });
});

// ──────────────────────────────────────────────
// hadQuorumFailure
// ──────────────────────────────────────────────

describe('hadQuorumFailure', () => {
  it('returns true when current phase is extended-voting', () => {
    expect(hadQuorumFailure(makeProposal({ phase: 'extended-voting' }))).toBe(
      true
    );
  });

  it('returns true when phaseTransitions includes extended-voting', () => {
    expect(
      hadQuorumFailure(
        makeProposal({
          phase: 'ready-to-implement',
          phaseTransitions: [
            { phase: 'voting', enteredAt: '2026-02-01T00:00:00Z' },
            { phase: 'extended-voting', enteredAt: '2026-02-03T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-05T00:00:00Z' },
          ],
        })
      )
    ).toBe(true);
  });

  it('returns false when extended-voting is absent from transitions', () => {
    expect(
      hadQuorumFailure(
        makeProposal({
          phase: 'ready-to-implement',
          phaseTransitions: [
            { phase: 'voting', enteredAt: '2026-02-01T00:00:00Z' },
            { phase: 'ready-to-implement', enteredAt: '2026-02-03T00:00:00Z' },
          ],
        })
      )
    ).toBe(false);
  });

  it('returns false when phaseTransitions is absent', () => {
    expect(hadQuorumFailure(makeProposal({ phase: 'implemented' }))).toBe(
      false
    );
  });
});

// ──────────────────────────────────────────────
// inferEligibleVoterCount
// ──────────────────────────────────────────────

describe('inferEligibleVoterCount', () => {
  it('returns 1 for empty proposals', () => {
    expect(inferEligibleVoterCount([])).toBe(1);
  });

  it('returns 1 when no proposals have votesSummary', () => {
    expect(inferEligibleVoterCount([makeProposal()])).toBe(1);
  });

  it('returns max total votes across cycles', () => {
    const proposals = [
      makeProposal({ votesSummary: { thumbsUp: 2, thumbsDown: 0 } }),
      makeProposal({ votesSummary: { thumbsUp: 3, thumbsDown: 1 } }), // 4 total
      makeProposal({ votesSummary: { thumbsUp: 1, thumbsDown: 0 } }),
    ];
    expect(inferEligibleVoterCount(proposals)).toBe(4);
  });
});

// ──────────────────────────────────────────────
// computeVoterParticipationRate
// ──────────────────────────────────────────────

describe('computeVoterParticipationRate', () => {
  it('returns null averageParticipationRate and zero quorumFailureRate for no voted proposals', () => {
    const result = computeVoterParticipationRate([], 2);
    expect(result.votingCyclesAnalyzed).toBe(0);
    expect(result.averageParticipationRate).toBeNull();
    expect(result.quorumFailureRate).toBe(0);
    expect(result.eligibleVoterCount).toBe(2);
  });

  it('excludes proposals without votesSummary', () => {
    const result = computeVoterParticipationRate(
      [makeProposal({ phase: 'discussion' })],
      2
    );
    expect(result.votingCyclesAnalyzed).toBe(0);
  });

  it('computes correct averageParticipationRate', () => {
    const proposals = [
      makeProposal({ votesSummary: { thumbsUp: 2, thumbsDown: 0 } }), // 2/4 = 0.5
      makeProposal({ votesSummary: { thumbsUp: 4, thumbsDown: 0 } }), // 4/4 = 1.0
    ];
    const result = computeVoterParticipationRate(proposals, 4);
    expect(result.votingCyclesAnalyzed).toBe(2);
    expect(result.averageParticipationRate).toBeCloseTo(0.75);
    expect(result.quorumFailureRate).toBe(0);
  });

  it('caps participation rate at 1 when votes exceed eligibleVoterCount', () => {
    const proposals = [
      makeProposal({ votesSummary: { thumbsUp: 5, thumbsDown: 0 } }),
    ];
    const result = computeVoterParticipationRate(proposals, 2);
    expect(result.averageParticipationRate).toBe(1);
  });

  it('computes quorumFailureRate from extended-voting transitions', () => {
    const proposals = [
      makeProposal({
        number: 1,
        votesSummary: { thumbsUp: 2, thumbsDown: 0 },
        phaseTransitions: [
          { phase: 'voting', enteredAt: '2026-02-01T00:00:00Z' },
          { phase: 'extended-voting', enteredAt: '2026-02-03T00:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-05T00:00:00Z' },
        ],
        phase: 'ready-to-implement',
      }),
      makeProposal({
        number: 2,
        votesSummary: { thumbsUp: 3, thumbsDown: 0 },
        phase: 'ready-to-implement',
      }),
    ];
    const result = computeVoterParticipationRate(proposals, 3);
    expect(result.quorumFailureRate).toBeCloseTo(0.5);
  });
});

// ──────────────────────────────────────────────
// buildHealthReport
// ──────────────────────────────────────────────

describe('buildHealthReport', () => {
  it('produces a report with all metric fields for empty data', () => {
    const report = buildHealthReport(minimalData());
    expect(report.generatedAt).toBeTruthy();
    expect(report.dataWindowDays).toBe(0);
    expect(report.metrics.prCycleTime).toBeDefined();
    expect(report.metrics.reviewLatency).toBeDefined();
    expect(report.metrics.mergeLatency).toBeDefined();
    expect(report.metrics.mergeBacklogDepth).toBeDefined();
    expect(report.metrics.roleDiversity).toBeDefined();
    expect(report.metrics.contestedDecisionRate).toBeDefined();
    expect(report.metrics.crossRoleReviewRate).toBeDefined();
    expect(report.metrics.voterParticipationRate).toBeDefined();
    expect(report.warnings).toBeInstanceOf(Array);
    expect(report.recommendations).toBeInstanceOf(Array);
  });

  it('recommendations and warnings have the same length', () => {
    const longPrs = Array.from({ length: 5 }, (_, i) =>
      makePr({
        number: i + 1,
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-15T00:00:00Z',
      })
    );
    const report = buildHealthReport(minimalData({ pullRequests: longPrs }));
    expect(report.recommendations).toHaveLength(report.warnings.length);
  });

  it('emits no warnings for healthy data', () => {
    const prs = Array.from({ length: 10 }, (_, i) =>
      makePr({
        number: i + 1,
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-02T00:00:00Z', // 1 day each
      })
    );
    const proposals = [
      makeProposal({
        author: 'hivemoot-builder',
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
      }),
      makeProposal({
        author: 'hivemoot-forager',
        votesSummary: { thumbsUp: 4, thumbsDown: 1 },
      }),
      makeProposal({
        author: 'hivemoot-nurse',
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
      }),
      makeProposal({
        author: 'hivemoot-heater',
        votesSummary: { thumbsUp: 2, thumbsDown: 1 },
      }),
      makeProposal({
        author: 'hivemoot-scout',
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
      }),
    ];
    const comments = prs.flatMap((pr) => [
      makeComment({
        id: pr.number * 10,
        issueOrPrNumber: pr.number,
        author: 'hivemoot-nurse',
      }),
      makeComment({
        id: pr.number * 10 + 1,
        issueOrPrNumber: pr.number,
        author: 'hivemoot-forager',
      }),
    ]);
    const report = buildHealthReport(
      minimalData({ pullRequests: prs, proposals, comments })
    );
    expect(report.warnings).toHaveLength(0);
    expect(report.recommendations).toHaveLength(0);
  });

  it('emits PR cycle time warning when p95 exceeds 7 days', () => {
    const longPrs = Array.from({ length: 5 }, (_, i) =>
      makePr({
        number: i + 1,
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-15T00:00:00Z', // 14 days
      })
    );
    const report = buildHealthReport(minimalData({ pullRequests: longPrs }));
    expect(report.warnings.some((w) => w.includes('PR cycle time'))).toBe(true);
    expect(
      report.recommendations.some((r) => r.includes('hivemoot:merge-ready'))
    ).toBe(true);
  });

  it('emits role concentration warning when top role > 60%', () => {
    const proposals = Array.from({ length: 10 }, () =>
      makeProposal({ author: 'hivemoot-builder' })
    );
    const report = buildHealthReport(minimalData({ proposals }));
    expect(report.warnings.some((w) => w.includes('Role concentration'))).toBe(
      true
    );
    expect(
      report.recommendations.some((r) => r.includes('hivemoot:discussion'))
    ).toBe(true);
    expect(report.recommendations.some((r) => r.includes('builder'))).toBe(
      true
    );
  });

  it('emits contested rate warning when rate < 10% with enough sample', () => {
    const proposals = Array.from({ length: 10 }, (_, i) =>
      makeProposal({
        number: i + 1,
        votesSummary: { thumbsUp: 5, thumbsDown: 0 }, // no opposition
      })
    );
    const report = buildHealthReport(minimalData({ proposals }));
    expect(
      report.warnings.some((w) => w.includes('Contested decision rate'))
    ).toBe(true);
    expect(
      report.recommendations.some((r) => r.includes('rubber-stamping'))
    ).toBe(true);
  });

  it('emits cross-role warning when rate < 30% with enough reviews', () => {
    const prs = Array.from({ length: 5 }, (_, i) =>
      makePr({ number: i + 1, author: 'hivemoot-builder' })
    );
    // All reviews from same role (builder reviewing builder)
    const comments = prs.flatMap((pr) =>
      Array.from({ length: 2 }, (_, j) =>
        makeComment({
          id: pr.number * 10 + j,
          issueOrPrNumber: pr.number,
          author: 'hivemoot-builder', // same role
        })
      )
    );
    const report = buildHealthReport(
      minimalData({ pullRequests: prs, comments })
    );
    expect(
      report.warnings.some((w) => w.includes('Cross-role review rate'))
    ).toBe(true);
    expect(
      report.recommendations.some((r) => r.includes('hivemoot:candidate'))
    ).toBe(true);
  });

  it('emits voter participation warning when avg rate < 50% with enough cycles', () => {
    // 3 cycles, each with 1 out of 4 eligible voters participating (25%)
    const proposals = Array.from({ length: 3 }, (_, i) =>
      makeProposal({
        number: i + 1,
        votesSummary: { thumbsUp: 1, thumbsDown: 0 },
      })
    );
    const report = buildHealthReport(minimalData({ proposals }), {
      COLONY_ELIGIBLE_VOTERS: '4',
    });
    expect(
      report.warnings.some((w) => w.includes('Voter participation rate'))
    ).toBe(true);
    const recommendation = report.recommendations.find((r) =>
      r.includes('inactive voters')
    );
    expect(recommendation).toContain('hivemoot:voting');
    expect(recommendation).toContain('hivemoot:extended-voting');
  });

  it('does not emit voter participation warning when avg rate >= 50%', () => {
    const proposals = Array.from({ length: 3 }, (_, i) =>
      makeProposal({
        number: i + 1,
        votesSummary: { thumbsUp: 2, thumbsDown: 0 },
      })
    );
    const report = buildHealthReport(minimalData({ proposals }), {
      COLONY_ELIGIBLE_VOTERS: '2',
    });
    expect(
      report.warnings.some((w) => w.includes('Voter participation rate'))
    ).toBe(false);
  });

  it('does not emit voter participation warning with fewer than 3 voting cycles', () => {
    const proposals = Array.from({ length: 2 }, (_, i) =>
      makeProposal({
        number: i + 1,
        votesSummary: { thumbsUp: 1, thumbsDown: 0 },
      })
    );
    const report = buildHealthReport(minimalData({ proposals }), {
      COLONY_ELIGIBLE_VOTERS: '4',
    });
    expect(
      report.warnings.some((w) => w.includes('Voter participation rate'))
    ).toBe(false);
  });

  it('uses agents.length as denominator when COLONY_ELIGIBLE_VOTERS is unset', () => {
    // 7 agents configured, every proposal gets exactly 2 votes.
    // With the old peak-votes fallback, eligible = 2, participation = 100% — no warning.
    // With agents.length fallback, eligible = 7, participation ≈ 29% — warning fires.
    const agents = Array.from({ length: 7 }, (_, i) => ({
      login: `hivemoot-agent-${i}`,
    }));
    const proposals = Array.from({ length: 3 }, (_, i) =>
      makeProposal({
        number: i + 1,
        votesSummary: { thumbsUp: 2, thumbsDown: 0 },
      })
    );
    const report = buildHealthReport(
      minimalData({ agents, proposals }),
      {} // no COLONY_ELIGIBLE_VOTERS
    );
    const metric = report.metrics.voterParticipationRate;
    expect(metric.eligibleVoterCount).toBe(7);
    expect(metric.averageParticipationRate).toBeCloseTo(2 / 7);
    expect(
      report.warnings.some((w) => w.includes('Voter participation rate'))
    ).toBe(true);
    const recommendation = report.recommendations.find((r) =>
      r.includes('inactive voters')
    );
    expect(recommendation).toContain('hivemoot:voting');
    expect(recommendation).toContain('hivemoot:extended-voting');
  });

  it('does not emit contested warning with fewer than 5 voted proposals', () => {
    const proposals = Array.from({ length: 4 }, (_, i) =>
      makeProposal({
        number: i + 1,
        votesSummary: { thumbsUp: 5, thumbsDown: 0 },
      })
    );
    const report = buildHealthReport(minimalData({ proposals }));
    expect(
      report.warnings.some((w) => w.includes('Contested decision rate'))
    ).toBe(false);
  });

  it('emits merge latency warning when p95 exceeds 48 hours', () => {
    const prs = Array.from({ length: 3 }, (_, i) =>
      makePr({
        number: i + 1,
        firstApprovalAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-04T00:00:00Z',
      })
    );
    const report = buildHealthReport(minimalData({ pullRequests: prs }));
    expect(report.warnings.some((w) => w.includes('Merge latency'))).toBe(true);
  });

  it('emits merge backlog warning when approved open PR depth exceeds threshold', () => {
    const prs = Array.from({ length: 11 }, (_, i) =>
      makePr({
        number: i + 1,
        state: 'open',
        mergedAt: null,
        firstApprovalAt: '2026-02-10T00:00:00Z',
      })
    );
    const report = buildHealthReport(
      minimalData({
        generatedAt: '2026-02-14T01:00:00Z',
        pullRequests: prs,
      })
    );
    expect(report.warnings.some((w) => w.includes('Merge backlog depth'))).toBe(
      true
    );
  });
});

// ──────────────────────────────────────────────
// resolveActivityFile
// ──────────────────────────────────────────────

describe('resolveActivityFile', () => {
  it('uses ACTIVITY_FILE env var when set', () => {
    const result = resolveActivityFile({
      ACTIVITY_FILE: '/custom/path/activity.json',
    });
    expect(result).toBe('/custom/path/activity.json');
  });

  it('falls back to default path when env var not set', () => {
    const result = resolveActivityFile({});
    expect(result).toContain('activity.json');
    expect(result).toContain('public');
  });
});
