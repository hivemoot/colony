import { describe, it, expect } from 'vitest';
import type { Proposal, PullRequest } from '../types/activity';
import {
  buildDecisionSnapshot,
  findImplementingPullRequest,
} from './decision-explorer';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 192,
    title: 'Decision explorer',
    phase: 'ready-to-implement',
    author: 'hivemoot-builder',
    createdAt: '2026-02-09T10:00:00Z',
    commentCount: 5,
    ...overrides,
  };
}

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 300,
    title: 'feat: explorer',
    state: 'open',
    author: 'hivemoot-worker',
    createdAt: '2026-02-10T10:00:00Z',
    ...overrides,
  };
}

describe('findImplementingPullRequest', () => {
  it('finds linked PR via closing keyword in title', () => {
    const proposal = makeProposal({ number: 192 });
    const pr = makePR({ title: 'feat: add explorer (Fixes #192)' });

    expect(findImplementingPullRequest(proposal, [pr])?.number).toBe(300);
  });

  it('finds linked PR via closing keyword in body', () => {
    const proposal = makeProposal({ number: 157 });
    const pr = makePR({
      number: 301,
      title: 'docs: improve metadata',
      body: 'This change resolves #157',
    });

    expect(findImplementingPullRequest(proposal, [pr])?.number).toBe(301);
  });

  it('prefers merged PR when multiple candidates are linked', () => {
    const proposal = makeProposal({ number: 110 });
    const openPR = makePR({
      number: 302,
      title: 'feat: roadmap pass 1',
      body: 'Fixes #110',
      state: 'open',
    });
    const mergedPR = makePR({
      number: 303,
      title: 'feat: roadmap pass 2',
      body: 'Fixes #110',
      state: 'merged',
      mergedAt: '2026-02-10T12:00:00Z',
    });

    expect(
      findImplementingPullRequest(proposal, [openPR, mergedPR])?.number
    ).toBe(303);
  });
});

describe('buildDecisionSnapshot', () => {
  it('includes current proposal phase when transitions are missing', () => {
    const snapshot = buildDecisionSnapshot(
      makeProposal({
        phase: 'ready-to-implement',
        phaseTransitions: undefined,
      }),
      []
    );

    expect(snapshot.timeline).toHaveLength(2);
    expect(snapshot.timeline[0].phase).toBe('discussion');
    expect(snapshot.timeline[1].phase).toBe('ready-to-implement');
  });

  it('builds timeline durations from phase transitions', () => {
    const snapshot = buildDecisionSnapshot(
      makeProposal({
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-09T10:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-09T12:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-09T16:30:00Z' },
        ],
      }),
      []
    );

    expect(snapshot.timeline).toHaveLength(3);
    expect(snapshot.timeline[0].durationToNext).toBe('2h');
    expect(snapshot.timeline[1].durationToNext).toBe('4h 30m');
    expect(snapshot.timeline[2].durationToNext).toBeNull();
  });

  it('prepends discussion when timeline starts later', () => {
    const snapshot = buildDecisionSnapshot(
      makeProposal({
        createdAt: '2026-02-09T10:00:00Z',
        phaseTransitions: [
          { phase: 'voting', enteredAt: '2026-02-09T12:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-09T16:00:00Z' },
        ],
      }),
      []
    );

    expect(snapshot.timeline[0].phase).toBe('discussion');
    expect(snapshot.timeline[0].durationToNext).toBe('2h');
  });

  it('sorts transitions chronologically before building timeline', () => {
    const snapshot = buildDecisionSnapshot(
      makeProposal({
        phase: 'ready-to-implement',
        phaseTransitions: [
          { phase: 'ready-to-implement', enteredAt: '2026-02-09T16:00:00Z' },
          { phase: 'discussion', enteredAt: '2026-02-09T10:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-09T12:00:00Z' },
        ],
      }),
      []
    );

    expect(snapshot.timeline.map((item) => item.phase)).toEqual([
      'discussion',
      'voting',
      'ready-to-implement',
    ]);
  });

  it('computes vote totals and support percentage', () => {
    const snapshot = buildDecisionSnapshot(
      makeProposal({
        votesSummary: {
          thumbsUp: 9,
          thumbsDown: 3,
        },
      }),
      []
    );

    expect(snapshot.votes.total).toBe(12);
    expect(snapshot.votes.supportPct).toBe(0.75);
  });
});
