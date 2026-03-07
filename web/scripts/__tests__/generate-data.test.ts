import { describe, it, expect, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveRepository,
  resolveRequiredDiscoverabilityTopics,
  resolveRepositories,
  resolveRepositoryHomepage,
  updateSitemapLastmod,
  mapCommits,
  mapIssues,
  mapPullRequests,
  mapEvents,
  aggregateAgentStats,
  calculateOpenIssues,
  parseRoadmap,
  buildExternalVisibility,
  extractGovernanceIncidents,
  deduplicateAgents,
  extractPhaseTransitions,
  filterAndMapProposals,
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

afterEach(() => {
  vi.restoreAllMocks();
});

const REQUIRED_DISCOVERABILITY_TOPICS = [
  'autonomous-agents',
  'ai-governance',
  'multi-agent',
  'agent-collaboration',
  'dashboard',
  'react',
  'typescript',
  'github-pages',
  'open-source',
];

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

  it('should reject repository values with extra path segments', () => {
    expect(() =>
      resolveRepository({ COLONY_REPOSITORY: 'hivemoot/colony/extra' })
    ).toThrow(/Expected format "owner\/repo"/);
  });

  it('should trim whitespace around owner and repo', () => {
    const result = resolveRepository({
      COLONY_REPOSITORY: '  hivemoot / colony  ',
    });
    expect(result).toEqual({ owner: 'hivemoot', repo: 'colony' });
  });

  it('should fall back to defaults when COLONY_REPOSITORY is blank', () => {
    const result = resolveRepository({ COLONY_REPOSITORY: '   ' });
    expect(result).toEqual({ owner: 'hivemoot', repo: 'colony' });
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

  it('should throw when a multi-repo entry has extra path segments', () => {
    expect(() =>
      resolveRepositories({
        COLONY_REPOSITORIES: 'hivemoot/colony,hivemoot/hivemoot/extra',
      })
    ).toThrow(/Expected format "owner\/repo"/);
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

describe('resolveRepositoryHomepage', () => {
  it('accepts and normalizes https homepage URLs', () => {
    expect(
      resolveRepositoryHomepage('https://colony.example.org/path/?utm=1#frag')
    ).toBe('https://colony.example.org/path');
  });

  it('rejects insecure and local homepage URLs', () => {
    expect(resolveRepositoryHomepage('http://colony.example.org')).toBe('');
    expect(resolveRepositoryHomepage('https://localhost:4173')).toBe('');
    expect(resolveRepositoryHomepage('https://127.0.0.1:8443')).toBe('');
    expect(resolveRepositoryHomepage('https://[::1]/')).toBe('');
    expect(resolveRepositoryHomepage('https://[2001:db8::1]/')).toBe('');
  });

  it('rejects credential-bearing homepage URLs', () => {
    expect(
      resolveRepositoryHomepage('https://user:secret@example.com/colony/')
    ).toBe('');
    expect(resolveRepositoryHomepage('https://user@example.com/colony/')).toBe(
      ''
    );
  });

  it('rejects malformed URL strings', () => {
    expect(resolveRepositoryHomepage('https//missing-colon.example.com')).toBe(
      ''
    );
    expect(resolveRepositoryHomepage('not-a-url')).toBe('');
    expect(resolveRepositoryHomepage('')).toBe('');
  });
});

describe('resolveRequiredDiscoverabilityTopics', () => {
  it('returns defaults when COLONY_REQUIRED_DISCOVERABILITY_TOPICS is unset', () => {
    expect(resolveRequiredDiscoverabilityTopics({})).toEqual(
      REQUIRED_DISCOVERABILITY_TOPICS
    );
  });

  it('parses, normalizes, and deduplicates configured topics', () => {
    expect(
      resolveRequiredDiscoverabilityTopics({
        COLONY_REQUIRED_DISCOVERABILITY_TOPICS:
          ' Custom-Topic,custom-topic, dashboard ,',
      })
    ).toEqual(['custom-topic', 'dashboard']);
  });

  it('falls back to defaults when configured topics are blank', () => {
    expect(
      resolveRequiredDiscoverabilityTopics({
        COLONY_REQUIRED_DISCOVERABILITY_TOPICS: ' , , ',
      })
    ).toEqual(REQUIRED_DISCOVERABILITY_TOPICS);
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

describe('extractGovernanceIncidents', () => {
  it('maps blocker comments into machine-readable incident categories', () => {
    const incidents = extractGovernanceIncidents([
      {
        id: 101,
        issueOrPrNumber: 242,
        type: 'issue',
        author: 'hivemoot-scout',
        body: 'BLOCKED: admin-required',
        createdAt: '2026-02-11T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/242#issuecomment-1',
      },
      {
        id: 102,
        issueOrPrNumber: 242,
        type: 'issue',
        author: 'hivemoot-builder',
        body: 'CI checks failed due to workflow timeout',
        createdAt: '2026-02-11T11:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/242#issuecomment-2',
      },
      {
        id: 103,
        issueOrPrNumber: 157,
        type: 'issue',
        author: 'hivemoot-worker',
        body: 'Discoverability remains weak due to missing homepage settings',
        createdAt: '2026-02-11T12:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/157#issuecomment-3',
      },
    ]);

    expect(incidents).toHaveLength(3);
    expect(incidents[0].detectedAt).toBe('2026-02-11T12:00:00Z');
    expect(incidents[0].category).toBe('governance-deadlock');
    expect(incidents[1].category).toBe('ci-regression');
    expect(incidents[2].category).toBe('permissions');
    expect(incidents[2].severity).toBe('high');
  });

  it('marks incidents as mitigated when comment body contains VERIFIED', () => {
    const incidents = extractGovernanceIncidents([
      {
        id: 201,
        issueOrPrNumber: 242,
        type: 'issue',
        author: 'hivemoot-scout',
        body: 'BLOCKED: merge-required\n\nVERIFIED by maintainer',
        createdAt: '2026-02-11T13:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/242#issuecomment-4',
      },
    ]);

    expect(incidents).toHaveLength(1);
    expect(incidents[0].status).toBe('mitigated');
    expect(incidents[0].category).toBe('maintainer-gate');
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

describe('parseRoadmap', () => {
  it('parses issue numbers and descriptions from roadmap items', () => {
    const markdown = `
### Horizon 2: Make Colony Genuinely Useful (Current Focus)
Moving from an "interesting demo" to a "useful tool".
- [x] **Governance Analytics** (#120): Pipeline counts, success rates, and agent roles.
- [ ] **Proposal Detail View**: In-app view of proposal discussions and vote breakdowns.
`;

    const parsed = parseRoadmap(markdown);
    expect(parsed.horizons).toHaveLength(1);
    expect(parsed.horizons[0].items).toHaveLength(2);
    expect(parsed.horizons[0].items[0]).toEqual({
      task: 'Governance Analytics',
      done: true,
      issueNumber: 120,
      description: 'Pipeline counts, success rates, and agent roles.',
    });
    expect(parsed.horizons[0].items[1]).toEqual({
      task: 'Proposal Detail View',
      done: false,
      description: 'In-app view of proposal discussions and vote breakdowns.',
    });
  });

  it('extracts current status from roadmap headings with emoji', () => {
    const markdown = `
## 📈 Current Status (Feb 2026)

The project has successfully delivered the majority of Horizon 2 features.
Current work is focused on Proposal Detail View.

*This roadmap is a living document, evolved through Hivemoot governance proposals.*
`;

    const parsed = parseRoadmap(markdown);
    expect(parsed.currentStatus).toContain(
      'The project has successfully delivered the majority of Horizon 2 features.'
    );
    expect(parsed.currentStatus).toContain(
      'Current work is focused on Proposal Detail View.'
    );
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
  it('flags admin-blocked repo settings when homepage/topics/description are missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('not found', { status: 404 });
    });

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: null,
        topics: [],
        description: null,
      },
    ]);

    expect(visibility.checks.find((c) => c.id === 'has-homepage')?.ok).toBe(
      false
    );
    expect(visibility.checks.find((c) => c.id === 'has-topics')?.ok).toBe(
      false
    );
    expect(visibility.checks.find((c) => c.id === 'has-description')?.ok).toBe(
      false
    );
    expect(visibility.blockers).toContain('Repository homepage URL configured');
    expect(visibility.blockers).toContain('Repository topics configured');
    expect(visibility.blockers).toContain(
      'Repository description mentions dashboard'
    );
  });

  it('marks freshness check as failed when deployed activity JSON has invalid timestamp', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(JSON.stringify({ generatedAt: 'not-a-date' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('ok', { status: 200 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const freshnessCheck = visibility.checks.find(
      (c) => c.id === 'deployed-activity-freshness'
    );
    expect(freshnessCheck?.ok).toBe(false);
    expect(freshnessCheck?.details).toContain(
      'Invalid timestamp in deployed activity.json'
    );
  });

  it('marks freshness check as failed when deployed activity JSON timestamp is in the future', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({
              generatedAt: new Date(
                Date.now() + 8 * 60 * 60 * 1000
              ).toISOString(),
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          );
        }

        return new Response('ok', { status: 200 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const freshnessCheck = visibility.checks.find(
      (c) => c.id === 'deployed-activity-freshness'
    );
    expect(freshnessCheck?.ok).toBe(false);
    expect(freshnessCheck?.details).toContain('future');
  });

  it('runs deployed checks against configured homepage with deterministic fetch responses', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    const recentGeneratedAt = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="icon" href="${baseUrl}/favicon.ico" sizes="any" />
                <link rel="canonical" href="${baseUrl}/" />
                <link rel="manifest" href="${baseUrl}/manifest.webmanifest" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta name="twitter:image" content="${baseUrl}/twitter-image.png" />
                <link rel="apple-touch-icon" sizes="180x180" href="/colony/apple-touch-icon.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/favicon.ico`) {
          return new Response('icon-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/manifest.webmanifest`) {
          return new Response(
            JSON.stringify({
              icons: [
                { src: `${baseUrl}/pwa-192x192.png`, sizes: '192x192' },
                { src: `${baseUrl}/pwa-512x512.png`, sizes: '512x512' },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/pwa-192x192.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (
          url === `${baseUrl}/pwa-512x512.png` ||
          url === `${baseUrl}/apple-touch-icon.png`
        ) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: recentGeneratedAt }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    expect(
      visibility.checks.find((c) => c.id === 'deployed-root-reachable')?.ok
    ).toBe(true);
    expect(visibility.checks.find((c) => c.id === 'deployed-jsonld')?.ok).toBe(
      true
    );
    expect(
      visibility.checks.find((c) => c.id === 'deployed-canonical')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-og-image')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-og-image-dimensions')?.ok
    ).toBe(true);
    expect(visibility.checks.find((c) => c.id === 'deployed-favicon')?.ok).toBe(
      true
    );
    expect(
      visibility.checks.find((c) => c.id === 'deployed-twitter-image')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-pwa-manifest')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-pwa-icons')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-apple-touch-icon')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-robots-sitemap')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-sitemap-lastmod')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-activity-freshness')?.ok
    ).toBe(true);
  });

  it('uses fallback deployed URL when homepage is missing and handles fetch failures', async () => {
    const fallbackBaseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (): Promise<Response> => {
        throw new Error('network unavailable');
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: null,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const rootCheck = visibility.checks.find(
      (c) => c.id === 'deployed-root-reachable'
    );
    expect(rootCheck?.ok).toBe(false);
    expect(rootCheck?.details).toContain(
      `Fallback URL used: ${fallbackBaseUrl}`
    );
    expect(visibility.checks.find((c) => c.id === 'has-homepage')?.ok).toBe(
      false
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      fallbackBaseUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('uses fallback deployed URL when homepage is invalid', async () => {
    const fallbackBaseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (): Promise<Response> => {
        throw new Error('network unavailable');
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: 'http://127.0.0.1:4173/dashboard',
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    expect(visibility.checks.find((c) => c.id === 'has-homepage')?.ok).toBe(
      false
    );

    const rootCheck = visibility.checks.find(
      (c) => c.id === 'deployed-root-reachable'
    );
    expect(rootCheck?.details).toContain(
      `Fallback URL used: ${fallbackBaseUrl}`
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      fallbackBaseUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('flags canonical mismatch on deployed homepage', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="icon" href="${baseUrl}/favicon.ico" sizes="any" />
                <link rel="canonical" href="https://example.com/wrong/" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <meta name="twitter:image" content="${baseUrl}/twitter-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/favicon.ico`) {
          return new Response('icon-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const canonicalCheck = visibility.checks.find(
      (c) => c.id === 'deployed-canonical'
    );
    expect(canonicalCheck?.ok).toBe(false);
    expect(canonicalCheck?.details).toContain('Canonical mismatch');
  });

  it('flags missing twitter:image on deployed homepage', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link href="${baseUrl}/favicon.ico" sizes="any" rel="icon" />
                <link href="${baseUrl}/" rel="canonical" />
                <meta content="${baseUrl}/og-image.png" property="og:image" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/favicon.ico`) {
          return new Response('icon-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const twitterImageCheck = visibility.checks.find(
      (c) => c.id === 'deployed-twitter-image'
    );
    expect(twitterImageCheck?.ok).toBe(false);
    expect(twitterImageCheck?.details).toContain(
      'Missing twitter:image metadata on deployed homepage'
    );
  });

  it('flags missing og:image dimensions on deployed homepage', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link href="${baseUrl}/favicon.ico" sizes="any" rel="icon" />
                <link href="${baseUrl}/" rel="canonical" />
                <meta content="${baseUrl}/og-image.png" property="og:image" />
                <meta content="${baseUrl}/twitter-image.png" name="twitter:image" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/favicon.ico`) {
          return new Response('icon-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const ogImageDimensionsCheck = visibility.checks.find(
      (c) => c.id === 'deployed-og-image-dimensions'
    );
    expect(ogImageDimensionsCheck?.ok).toBe(false);
    expect(ogImageDimensionsCheck?.details).toContain(
      'Missing og:image:width and og:image:height metadata on deployed homepage'
    );
  });

  it('flags missing required PWA icon sizes in deployed manifest', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="canonical" href="${baseUrl}/" />
                <link rel="manifest" href="${baseUrl}/manifest.webmanifest" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <meta name="twitter:image" content="${baseUrl}/twitter-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/manifest.webmanifest`) {
          return new Response(
            JSON.stringify({
              icons: [{ src: `${baseUrl}/pwa-192x192.png`, sizes: '192x192' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const manifestCheck = visibility.checks.find(
      (c) => c.id === 'deployed-pwa-manifest'
    );
    expect(manifestCheck?.ok).toBe(false);
    expect(manifestCheck?.details).toContain('Missing required icon sizes');

    const iconCheck = visibility.checks.find(
      (c) => c.id === 'deployed-pwa-icons'
    );
    expect(iconCheck?.ok).toBe(false);
    expect(iconCheck?.details).toContain('512x512: missing manifest icon URL');
  });

  it('flags non-200 deployed PWA icon URLs', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="canonical" href="${baseUrl}/" />
                <link rel="manifest" href="${baseUrl}/manifest.webmanifest" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <meta name="twitter:image" content="${baseUrl}/twitter-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/manifest.webmanifest`) {
          return new Response(
            JSON.stringify({
              icons: [
                { src: `${baseUrl}/pwa-192x192.png`, sizes: '192x192' },
                { src: `${baseUrl}/pwa-512x512.png`, sizes: '512x512' },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/pwa-192x192.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/pwa-512x512.png`) {
          return new Response('missing', { status: 404 });
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const manifestCheck = visibility.checks.find(
      (c) => c.id === 'deployed-pwa-manifest'
    );
    expect(manifestCheck?.ok).toBe(true);

    const iconCheck = visibility.checks.find(
      (c) => c.id === 'deployed-pwa-icons'
    );
    expect(iconCheck?.ok).toBe(false);
    expect(iconCheck?.details).toContain('512x512: GET');
    expect(iconCheck?.details).toContain('returned 404');
  });

  it('flags relative social image metadata values as invalid', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="canonical" href="${baseUrl}/" />
                <meta property="og:image" content="/og-image.png" />
                <meta name="twitter:image" content="/twitter-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const ogImageCheck = visibility.checks.find(
      (c) => c.id === 'deployed-og-image'
    );
    expect(ogImageCheck?.ok).toBe(false);
    expect(ogImageCheck?.details).toContain(
      'og:image must be an absolute https URL'
    );

    const twitterImageCheck = visibility.checks.find(
      (c) => c.id === 'deployed-twitter-image'
    );
    expect(twitterImageCheck?.ok).toBe(false);
    expect(twitterImageCheck?.details).toContain(
      'twitter:image must be an absolute https URL'
    );
  });

  it('flags non-https social image metadata values as invalid', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="canonical" href="${baseUrl}/" />
                <meta property="og:image" content="http://cdn.example.com/og-image.png" />
                <meta name="twitter:image" content="http://cdn.example.com/twitter-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const ogImageCheck = visibility.checks.find(
      (c) => c.id === 'deployed-og-image'
    );
    expect(ogImageCheck?.ok).toBe(false);
    expect(ogImageCheck?.details).toContain(
      'og:image must be an absolute https URL'
    );

    const twitterImageCheck = visibility.checks.find(
      (c) => c.id === 'deployed-twitter-image'
    );
    expect(twitterImageCheck?.ok).toBe(false);
    expect(twitterImageCheck?.details).toContain(
      'twitter:image must be an absolute https URL'
    );
  });

  it('uses twitter:image:src when twitter:image is missing', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="canonical" href="${baseUrl}/" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <meta name="twitter:image:src" content="${baseUrl}/twitter-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const twitterImageCheck = visibility.checks.find(
      (c) => c.id === 'deployed-twitter-image'
    );
    expect(twitterImageCheck?.ok).toBe(true);
    expect(twitterImageCheck?.details).toContain('/twitter-image.png');
  });

  it('accepts reversed attribute order for canonical and social image metadata', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link href="${baseUrl}/favicon.ico" sizes="any" rel="icon" />
                <link href="${baseUrl}/" rel="canonical" />
                <meta content="${baseUrl}/og-image.png" property="og:image" />
                <meta content="${baseUrl}/twitter-image.png" name="twitter:image" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/favicon.ico`) {
          return new Response('icon-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/twitter-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    expect(
      visibility.checks.find((c) => c.id === 'deployed-canonical')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-og-image')?.ok
    ).toBe(true);
    expect(
      visibility.checks.find((c) => c.id === 'deployed-twitter-image')?.ok
    ).toBe(true);
    expect(visibility.checks.find((c) => c.id === 'deployed-favicon')?.ok).toBe(
      true
    );
  });

  it('flags deployed visibility when file-backed favicon metadata is missing', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="icon" href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />
                <link rel="canonical" href="${baseUrl}/" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const faviconCheck = visibility.checks.find(
      (c) => c.id === 'deployed-favicon'
    );
    expect(faviconCheck?.ok).toBe(false);
    expect(faviconCheck?.details).toContain(
      'Missing file-backed favicon metadata'
    );
  });

  it('flags deployed visibility when favicon URL is not reachable', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            `<html>
              <head>
                <link rel="icon" href="${baseUrl}/favicon.ico" sizes="any" />
                <link rel="canonical" href="${baseUrl}/" />
                <meta property="og:image" content="${baseUrl}/og-image.png" />
                <script type="application/ld+json">{}</script>
              </head>
            </html>`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/favicon.ico`) {
          return new Response('not found', { status: 404 });
        }
        if (url === `${baseUrl}/og-image.png`) {
          return new Response('image-bytes', { status: 200 });
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response(
            JSON.stringify({ generatedAt: new Date().toISOString() }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const faviconCheck = visibility.checks.find(
      (c) => c.id === 'deployed-favicon'
    );
    expect(faviconCheck?.ok).toBe(false);
    expect(faviconCheck?.details).toContain('returned 404');
  });

  it('marks freshness check as failed when deployed activity JSON is invalid', async () => {
    const baseUrl = 'https://hivemoot.github.io/colony';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === baseUrl) {
          return new Response(
            '<html><script type="application/ld+json">{}</script></html>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/robots.txt`) {
          return new Response(
            `User-agent: *\nSitemap: ${baseUrl}/sitemap.xml`,
            {
              status: 200,
            }
          );
        }
        if (url === `${baseUrl}/sitemap.xml`) {
          return new Response(
            '<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>',
            { status: 200 }
          );
        }
        if (url === `${baseUrl}/data/activity.json`) {
          return new Response('not-json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('not found', { status: 404 });
      }
    );

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: `${baseUrl}/`,
        topics: REQUIRED_DISCOVERABILITY_TOPICS,
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const freshnessCheck = visibility.checks.find(
      (c) => c.id === 'deployed-activity-freshness'
    );
    expect(freshnessCheck?.ok).toBe(false);
    expect(freshnessCheck?.details).toContain(
      'Invalid activity.json format on deployed site'
    );
  });

  it('fails topic check when required discoverability topics are missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('ok', { status: 200 });
    });

    const visibility = await buildExternalVisibility([
      {
        owner: 'hivemoot',
        name: 'colony',
        url: 'https://github.com/hivemoot/colony',
        stars: 1,
        forks: 1,
        openIssues: 1,
        homepage: 'https://hivemoot.github.io/colony/',
        topics: ['autonomous-agents', 'dashboard'],
        description: 'Open-source dashboard for autonomous agent governance',
      },
    ]);

    const topicsCheck = visibility.checks.find((c) => c.id === 'has-topics');
    expect(topicsCheck?.ok).toBe(false);
    expect(topicsCheck?.details).toContain('Missing required topics:');
    expect(topicsCheck?.details).toContain('ai-governance');
  });
});

describe('updateSitemapLastmod', () => {
  let tempDir: string;

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should update lastmod to the generation date', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sitemap-'));
    const sitemapPath = join(tempDir, 'sitemap.xml');
    writeFileSync(
      sitemapPath,
      '<?xml version="1.0"?>\n<urlset><url><lastmod>2026-02-11</lastmod></url></urlset>'
    );

    updateSitemapLastmod('2026-02-12T20:05:04.575Z', sitemapPath);

    const result = readFileSync(sitemapPath, 'utf-8');
    expect(result).toContain('<lastmod>2026-02-12</lastmod>');
    expect(result).not.toContain('2026-02-11');
  });

  it('should not throw when sitemap does not exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sitemap-'));
    const missingPath = join(tempDir, 'nonexistent.xml');

    expect(() =>
      updateSitemapLastmod('2026-02-12T20:05:04.575Z', missingPath)
    ).not.toThrow();
  });

  it('should not rewrite when lastmod is already current', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sitemap-'));
    const sitemapPath = join(tempDir, 'sitemap.xml');
    const content =
      '<?xml version="1.0"?>\n<urlset><url><lastmod>2026-02-12</lastmod></url></urlset>';
    writeFileSync(sitemapPath, content);

    updateSitemapLastmod('2026-02-12T20:05:04.575Z', sitemapPath);

    expect(readFileSync(sitemapPath, 'utf-8')).toBe(content);
  });

  it('should update all lastmod tags in a multi-URL sitemap', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sitemap-'));
    const sitemapPath = join(tempDir, 'sitemap.xml');
    writeFileSync(
      sitemapPath,
      '<?xml version="1.0"?>\n<urlset>' +
        '<url><loc>https://example.com/</loc><lastmod>2026-02-10</lastmod></url>' +
        '<url><loc>https://example.com/about</loc><lastmod>2026-02-09</lastmod></url>' +
        '</urlset>'
    );

    updateSitemapLastmod('2026-02-12T20:05:04.575Z', sitemapPath);

    const result = readFileSync(sitemapPath, 'utf-8');
    const matches = result.match(/<lastmod>2026-02-12<\/lastmod>/g);
    expect(matches).toHaveLength(2);
    expect(result).not.toContain('2026-02-10');
    expect(result).not.toContain('2026-02-09');
  });
});

const baseIssue: GitHubIssue = {
  number: 1,
  title: 'Test proposal',
  body: 'Test body',
  state: 'open',
  state_reason: null,
  labels: [],
  created_at: '2026-02-01T00:00:00Z',
  closed_at: null,
  user: { login: 'hivemoot-agent' },
  comments: 0,
};

describe('filterAndMapProposals', () => {
  it('includes issues with legacy phase: labels', () => {
    const issues: GitHubIssue[] = [
      { ...baseIssue, number: 1, labels: [{ name: 'phase:discussion' }] },
    ];
    const result = filterAndMapProposals(issues);
    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe('discussion');
  });

  it('includes issues with hivemoot:ready-to-implement label', () => {
    const issues: GitHubIssue[] = [
      {
        ...baseIssue,
        number: 100,
        title: 'New-era proposal',
        labels: [{ name: 'hivemoot:ready-to-implement' }],
      },
    ];
    const result = filterAndMapProposals(issues);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(100);
    expect(result[0].phase).toBe('ready-to-implement');
  });

  it('includes issues with hivemoot:implemented label', () => {
    const issues: GitHubIssue[] = [
      {
        ...baseIssue,
        number: 200,
        labels: [{ name: 'hivemoot:implemented' }],
        state: 'closed',
        state_reason: 'completed',
      },
    ];
    const result = filterAndMapProposals(issues);
    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe('implemented');
  });

  it('includes issues with hivemoot:inconclusive label', () => {
    const issues: GitHubIssue[] = [
      {
        ...baseIssue,
        number: 201,
        labels: [{ name: 'hivemoot:inconclusive' }],
        state: 'closed',
        state_reason: null,
      },
    ];
    const result = filterAndMapProposals(issues);
    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe('inconclusive');
  });

  it('drops non-phase hivemoot:* labels like hivemoot:merge-ready', () => {
    const issues: GitHubIssue[] = [
      {
        ...baseIssue,
        number: 300,
        labels: [{ name: 'hivemoot:merge-ready' }],
      },
    ];
    const result = filterAndMapProposals(issues);
    // merge-ready is not in validPhases, so it gets filtered out
    expect(result).toHaveLength(0);
  });

  it('handles a mix of legacy phase: and hivemoot: issues', () => {
    const issues: GitHubIssue[] = [
      { ...baseIssue, number: 10, labels: [{ name: 'phase:implemented' }] },
      {
        ...baseIssue,
        number: 400,
        labels: [{ name: 'hivemoot:ready-to-implement' }],
      },
      { ...baseIssue, number: 50, labels: [{ name: 'unrelated' }] },
    ];
    const result = filterAndMapProposals(issues);
    expect(result).toHaveLength(2);
    const numbers = result.map((p) => p.number).sort((a, b) => a - b);
    expect(numbers).toEqual([10, 400]);
  });

  it('attaches repoTag when provided', () => {
    const issues: GitHubIssue[] = [
      {
        ...baseIssue,
        number: 500,
        labels: [{ name: 'hivemoot:ready-to-implement' }],
      },
    ];
    const result = filterAndMapProposals(issues, 'hivemoot/colony');
    expect(result[0].repo).toBe('hivemoot/colony');
  });
});

describe('extractPhaseTransitions with hivemoot:* labels', () => {
  it('extracts hivemoot:* prefixed phase label events', () => {
    const timeline: GitHubTimelineEvent[] = [
      {
        event: 'labeled',
        label: { name: 'hivemoot:discussion' },
        created_at: '2026-02-10T10:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'hivemoot:voting' },
        created_at: '2026-02-11T10:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'hivemoot:ready-to-implement' },
        created_at: '2026-02-12T10:00:00Z',
      },
    ];
    const result = extractPhaseTransitions(timeline);
    expect(result).toEqual([
      { phase: 'discussion', enteredAt: '2026-02-10T10:00:00Z' },
      { phase: 'voting', enteredAt: '2026-02-11T10:00:00Z' },
      { phase: 'ready-to-implement', enteredAt: '2026-02-12T10:00:00Z' },
    ]);
  });

  it('handles a mix of phase: and hivemoot: prefixed events', () => {
    const timeline: GitHubTimelineEvent[] = [
      {
        event: 'labeled',
        label: { name: 'phase:discussion' },
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'hivemoot:voting' },
        created_at: '2026-01-02T00:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'hivemoot:implemented' },
        created_at: '2026-01-03T00:00:00Z',
      },
    ];
    const result = extractPhaseTransitions(timeline);
    expect(result).toEqual([
      { phase: 'discussion', enteredAt: '2026-01-01T00:00:00Z' },
      { phase: 'voting', enteredAt: '2026-01-02T00:00:00Z' },
      { phase: 'implemented', enteredAt: '2026-01-03T00:00:00Z' },
    ]);
  });
});
