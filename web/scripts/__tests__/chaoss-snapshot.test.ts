import { describe, it, expect } from 'vitest';
import type {
  ActivityData,
  Comment,
  Proposal,
  PullRequest,
} from '../../shared/types';
import { buildChaossSnapshot } from '../chaoss-snapshot';

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'test PR',
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

function makeReview(overrides: Partial<Comment> = {}): Comment {
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

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
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

const SOURCE = 'https://github.com/hivemoot/colony';

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('buildChaossSnapshot', () => {
  it('produces schema version 1 with correct top-level fields', () => {
    const snap = buildChaossSnapshot(makeData(), SOURCE);
    expect(snap.schemaVersion).toBe('1');
    expect(snap.computedAt).toBe('2026-02-14T01:00:00Z');
    expect(snap.source).toBe(SOURCE);
    expect(snap.dataWindowDays).toBe(0); // no proposals → 0-day window
  });

  it('all five metric keys are present', () => {
    const snap = buildChaossSnapshot(makeData(), SOURCE);
    const keys = Object.keys(snap.metrics);
    expect(keys).toContain('changeRequestDuration');
    expect(keys).toContain('changeRequestsAccepted');
    expect(keys).toContain('contributorConcentration');
    expect(keys).toContain('changeRequestReviews');
    expect(keys).toContain('contestedDecisionRate');
  });

  describe('changeRequestDuration', () => {
    it('returns null p50/p95 with no merged PRs', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.changeRequestDuration.p50Days).toBeNull();
      expect(snap.metrics.changeRequestDuration.p95Days).toBeNull();
      expect(snap.metrics.changeRequestDuration.sampleSize).toBe(0);
    });

    it('converts minutes to days correctly for a 1-day PR', () => {
      const data = makeData({ pullRequests: [makePr()] });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.changeRequestDuration.p50Days).toBe(1);
      expect(snap.metrics.changeRequestDuration.sampleSize).toBe(1);
    });

    it('excludes open PRs from the sample', () => {
      const data = makeData({
        pullRequests: [makePr({ state: 'open', mergedAt: null })],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.changeRequestDuration.sampleSize).toBe(0);
    });

    it('carries the correct CHAOSS annotation', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.changeRequestDuration['x-chaoss-metric']).toBe(
        'change-request-duration'
      );
      expect(snap.metrics.changeRequestDuration['x-chaoss-spec']).toMatch(
        /chaoss\.community/
      );
    });
  });

  describe('changeRequestsAccepted', () => {
    it('counts merged PRs', () => {
      const data = makeData({
        pullRequests: [
          makePr({ number: 1 }),
          makePr({ number: 2 }),
          makePr({ number: 3, state: 'open', mergedAt: null }),
        ],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.changeRequestsAccepted.count).toBe(2);
    });

    it('reflects dataWindowDays as windowDays', () => {
      const data = makeData({
        proposals: [
          makeProposal({ createdAt: '2026-02-01T00:00:00Z' }),
          makeProposal({
            number: 2,
            createdAt: '2026-02-11T00:00:00Z',
          }),
        ],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.changeRequestsAccepted.windowDays).toBe(
        snap.dataWindowDays
      );
      expect(snap.dataWindowDays).toBe(10);
    });
  });

  describe('contributorConcentration', () => {
    it('returns zero gini and zero topRoleShare with no proposals', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.contributorConcentration.giniCoefficient).toBe(0);
      expect(snap.metrics.contributorConcentration.topRoleShare).toBe(0);
      expect(snap.metrics.contributorConcentration.uniqueContributorRoles).toBe(
        0
      );
    });

    it('returns gini=0 when only one role authors proposals', () => {
      const data = makeData({
        proposals: [
          makeProposal({ number: 1, author: 'hivemoot-builder' }),
          makeProposal({ number: 2, author: 'hivemoot-builder' }),
        ],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.contributorConcentration.giniCoefficient).toBe(0);
      expect(snap.metrics.contributorConcentration.uniqueContributorRoles).toBe(
        1
      );
      expect(snap.metrics.contributorConcentration.topRoleShare).toBe(1);
    });

    it('carries the CHAOSS caveat note', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.contributorConcentration['x-chaoss-note']).toMatch(
        /Gini/
      );
    });
  });

  describe('changeRequestReviews', () => {
    it('returns 0 rate with no reviews', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.changeRequestReviews.crossRoleReviewRate).toBe(0);
      expect(snap.metrics.changeRequestReviews.sampleSize).toBe(0);
    });

    it('computes cross-role rate correctly', () => {
      // PR by builder reviewed by nurse (different roles → cross-role)
      const data = makeData({
        pullRequests: [makePr({ number: 1, author: 'hivemoot-builder' })],
        comments: [
          makeReview({ issueOrPrNumber: 1, author: 'hivemoot-nurse' }),
        ],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.changeRequestReviews.crossRoleReviewRate).toBe(1);
      expect(snap.metrics.changeRequestReviews.sampleSize).toBe(1);
    });

    it('marks same-role review as non-cross-role', () => {
      const data = makeData({
        pullRequests: [makePr({ number: 1, author: 'hivemoot-builder' })],
        comments: [
          makeReview({ issueOrPrNumber: 1, author: 'hivemoot-builder' }),
        ],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.changeRequestReviews.crossRoleReviewRate).toBe(0);
    });

    it('includes x-chaoss-note flagging scope difference from CHAOSS spec', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.changeRequestReviews['x-chaoss-note']).toMatch(
        /cross-role review fraction/
      );
    });
  });

  describe('contestedDecisionRate', () => {
    it('returns zero rate with no proposals', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.contestedDecisionRate.rate).toBe(0);
      expect(snap.metrics.contestedDecisionRate.totalVoted).toBe(0);
    });

    it('identifies contested proposals correctly', () => {
      const data = makeData({
        proposals: [
          makeProposal({
            number: 1,
            votesSummary: { thumbsUp: 3, thumbsDown: 1 },
          }),
          makeProposal({
            number: 2,
            votesSummary: { thumbsUp: 5, thumbsDown: 0 },
          }),
        ],
      });
      const snap = buildChaossSnapshot(data, SOURCE);
      expect(snap.metrics.contestedDecisionRate.contestedCount).toBe(1);
      expect(snap.metrics.contestedDecisionRate.totalVoted).toBe(2);
      expect(snap.metrics.contestedDecisionRate.rate).toBe(0.5);
    });

    it('marks x-chaoss-metric as null (Colony-native)', () => {
      const snap = buildChaossSnapshot(makeData(), SOURCE);
      expect(snap.metrics.contestedDecisionRate['x-chaoss-metric']).toBeNull();
      expect(snap.metrics.contestedDecisionRate['x-colony-metric']).toBe(
        'contested-decision-rate'
      );
    });
  });
});
