import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { ActivityData, ActivityEvent } from './types/activity';

vi.mock('./hooks/useActivityData', () => ({
  useActivityData: vi.fn(),
}));

import { useActivityData } from './hooks/useActivityData';

vi.mock('./hooks/useGovernanceHistory', () => ({
  useGovernanceHistory: (): { history: unknown[] } => ({ history: [] }),
}));

const now = new Date().toISOString();

const mockData: ActivityData = {
  generatedAt: now,
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  repositories: [
    {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 42,
      forks: 8,
      openIssues: 5,
    },
  ],
  agents: [{ login: 'hivemoot-builder' }],
  agentStats: [
    {
      login: 'hivemoot-builder',
      commits: 3,
      pullRequestsMerged: 2,
      issuesOpened: 1,
      reviews: 1,
      comments: 4,
      lastActiveAt: now,
    },
  ],
  commits: [
    { sha: 'abc1234', message: 'Initial commit', author: 'builder', date: now },
  ],
  issues: [
    {
      number: 1,
      title: 'Test issue',
      state: 'open',
      labels: ['bug'],
      author: 'hivemoot-scout',
      createdAt: now,
    },
  ],
  pullRequests: [
    {
      number: 1,
      title: 'Test PR',
      state: 'open',
      author: 'hivemoot-builder',
      createdAt: now,
    },
  ],
  proposals: [
    {
      number: 10,
      title: 'Proposal under discussion',
      phase: 'discussion',
      author: 'hivemoot-worker',
      createdAt: now,
      commentCount: 5,
    },
  ],
  comments: [
    {
      id: 1,
      issueOrPrNumber: 10,
      type: 'issue',
      author: 'hivemoot-worker',
      body: 'Looks good',
      createdAt: now,
      url: 'https://github.com/hivemoot/colony/issues/10#issuecomment-1',
    },
  ],
  externalVisibility: {
    status: 'yellow',
    score: 60,
    checks: [
      {
        id: 'has-homepage',
        label: 'Repository homepage URL configured',
        ok: false,
      },
    ],
    blockers: ['Repository homepage URL configured'],
  },
};

const mockEvents: ActivityEvent[] = [
  {
    id: 'evt-1',
    type: 'proposal',
    summary: 'New proposal created',
    title: 'Proposal under discussion',
    actor: 'hivemoot-worker',
    createdAt: now,
  },
];

