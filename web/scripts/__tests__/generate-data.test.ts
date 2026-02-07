import { describe, it, expect } from 'vitest';
import {
  resolveRepository,
  resolveRepositories,
  mapCommits,
  mapIssues,
  mapPullRequests,
  mapEvents,
  aggregateAgentStats,
  calculateOpenIssues,
  deduplicateAgents,
  type GitHubCommit,
  type GitHubIssue,
  type GitHubRepo,
  type GitHubEvent,
  type PullRequest,
  type GitHubPR,
  type Commit,
  type Issue,
  type Comment,
  type Agent,
} from '../generate-data';

describe('resolveRepository', () => {
  it('should use default values if no env vars are present', () => {
    const result = resolveRepository({});
    expect(result).toEqual({ owner: 'hivemoot', repo: 'colony' });
  });

  it('should resolve from COLONY_REPOSITORY', () => {
    const result = resolveRepository({ COLONY_REPOSITORY: 'custom/repo' });
    expect(result).toEqual({ owner: 'custom', repo: 'repo' });
  });

  it('should resolve from GITHUB_REPOSITORY', () => {
    const result = resolveRepository({ GITHUB_REPOSITORY: 'actions/checkout' });
    expect(result).toEqual({ owner: 'actions', repo: 'checkout' });
  });

  it('should prefer COLONY_REPOSITORY over GITHUB_REPOSITORY', () => {
    const result = resolveRepository({
      COLONY_REPOSITORY: 'colony/owner',
      GITHUB_REPOSITORY: 'ignored/repo',
    });
    expect(result).toEqual({ owner: 'colony', repo: 'owner' });
  });

  it('should throw on invalid format', () => {
    expect(() => resolveRepository({ COLONY_REPOSITORY: 'invalid' })).toThrow();
  });
});

describe('mapCommits', () => {
  it('should transform raw GitHub commits correctly', () => {
    const raw: GitHubCommit[] = [
      {
        sha: '1234567890abcdef',
        commit: {
          message: 'Initial commit\n\nMore details',
          author: { name: 'User', date: '2026-02-06T10:00:00Z' },
        },
        author: { login: 'user1', avatar_url: 'https://avatar.com/u1' },
      },
      {
        sha: 'abcdef1234567890',
        commit: {
          message: 'Second commit',
          author: { name: 'Admin', date: '2026-02-06T11:00:00Z' },
        },
        author: null,
      },
    ];

    const result = mapCommits(raw);

    expect(result.commits).toHaveLength(2);
    expect(result.commits[0]).toEqual({
      sha: '1234567',
      message: 'Initial commit',
      author: 'user1',
      date: '2026-02-06T10:00:00Z',
    });
    expect(result.commits[1].author).toBe('Admin');
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toEqual({
      login: 'user1',
      avatarUrl: 'https://avatar.com/u1',
    });
  });
});

describe('calculateOpenIssues', () => {
  it('should subtract open PRs from open_issues_count', () => {
    const repoMetadata = { open_issues_count: 10 } as GitHubRepo;
    const prs = [
      { state: 'open' },
      { state: 'open' },
      { state: 'closed' },
    ] as PullRequest[];

    const result = calculateOpenIssues(repoMetadata, prs);
    expect(result).toBe(8);
  });

  it('should not return negative values', () => {
    const repoMetadata = { open_issues_count: 1 } as GitHubRepo;
    const prs = [{ state: 'open' }, { state: 'open' }] as PullRequest[];

    const result = calculateOpenIssues(repoMetadata, prs);
    expect(result).toBe(0);
  });
});

describe('deduplicateAgents', () => {
  it('should remove duplicates and keep the last one', () => {
    const agents = [
      { login: 'user1', avatarUrl: 'v1' },
      { login: 'user2', avatarUrl: 'v2' },
      { login: 'user1', avatarUrl: 'v3' },
    ];

    const result = deduplicateAgents(agents);
    expect(result).toHaveLength(2);
    expect(result.find((a) => a.login === 'user1')?.avatarUrl).toBe('v3');
  });
});

describe('mapPullRequests', () => {
  it('should transform raw GitHub PRs correctly', () => {
    const raw = [
      {
        number: 1,
        title: 'Draft PR',
        state: 'open',
        draft: true,
        merged_at: null,
        closed_at: null,
        user: { login: 'user1', avatar_url: 'url1' },
        created_at: '2026-02-06T10:00:00Z',
      },
      {
        number: 2,
        title: 'Merged PR',
        state: 'closed',
        draft: false,
        merged_at: '2026-02-06T12:00:00Z',
        closed_at: '2026-02-06T12:00:00Z',
        user: { login: 'user2', avatar_url: 'url2' },
        created_at: '2026-02-06T11:00:00Z',
      },
    ];

    const result = mapPullRequests(raw as unknown as GitHubPR[]);
    expect(result.pullRequests).toHaveLength(2);

    const draftPr = result.pullRequests.find((p) => p.number === 1);
    const mergedPr = result.pullRequests.find((p) => p.number === 2);

    expect(draftPr?.state).toBe('open');
    expect(draftPr?.draft).toBe(true);
    expect(mergedPr?.state).toBe('merged');
    expect(mergedPr?.mergedAt).toBe('2026-02-06T12:00:00Z');
  });
});

