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
  buildExternalVisibility,
  deduplicateAgents,
  extractPhaseTransitions,
  type GitHubCommit,
  type GitHubEvent,
  type GitHubTimelineEvent,
  type GitHubIssue,
  type GitHubRepo,
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

describe('resolveRepositories', () => {
  it('should fall back to single repo when COLONY_REPOSITORIES is not set', () => {
    const result = resolveRepositories({});
    expect(result).toEqual([{ owner: 'hivemoot', repo: 'colony' }]);
  });

  it('should parse comma-separated COLONY_REPOSITORIES', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: 'hivemoot/colony,hivemoot/hivemoot',
    });
    expect(result).toEqual([
      { owner: 'hivemoot', repo: 'colony' },
      { owner: 'hivemoot', repo: 'hivemoot' },
    ]);
  });

  it('should trim whitespace around repo names', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: ' hivemoot/colony , hivemoot/hivemoot ',
    });
    expect(result).toEqual([
      { owner: 'hivemoot', repo: 'colony' },
      { owner: 'hivemoot', repo: 'hivemoot' },
    ]);
  });

  it('should skip empty entries from trailing commas', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: 'hivemoot/colony,,',
    });
    expect(result).toEqual([{ owner: 'hivemoot', repo: 'colony' }]);
  });

  it('should fall back to single repo when COLONY_REPOSITORIES is empty', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: '',
      COLONY_REPOSITORY: 'custom/repo',
    });
    expect(result).toEqual([{ owner: 'custom', repo: 'repo' }]);
  });

  it('should throw on invalid format in multi-repo list', () => {
    expect(() =>
      resolveRepositories({
        COLONY_REPOSITORIES: 'hivemoot/colony,invalid',
      })
    ).toThrow(/Invalid repository "invalid"/);
  });

  it('should handle single repo in COLONY_REPOSITORIES', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: 'hivemoot/colony',
    });
    expect(result).toEqual([{ owner: 'hivemoot', repo: 'colony' }]);
  });

  it('should deduplicate repeated repositories', () => {
    const result = resolveRepositories({
      COLONY_REPOSITORIES: 'hivemoot/colony,hivemoot/colony,hivemoot/hivemoot',
    });
    expect(result).toEqual([
      { owner: 'hivemoot', repo: 'colony' },
      { owner: 'hivemoot', repo: 'hivemoot' },
    ]);
  });
});

describe('mapCommits', () => {
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

  it('should transform raw GitHub commits correctly', () => {
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

  it('should tag commits with repo when repoTag is provided', () => {
    const result = mapCommits(raw, 'hivemoot/colony');

    expect(result.commits[0].repo).toBe('hivemoot/colony');
    expect(result.commits[1].repo).toBe('hivemoot/colony');
  });

  it('should omit repo field when repoTag is not provided', () => {
    const result = mapCommits(raw);

    expect(result.commits[0]).not.toHaveProperty('repo');
  });
});

describe('mapIssues', () => {
  const rawIssues: GitHubIssue[] = [
    {
      number: 1,
      title: 'Bug report',
      state: 'open',
      labels: [{ name: 'bug' }],
      created_at: '2026-02-06T10:00:00Z',
      closed_at: null,
      user: { login: 'user1' },
      comments: 3,
    },
  ];

  it('should tag issues with repo when repoTag is provided', () => {
    const result = mapIssues(rawIssues, 'hivemoot/colony');

    expect(result.issues[0].repo).toBe('hivemoot/colony');
  });

  it('should omit repo field when repoTag is not provided', () => {
    const result = mapIssues(rawIssues);

    expect(result.issues[0]).not.toHaveProperty('repo');
  });
});

describe('mapPullRequests', () => {
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

  it('should transform raw GitHub PRs correctly', () => {
    const result = mapPullRequests(raw as unknown as GitHubPR[]);
    expect(result.pullRequests).toHaveLength(2);

    const draftPr = result.pullRequests.find((p) => p.number === 1);
    const mergedPr = result.pullRequests.find((p) => p.number === 2);

    expect(draftPr?.state).toBe('open');
    expect(draftPr?.draft).toBe(true);
    expect(mergedPr?.state).toBe('merged');
    expect(mergedPr?.mergedAt).toBe('2026-02-06T12:00:00Z');
  });

  it('should tag PRs with repo when repoTag is provided', () => {
    const result = mapPullRequests(
      raw as unknown as GitHubPR[],
      'hivemoot/colony'
    );

    expect(result.pullRequests[0].repo).toBe('hivemoot/colony');
    expect(result.pullRequests[1].repo).toBe('hivemoot/colony');
  });

  it('should keep full fetched PR coverage for downstream linking', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      body: null,
      state: 'open',
      draft: false,
      merged_at: null,
      closed_at: null,
      user: { login: `user${i + 1}`, avatar_url: `url${i + 1}` },
      created_at: `2026-02-06T${String(i).padStart(2, '0')}:00:00Z`,
    }));

    const result = mapPullRequests(many as unknown as GitHubPR[]);

    expect(result.pullRequests).toHaveLength(20);
    expect(result.pullRequests[0].number).toBe(20);
    expect(result.pullRequests[19].number).toBe(1);
  });
});

