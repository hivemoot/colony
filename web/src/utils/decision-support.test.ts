import { describe, it, expect } from 'vitest';
import type {
  ActivityData,
  Proposal,
  PullRequest,
  Comment,
} from '../types/activity';
import {
  detectBottlenecks,
  suggestActions,
  type Bottleneck,
} from './decision-support';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Test proposal',
    phase: 'discussion',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 100,
    title: 'Test PR',
    state: 'open',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    issueOrPrNumber: 1,
    type: 'proposal',
    author: 'agent-a',
    body: 'A comment',
    createdAt: '2026-02-05T09:00:00Z',
    url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-1',
    ...overrides,
  };
}

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-07T10:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    comments: [],
    proposals: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// detectBottlenecks
// ──────────────────────────────────────────────

describe('detectBottlenecks', () => {
  it('returns empty array when there is no data', () => {
    const data = makeActivityData();
    expect(detectBottlenecks(data)).toEqual([]);
  });

  it('detects unclaimed ready-to-implement proposals', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({ number: 10, phase: 'ready-to-implement' }),
        makeProposal({ number: 11, phase: 'ready-to-implement' }),
        makeProposal({ number: 12, phase: 'discussion' }),
      ],
      pullRequests: [],
    });

    const bottlenecks = detectBottlenecks(data);
    const unclaimed = bottlenecks.find((b) => b.type === 'unclaimed-work');
    expect(unclaimed).toBeDefined();
    expect(unclaimed?.items).toHaveLength(2);
    expect(unclaimed?.items.map((i) => i.number)).toEqual([10, 11]);
  });

  it('excludes ready-to-implement proposals that have a linked open PR', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 10,
          title: 'Add feature X',
          phase: 'ready-to-implement',
        }),
        makeProposal({
          number: 11,
          title: 'Add feature Y',
          phase: 'ready-to-implement',
        }),
      ],
      pullRequests: [
        makePR({
          number: 50,
          title: 'feat: implement feature X (Fixes #10)',
          state: 'open',
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const unclaimed = bottlenecks.find((b) => b.type === 'unclaimed-work');
    expect(unclaimed).toBeDefined();
    // #10 is claimed (has PR #50 referencing it), #11 is unclaimed
    expect(unclaimed?.items).toHaveLength(1);
    expect(unclaimed?.items[0].number).toBe(11);
  });

  it('detects stalled discussions with no recent comments', () => {
    const now = new Date('2026-02-07T10:00:00Z');
    const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48h ago
    const recentDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12h ago

    const data = makeActivityData({
      generatedAt: now.toISOString(),
      proposals: [
        makeProposal({
          number: 20,
          phase: 'discussion',
          createdAt: staleDate.toISOString(),
        }),
        makeProposal({
          number: 21,
          phase: 'discussion',
          createdAt: staleDate.toISOString(),
        }),
        makeProposal({
          number: 22,
          phase: 'discussion',
          createdAt: recentDate.toISOString(),
        }),
      ],
      comments: [
        // #20 has no recent comments
        makeComment({
          issueOrPrNumber: 20,
          type: 'proposal',
          createdAt: staleDate.toISOString(),
        }),
        // #21 has a recent comment
        makeComment({
          issueOrPrNumber: 21,
          type: 'proposal',
          createdAt: recentDate.toISOString(),
        }),
        // #22 was recently created, so it's not stale
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const stalled = bottlenecks.find((b) => b.type === 'stalled-discussion');
    expect(stalled).toBeDefined();
    // #20: stale (created 48h ago, last comment 48h ago)
    // #21: recent comment, not stale
    // #22: recently created, not stale
    expect(stalled?.items).toHaveLength(1);
    expect(stalled?.items[0].number).toBe(20);
  });

  it('does not flag recently created discussions as stalled', () => {
    const now = new Date('2026-02-07T10:00:00Z');
    const recentDate = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6h ago

    const data = makeActivityData({
      generatedAt: now.toISOString(),
      proposals: [
        makeProposal({
          number: 30,
          phase: 'discussion',
          createdAt: recentDate.toISOString(),
        }),
      ],
      comments: [],
    });

    const bottlenecks = detectBottlenecks(data);
    const stalled = bottlenecks.find((b) => b.type === 'stalled-discussion');
    expect(stalled).toBeUndefined();
  });

  it('detects competing implementations for the same proposal', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 40,
          phase: 'ready-to-implement',
        }),
      ],
      pullRequests: [
        makePR({
          number: 60,
          title: 'feat: implement feature (Fixes #40)',
          state: 'open',
          author: 'agent-a',
        }),
        makePR({
          number: 61,
          title: 'feat: another approach (Closes #40)',
          state: 'open',
          author: 'agent-b',
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const competing = bottlenecks.find(
      (b) => b.type === 'competing-implementations'
    );
    expect(competing).toBeDefined();
    expect(competing?.items).toHaveLength(1);
    expect(competing?.items[0].number).toBe(40);
    expect(competing?.items[0].detail).toContain('2 open PRs');
  });

  it('does not flag proposals with only one PR as competing', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 40,
          phase: 'ready-to-implement',
        }),
      ],
      pullRequests: [
        makePR({
          number: 60,
          title: 'feat: implement (Fixes #40)',
          state: 'open',
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const competing = bottlenecks.find(
      (b) => b.type === 'competing-implementations'
    );
    expect(competing).toBeUndefined();
  });

  it('ignores closed/merged PRs when detecting competing implementations', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 40,
          phase: 'ready-to-implement',
        }),
      ],
      pullRequests: [
        makePR({
          number: 60,
          title: 'feat: implement (Fixes #40)',
          state: 'open',
        }),
        makePR({
          number: 61,
          title: 'feat: old approach (Fixes #40)',
          state: 'closed',
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const competing = bottlenecks.find(
      (b) => b.type === 'competing-implementations'
    );
    expect(competing).toBeUndefined();
  });

  it('returns multiple bottleneck types when all are present', () => {
    const now = new Date('2026-02-07T10:00:00Z');
    const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const data = makeActivityData({
      generatedAt: now.toISOString(),
      proposals: [
        makeProposal({
          number: 10,
          phase: 'ready-to-implement',
        }),
        makeProposal({
          number: 20,
          phase: 'discussion',
          createdAt: staleDate.toISOString(),
        }),
        makeProposal({
          number: 40,
          phase: 'ready-to-implement',
        }),
      ],
      pullRequests: [
        makePR({
          number: 60,
          title: 'feat: approach A (Fixes #40)',
          state: 'open',
          author: 'agent-a',
        }),
        makePR({
          number: 61,
          title: 'feat: approach B (Fixes #40)',
          state: 'open',
          author: 'agent-b',
        }),
      ],
      comments: [
        makeComment({
          issueOrPrNumber: 20,
          type: 'proposal',
          createdAt: staleDate.toISOString(),
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const types = bottlenecks.map((b) => b.type);
    expect(types).toContain('unclaimed-work');
    expect(types).toContain('stalled-discussion');
    expect(types).toContain('competing-implementations');
  });

  it('detects traceability gaps for implemented proposals with no merged PR', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 50,
          title: 'Implemented without PR',
          phase: 'implemented',
        }),
        makeProposal({
          number: 51,
          title: 'Implemented with merged PR',
          phase: 'implemented',
        }),
        makeProposal({
          number: 52,
          title: 'Implemented with open PR only',
          phase: 'implemented',
        }),
      ],
      pullRequests: [
        makePR({
          number: 101,
          title: 'feat: implement (Fixes #51)',
          state: 'merged',
        }),
        makePR({
          number: 102,
          title: 'feat: implement (Fixes #52)',
          state: 'open',
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const gaps = bottlenecks.find((b) => b.type === 'traceability-gap');
    expect(gaps).toBeDefined();
    // #50: no PR at all
    // #52: has open PR, but not merged
    expect(gaps?.items.map((i) => i.number)).toEqual([50, 52]);
  });

  it('detects stale PRs with no recent activity', () => {
    const now = new Date('2026-02-07T10:00:00Z');
    const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const recentDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const data = makeActivityData({
      generatedAt: now.toISOString(),
      pullRequests: [
        makePR({
          number: 200,
          title: 'Stale PR',
          state: 'open',
          createdAt: staleDate.toISOString(),
        }),
        makePR({
          number: 201,
          title: 'Active PR',
          state: 'open',
          createdAt: staleDate.toISOString(),
        }),
        makePR({
          number: 202,
          title: 'Recent PR',
          state: 'open',
          createdAt: recentDate.toISOString(),
        }),
      ],
      comments: [
        // #200 has no recent comments
        makeComment({
          issueOrPrNumber: 200,
          type: 'pr',
          createdAt: staleDate.toISOString(),
        }),
        // #201 has a recent review
        makeComment({
          issueOrPrNumber: 201,
          type: 'review',
          createdAt: recentDate.toISOString(),
        }),
      ],
    });

    const bottlenecks = detectBottlenecks(data);
    const stale = bottlenecks.find((b) => b.type === 'stale-pr');
    expect(stale).toBeDefined();
    expect(stale?.items).toHaveLength(1);
    expect(stale?.items[0].number).toBe(200);
  });
});

// ──────────────────────────────────────────────
// suggestActions
// ──────────────────────────────────────────────

describe('suggestActions', () => {
  it('returns empty array when there are no bottlenecks', () => {
    const data = makeActivityData();
    const actions = suggestActions([], data);
    expect(actions).toEqual([]);
  });

  it('suggests claiming unclaimed ready-to-implement proposals', () => {
    const data = makeActivityData({
      proposals: [
        makeProposal({
          number: 10,
          title: 'Add feature X',
          phase: 'ready-to-implement',
        }),
      ],
    });

    const bottlenecks: Bottleneck[] = [
      {
        type: 'unclaimed-work',
        label: 'Unclaimed Work',
        items: [{ number: 10, title: 'Add feature X' }],
      },
    ];

    const actions = suggestActions(bottlenecks, data);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].description).toContain('#10');
    expect(actions[0].description).toContain('Add feature X');
  });

  it('suggests resuming stalled discussions', () => {
    const data = makeActivityData();
    const bottlenecks: Bottleneck[] = [
      {
        type: 'stalled-discussion',
        label: 'Stalled Discussions',
        items: [
          {
            number: 20,
            title: 'Some proposal',
            detail: '2d since last comment',
          },
        ],
      },
    ];

    const actions = suggestActions(bottlenecks, data);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].description).toContain('#20');
  });

  it('suggests resolving competing implementations', () => {
    const data = makeActivityData();
    const bottlenecks: Bottleneck[] = [
      {
        type: 'competing-implementations',
        label: 'Competing Implementations',
        items: [
          { number: 40, title: 'Feature Z', detail: '2 open PRs: #60, #61' },
        ],
      },
    ];

    const actions = suggestActions(bottlenecks, data);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].description).toContain('#40');
  });

  it('prioritizes competing implementations over unclaimed work', () => {
    const data = makeActivityData();
    const bottlenecks: Bottleneck[] = [
      {
        type: 'unclaimed-work',
        label: 'Unclaimed Work',
        items: [{ number: 10, title: 'Feature A' }],
      },
      {
        type: 'competing-implementations',
        label: 'Competing Implementations',
        items: [{ number: 40, title: 'Feature Z', detail: '2 open PRs' }],
      },
    ];

    const actions = suggestActions(bottlenecks, data);
    // Competing implementations are higher priority (wasted effort)
    const competingIndex = actions.findIndex((a) =>
      a.description.includes('#40')
    );
    const unclaimedIndex = actions.findIndex((a) =>
      a.description.includes('#10')
    );
    expect(competingIndex).toBeLessThan(unclaimedIndex);
  });
});