describe('aggregateAgentStats', () => {
  it('should correctly aggregate stats and track lastActiveAt', () => {
    const commits = [
      { author: 'user1', date: '2026-02-06T10:00:00Z' },
      { author: 'user1', date: '2026-02-06T12:00:00Z' },
    ] as Commit[];
    const issues = [
      { author: 'user2', createdAt: '2026-02-06T11:00:00Z' },
    ] as Issue[];
    const prs = [
      { author: 'user1', state: 'merged', mergedAt: '2026-02-06T13:00:00Z' },
    ] as PullRequest[];
    const comments = [
      { author: 'user2', type: 'issue', createdAt: '2026-02-06T14:00:00Z' },
      { author: 'user1', type: 'review', createdAt: '2026-02-06T15:00:00Z' },
    ] as Comment[];
    const agentMap = new Map<string, Agent>([
      ['user1', { login: 'user1' }],
      ['user2', { login: 'user2' }],
    ]);

    const result = aggregateAgentStats(
      commits,
      issues,
      prs,
      comments,
      agentMap
    );

    expect(result).toHaveLength(2);

    const user1 = result.find((s) => s.login === 'user1');
    expect(user1?.commits).toBe(2);
    expect(user1?.pullRequestsMerged).toBe(1);
    expect(user1?.reviews).toBe(1);
    expect(user1?.lastActiveAt).toBe('2026-02-06T15:00:00Z');

    const user2 = result.find((s) => s.login === 'user2');
    expect(user2?.issuesOpened).toBe(1);
    expect(user2?.comments).toBe(1);
    expect(user2?.lastActiveAt).toBe('2026-02-06T14:00:00Z');

    // Should be sorted by lastActiveAt descending
    expect(result[0].login).toBe('user1');
    expect(result[1].login).toBe('user2');
  });
});

describe('resolveRepositories', () => {
  it('should return default repositories when no env var set', () => {
    const result = resolveRepositories({});
    expect(result).toEqual([
      { owner: 'hivemoot', repo: 'colony' },
      { owner: 'hivemoot', repo: 'hivemoot' },
    ]);
  });

  it('should parse COLONY_REPOSITORIES as comma-separated list', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: 'org/repo1, org/repo2, org/repo3',
    });
    expect(result).toEqual([
      { owner: 'org', repo: 'repo1' },
      { owner: 'org', repo: 'repo2' },
      { owner: 'org', repo: 'repo3' },
    ]);
  });

  it('should handle single repository in COLONY_REPOSITORIES', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: 'org/single',
    });
    expect(result).toEqual([{ owner: 'org', repo: 'single' }]);
  });

  it('should throw on invalid format in COLONY_REPOSITORIES', () => {
    expect(() =>
      resolveRepositories({ COLONY_REPOSITORIES: 'valid/repo,invalid' })
    ).toThrow();
  });
});

describe('repository tagging in map functions', () => {
  const sampleCommit: GitHubCommit = {
    sha: '1234567890abcdef',
    commit: {
      message: 'test commit',
      author: { name: 'User', date: '2026-02-06T10:00:00Z' },
    },
    author: { login: 'user1', avatar_url: 'https://avatar.com/u1' },
  };

  const sampleIssue: GitHubIssue = {
    number: 1,
    title: 'Test issue',
    state: 'open',
    labels: [],
    created_at: '2026-02-06T10:00:00Z',
    closed_at: null,
    user: { login: 'user1' },
    comments: 0,
  };

  const samplePR: GitHubPR = {
    number: 1,
    title: 'Test PR',
    state: 'open',
    draft: false,
    merged_at: null,
    closed_at: null,
    user: { login: 'user1', avatar_url: 'url1' },
    created_at: '2026-02-06T10:00:00Z',
  };

  it('mapCommits should tag commits with repository when provided', () => {
    const result = mapCommits([sampleCommit], 'org/repo');
    expect(result.commits[0].repository).toBe('org/repo');
  });

  it('mapCommits should omit repository when not provided', () => {
    const result = mapCommits([sampleCommit]);
    expect(result.commits[0]).not.toHaveProperty('repository');
  });

  it('mapIssues should tag issues with repository when provided', () => {
    const result = mapIssues([sampleIssue], 'org/repo');
    expect(result.issues[0].repository).toBe('org/repo');
  });

  it('mapIssues should omit repository when not provided', () => {
    const result = mapIssues([sampleIssue]);
    expect(result.issues[0]).not.toHaveProperty('repository');
  });

  it('mapPullRequests should tag PRs with repository when provided', () => {
    const result = mapPullRequests([samplePR] as GitHubPR[], 'org/repo');
    expect(result.pullRequests[0].repository).toBe('org/repo');
  });

  it('mapPullRequests should omit repository when not provided', () => {
    const result = mapPullRequests([samplePR] as GitHubPR[]);
    expect(result.pullRequests[0]).not.toHaveProperty('repository');
  });

  it('mapEvents should tag comments with repository when provided', () => {
    const event: GitHubEvent = {
      id: '1',
      type: 'IssueCommentEvent',
      actor: { login: 'user1', avatar_url: 'url' },
      payload: {
        action: 'created',
        comment: { id: 1, body: 'test', html_url: 'https://example.com' },
        issue: { number: 1, title: 'test' },
      },
      created_at: '2026-02-06T10:00:00Z',
    };
    const result = mapEvents([event], 'org', 'repo', 'org/repo');
    expect(result.comments[0].repository).toBe('org/repo');
  });

  it('mapEvents should omit repository when not provided', () => {
    const event: GitHubEvent = {
      id: '1',
      type: 'IssueCommentEvent',
      actor: { login: 'user1', avatar_url: 'url' },
      payload: {
        action: 'created',
        comment: { id: 1, body: 'test', html_url: 'https://example.com' },
        issue: { number: 1, title: 'test' },
      },
      created_at: '2026-02-06T10:00:00Z',
    };
    const result = mapEvents([event], 'org', 'repo');
    expect(result.comments[0]).not.toHaveProperty('repository');
  });
});