describe('mapEvents', () => {
  it('should tag comments with repo when repoTag is provided', () => {
    const events: GitHubEvent[] = [
      {
        id: '1',
        type: 'IssueCommentEvent',
        actor: { login: 'user1', avatar_url: 'url' },
        payload: {
          action: 'created',
          comment: { id: 100, body: 'test', html_url: 'https://example.com' },
          issue: { number: 5, title: 'test' },
        },
        created_at: '2026-02-06T10:00:00Z',
      },
    ];

    const result = mapEvents(events, 'hivemoot', 'colony', 'hivemoot/colony');

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].repo).toBe('hivemoot/colony');
  });

  it('should omit repo field when repoTag is not provided', () => {
    const events: GitHubEvent[] = [
      {
        id: '1',
        type: 'IssueCommentEvent',
        actor: { login: 'user1', avatar_url: 'url' },
        payload: {
          action: 'created',
          comment: { id: 100, body: 'test', html_url: 'https://example.com' },
          issue: { number: 5, title: 'test' },
        },
        created_at: '2026-02-06T10:00:00Z',
      },
    ];

    const result = mapEvents(events, 'hivemoot', 'colony');

    expect(result.comments[0]).not.toHaveProperty('repo');
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

describe('extractPhaseTransitions', () => {
  it('should extract phase label events from timeline', () => {
    const timeline: GitHubTimelineEvent[] = [
      {
        event: 'labeled',
        label: { name: 'phase:discussion' },
        created_at: '2026-02-06T14:00:00Z',
      },
      { event: 'commented', created_at: '2026-02-06T14:30:00Z' },
      {
        event: 'labeled',
        label: { name: 'phase:voting' },
        created_at: '2026-02-06T16:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'bug' },
        created_at: '2026-02-06T16:30:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'phase:implemented' },
        created_at: '2026-02-06T18:00:00Z',
      },
    ];

    const result = extractPhaseTransitions(timeline);

    expect(result).toEqual([
      { phase: 'discussion', enteredAt: '2026-02-06T14:00:00Z' },
      { phase: 'voting', enteredAt: '2026-02-06T16:00:00Z' },
      { phase: 'implemented', enteredAt: '2026-02-06T18:00:00Z' },
    ]);
  });

  it('should return empty array when no phase labels exist', () => {
    const timeline: GitHubTimelineEvent[] = [
      {
        event: 'labeled',
        label: { name: 'bug' },
        created_at: '2026-02-06T14:00:00Z',
      },
      { event: 'commented', created_at: '2026-02-06T15:00:00Z' },
    ];

    expect(extractPhaseTransitions(timeline)).toEqual([]);
  });

  it('should sort transitions chronologically', () => {
    const timeline: GitHubTimelineEvent[] = [
      {
        event: 'labeled',
        label: { name: 'phase:implemented' },
        created_at: '2026-02-06T18:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'phase:discussion' },
        created_at: '2026-02-06T14:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'phase:voting' },
        created_at: '2026-02-06T16:00:00Z',
      },
    ];

    const result = extractPhaseTransitions(timeline);

    expect(result[0].phase).toBe('discussion');
    expect(result[1].phase).toBe('voting');
    expect(result[2].phase).toBe('implemented');
  });

  it('should handle empty timeline', () => {
    expect(extractPhaseTransitions([])).toEqual([]);
  });

  it('should handle events with missing label field', () => {
    const timeline: GitHubTimelineEvent[] = [
      { event: 'labeled', created_at: '2026-02-06T14:00:00Z' },
      {
        event: 'labeled',
        label: { name: 'phase:voting' },
        created_at: '2026-02-06T16:00:00Z',
      },
    ];

    const result = extractPhaseTransitions(timeline);
    expect(result).toEqual([
      { phase: 'voting', enteredAt: '2026-02-06T16:00:00Z' },
    ]);
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

describe('buildExternalVisibility', () => {
  it('flags admin-blocked repo settings when homepage/topics are missing', () => {
    const visibility = buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: null,
        topics: [],
      },
    ]);

    expect(visibility.checks.find((c) => c.id === 'has-homepage')?.ok).toBe(
      false
    );
    expect(visibility.checks.find((c) => c.id === 'has-topics')?.ok).toBe(
      false
    );
    expect(visibility.blockers).toContain('Repository homepage URL configured');
    expect(visibility.blockers).toContain('Repository topics configured');
  });

  it('reports green status when all visibility checks pass', () => {
    const visibility = buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: 'https://hivemoot.github.io/colony/',
        topics: ['autonomous-agents'],
      },
    ]);

    expect(visibility.status).toBe('green');
    expect(visibility.score).toBe(100);
    expect(visibility.checks.every((check) => check.ok)).toBe(true);
    expect(visibility.blockers).toEqual([]);
  });
});