function mockHookReturn(
  overrides: Partial<ReturnType<typeof useActivityData>>
): void {
  vi.mocked(useActivityData).mockReturnValue({
    data: null,
    events: [],
    loading: false,
    error: null,
    lastUpdated: null,
    mode: 'static',
    liveEnabled: false,
    setLiveEnabled: vi.fn(),
    liveMessage: null,
    ...overrides,
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state with status semantics', () => {
    mockHookReturn({ loading: true });

    render(<App />);
    expect(screen.getByText(/loading activity data/i)).toBeInTheDocument();
    const loadingRegion = screen.getByRole('status');
    expect(loadingRegion).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('img', { name: /loading/i }).className).toContain(
      'motion-reduce:animate-none'
    );
  });

  it('renders error state with alert role when no activity exists', () => {
    mockHookReturn({ error: 'Failed to fetch activity data: 500' });

    render(<App />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/failed to load activity data/i);
    expect(alert).toHaveTextContent(/500/i);
  });

  it('renders empty state', () => {
    mockHookReturn({});

    render(<App />);
    expect(screen.getByText(/agent activity:/i)).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('renders the colony title', async () => {
    mockHookReturn({});

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^colony$/i, level: 1 })
      ).toBeInTheDocument();
    });
  });

  it('renders skip-to-content link targeting main content', () => {
    mockHookReturn({});

    render(<App />);

    const skipLink = screen.getByRole('link', { name: /skip to content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  });

  it('renders sticky section navigation hash links when activity is present', async () => {
    mockHookReturn({
      data: mockData,
      events: mockEvents,
      lastUpdated: new Date(),
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: /dashboard sections/i })
      ).toBeInTheDocument();
    });

    const sectionNav = screen.getByRole('navigation', {
      name: /dashboard sections/i,
    });
    expect(sectionNav.querySelector('a[href="#main-content"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#live-mode"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#activity"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#intelligence"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#proposals"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#ops"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#agents"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#roadmap"]')).not.toBeNull();
    expect(sectionNav.querySelector('a[href="#visibility"]')).not.toBeNull();
  });

  it('counts active proposals across discussion, voting, extended-voting, and ready-to-implement', async () => {
    const dataWithAllPhases: ActivityData = {
      ...mockData,
      proposals: [
        {
          number: 1,
          title: 'Discussion',
          phase: 'discussion',
          author: 'a',
          createdAt: now,
          commentCount: 1,
        },
        {
          number: 2,
          title: 'Voting',
          phase: 'voting',
          author: 'b',
          createdAt: now,
          commentCount: 1,
        },
        {
          number: 3,
          title: 'Extended Voting',
          phase: 'extended-voting',
          author: 'c',
          createdAt: now,
          commentCount: 1,
        },
        {
          number: 4,
          title: 'Ready',
          phase: 'ready-to-implement',
          author: 'd',
          createdAt: now,
          commentCount: 1,
        },
        {
          number: 5,
          title: 'Implemented',
          phase: 'implemented',
          author: 'e',
          createdAt: now,
          commentCount: 1,
        },
      ],
    };
    mockHookReturn({ data: dataWithAllPhases, events: mockEvents });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/4 active proposals$/i)).toBeInTheDocument();
    });
  });

  it('hides leaderboard section when agent stats are empty', async () => {
    mockHookReturn({
      data: {
        ...mockData,
        agentStats: [],
      },
      events: mockEvents,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/watch agents collaborate/i)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('heading', {
        name: /contribution leaderboard/i,
      })
    ).not.toBeInTheDocument();
  });

  it('uses secure external-link semantics in footer', () => {
    mockHookReturn({});

    render(<App />);

    const githubLink = screen.getByRole('link', {
      name: /view on github \(opens in a new tab\)/i,
    });
    const hivemootLink = screen.getByRole('link', {
      name: /learn about hivemoot \(opens in a new tab\)/i,
    });

    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(hivemootLink).toHaveAttribute('target', '_blank');
    expect(hivemootLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(githubLink.className).toContain('motion-safe:transition-colors');
    expect(hivemootLink.className).toContain('motion-safe:transition-colors');
  });

  it('renders roadmap details when parsed roadmap data is present', async () => {
    const dataWithRoadmap: ActivityData = {
      ...mockData,
      roadmap: {
        horizons: [
          {
            id: 1,
            title: 'Horizon 1: Polish',
            subtitle: 'Polish baseline',
            status: 'Done',
            items: [{ task: 'A11y pass', done: true }],
          },
        ],
        currentStatus: 'Roadmap synced with source markdown.',
      },
    };

    mockHookReturn({
      data: dataWithRoadmap,
      events: mockEvents,
      lastUpdated: new Date(),
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /colony roadmap/i })
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: /horizon 1: polish/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/roadmap synced with source markdown\./i)
    ).toBeInTheDocument();
  });

  it('shows roadmap fallback copy when activity exists without roadmap data', async () => {
    mockHookReturn({
      data: mockData,
      events: mockEvents,
      lastUpdated: new Date(),
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(/roadmap data is not available yet\./i)
      ).toBeInTheDocument();
    });
  });

  it('derives current roadmap phase from the first incomplete horizon', async () => {
    const dataWithRoadmap: ActivityData = {
      ...mockData,
      roadmap: {
        horizons: [
          {
            id: 1,
            title: 'Horizon 1: Complete the Polish Cycle',
            subtitle: 'Polish baseline',
            status: 'Done/Ongoing',
            items: [{ task: 'A11y pass', done: true }],
          },
          {
            id: 2,
            title: 'Horizon 2: Make Colony Useful',
            subtitle: 'Utility',
            status: 'Done',
            items: [{ task: 'Proposal detail view', done: true }],
          },
          {
            id: 3,
            title: 'Horizon 3: Prove the Model Scales',
            subtitle: 'Scale',
            status: 'Upcoming',
            items: [{ task: 'Cross-project instances', done: false }],
          },
        ],
        currentStatus: 'Horizon 3 is now the active focus.',
      },
    };

    mockHookReturn({
      data: dataWithRoadmap,
      events: mockEvents,
      lastUpdated: new Date(),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/current phase: horizon 3/i)).toBeInTheDocument();
    });
  });

  it('shows back-to-top button after scrolling and scrolls smoothly on click', async () => {
    const scrollToSpy = vi.fn();
    vi.stubGlobal('scrollTo', scrollToSpy);

    mockHookReturn({
      data: mockData,
      events: mockEvents,
      lastUpdated: new Date(),
    });

    Object.defineProperty(window, 'scrollY', {
      value: 500,
      writable: true,
      configurable: true,
    });

    render(<App />);
    fireEvent.scroll(window);

    const backToTopButton = await screen.findByRole('button', {
      name: /back to top/i,
    });
    fireEvent.click(backToTopButton);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('renders external visibility section when visibility data is present', async () => {
    mockHookReturn({ data: mockData, events: mockEvents });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /external visibility/i })
      ).toBeInTheDocument();
    });
  });
});
