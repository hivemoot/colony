import { describe, it, expect } from 'vitest';
import { computeAgentProfile, type AgentProfileData } from './agent-profile';
import type { ActivityData } from '../types/activity';

/** Assert non-null and return typed value (avoids forbidden `!` operator) */
function assertProfile(val: AgentProfileData | null): AgentProfileData {
  expect(val).not.toBeNull();
  return val as AgentProfileData;
}

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-08T00:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [{ login: 'builder' }, { login: 'worker' }, { login: 'scout' }],
    agentStats: [
      {
        login: 'builder',
        avatarUrl: 'https://github.com/builder.png',
        commits: 15,
        pullRequestsMerged: 8,
        issuesOpened: 5,
        reviews: 10,
        comments: 20,
        lastActiveAt: '2026-02-08T12:00:00Z',
      },
      {
        login: 'worker',
        commits: 10,
        pullRequestsMerged: 5,
        issuesOpened: 3,
        reviews: 8,
        comments: 15,
        lastActiveAt: '2026-02-08T10:00:00Z',
      },
    ],
    commits: [
      {
        sha: 'abc123',
        message: 'feat: add feature',
        author: 'builder',
        date: '2026-02-06T10:00:00Z',
      },
      {
        sha: 'def456',
        message: 'fix: bug fix',
        author: 'builder',
        date: '2026-02-07T14:00:00Z',
      },
      {
        sha: 'ghi789',
        message: 'feat: other feature',
        author: 'worker',
        date: '2026-02-05T08:00:00Z',
      },
    ],
    issues: [
      {
        number: 10,
        title: 'Proposal: something',
        state: 'open',
        labels: [],
        author: 'builder',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ],
    pullRequests: [
      {
        number: 20,
        title: 'feat: PR by builder',
        state: 'merged',
        author: 'builder',
        createdAt: '2026-02-06T12:00:00Z',
        mergedAt: '2026-02-07T12:00:00Z',
      },
      {
        number: 21,
        title: 'feat: PR by worker',
        state: 'open',
        author: 'worker',
        createdAt: '2026-02-07T08:00:00Z',
      },
    ],
    proposals: [
      {
        number: 100,
        title: 'Add agent profiles',
        phase: 'ready-to-implement',
        author: 'builder',
        createdAt: '2026-02-04T12:00:00Z',
        commentCount: 8,
      },
      {
        number: 101,
        title: 'Fix bug',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-06T10:00:00Z',
        commentCount: 3,
      },
    ],
    comments: [
      {
        id: 1,
        issueOrPrNumber: 20,
        type: 'pr',
        author: 'worker',
        body: 'Looks good',
        createdAt: '2026-02-06T14:00:00Z',
        url: 'https://github.com/hivemoot/colony/pull/20#comment-1',
      },
      {
        id: 2,
        issueOrPrNumber: 20,
        type: 'pr',
        author: 'scout',
        body: 'LGTM',
        createdAt: '2026-02-06T15:00:00Z',
        url: 'https://github.com/hivemoot/colony/pull/20#comment-2',
      },
      {
        id: 3,
        issueOrPrNumber: 21,
        type: 'pr',
        author: 'builder',
        body: 'Reviewed',
        createdAt: '2026-02-07T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/pull/21#comment-3',
      },
      {
        id: 4,
        issueOrPrNumber: 100,
        type: 'proposal',
        author: 'worker',
        body: 'Support this',
        createdAt: '2026-02-04T14:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/100#comment-4',
      },
    ],
    ...overrides,
  };
}

describe('computeAgentProfile', () => {
  it('returns null for unknown agent', () => {
    const data = makeActivityData();
    expect(computeAgentProfile(data, 'unknown')).toBeNull();
  });

  it('returns profile with correct stats', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.login).toBe('builder');
    expect(profile.stats.commits).toBe(15);
    expect(profile.stats.pullRequestsMerged).toBe(8);
    expect(profile.stats.reviews).toBe(10);
    expect(profile.avatarUrl).toBe('https://github.com/builder.png');
  });

  it('includes role profile with scores', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.roleProfile.login).toBe('builder');
    expect(profile.roleProfile.primaryRole).not.toBeNull();
    expect(profile.roleProfile.scores.coder).toBeGreaterThan(0);
  });

  it('filters proposals to the selected agent', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.proposals).toHaveLength(1);
    expect(profile.proposals[0].title).toBe('Add agent profiles');
  });

  it('filters commits to the selected agent', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.recentCommits).toHaveLength(2);
    expect(profile.recentCommits[0].author).toBe('builder');
  });

  it('filters PRs to the selected agent', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.recentPRs).toHaveLength(1);
    expect(profile.recentPRs[0].title).toBe('feat: PR by builder');
  });

  it('filters comments to the selected agent', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.recentComments).toHaveLength(1);
    expect(profile.recentComments[0].body).toBe('Reviewed');
  });

  it('computes activeSince as earliest timestamp', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    // Earliest is the proposal createdAt: 2026-02-04T12:00:00Z
    expect(profile.activeSince).toBe('2026-02-04T12:00:00Z');
  });

  it('returns null activeSince when agent has no timestamped activity', () => {
    const data = makeActivityData({
      commits: [],
      pullRequests: [],
      comments: [],
      proposals: [],
    });
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    expect(profile.activeSince).toBeNull();
  });

  it('computes collaborators from shared issue/PR interactions', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    // worker commented on builder's PR #20 and builder's proposal #100
    // scout commented on builder's PR #20
    // builder commented on worker's PR #21, and worker also commented on PR #21 (via shared thread)
    expect(profile.collaborators.length).toBeGreaterThan(0);
    const workerCollab = profile.collaborators.find(
      (c) => c.login === 'worker'
    );
    expect(workerCollab).toBeDefined();
    expect(
      (workerCollab as { interactions: number }).interactions
    ).toBeGreaterThan(0);
  });

  it('sorts collaborators by interaction count descending', () => {
    const data = makeActivityData();
    const profile = assertProfile(computeAgentProfile(data, 'builder'));

    for (let i = 1; i < profile.collaborators.length; i++) {
      expect(profile.collaborators[i - 1].interactions).toBeGreaterThanOrEqual(
        profile.collaborators[i].interactions
      );
    }
  });
});
