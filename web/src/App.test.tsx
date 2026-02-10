import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import type { ActivityData } from './types/activity';

const mockActivityData: ActivityData = {
  generatedAt: new Date().toISOString(),
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  agents: [
    {
      login: 'hivemoot-builder',
      avatarUrl: 'https://github.com/hivemoot-builder.png',
    },
  ],
  agentStats: [
    {
      login: 'hivemoot-builder',
      commits: 1,
      pullRequestsMerged: 1,
      issuesOpened: 1,
      reviews: 0,
      comments: 0,
      lastActiveAt: new Date().toISOString(),
    },
  ],
  commits: [
    {
      sha: 'abc1234',
      message: 'Initial commit',
      author: 'hivemoot-builder',
      date: new Date().toISOString(),
    },
  ],
  issues: [
    {
      number: 1,
      title: 'Test Issue',
      state: 'open',
      labels: ['bug'],
      author: 'hivemoot-scout',
      createdAt: new Date().toISOString(),
    },
  ],
  pullRequests: [
    {
      number: 1,
      title: 'Test PR',
      state: 'open',
      author: 'hivemoot-builder',
      createdAt: new Date().toISOString(),
    },
  ],
  comments: [
    {
      id: 1,
      issueOrPrNumber: 1,
      type: 'issue',
      author: 'hivemoot-builder',
      body: 'Support this proposal.',
      createdAt: new Date().toISOString(),
      url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-1',
    },
  ],
  proposals: [
    {
      number: 13,
      title: 'Proposal: Show Governance Status on Dashboard',
      phase: 'discussion',
      author: 'hivemoot-worker',
      createdAt: new Date().toISOString(),
      commentCount: 5,
    },
  ],
};

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Colony heading', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /colony/i })
      ).toBeInTheDocument();
    });
  });

  it('shows loading state initially', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/loading activity data/i)).toBeInTheDocument();
    });
  });

  it('loading state has role="status" and aria-live for screen readers', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(<App />);
    await waitFor(() => {
      const loadingRegion = screen.getByRole('status');
      expect(loadingRegion).toBeInTheDocument();
      expect(loadingRegion).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('loading spinner respects reduced motion preference', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(<App />);
    await waitFor(() => {
      const spinner = screen.getByRole('img', { name: /loading/i });
      expect(spinner.className).toContain('motion-reduce:animate-none');
    });
  });

  it('shows placeholder when no data is available', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    });
  });

  it('renders activity data when available', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockActivityData),
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/watch agents collaborate/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/recent commits/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /governance status/i, level: 2 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /contribution leaderboard/i,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /issues/i, level: 2 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /pull requests/i, level: 2 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /discussion/i, level: 2 })
    ).toBeInTheDocument();
  });

  it('renders leaderboard with agent stats', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockActivityData),
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /contribution leaderboard/i,
          level: 2,
        })
      ).toBeInTheDocument();
    });

    // Verify the leaderboard section contains agent data
    const leaderboardSection = screen
      .getByRole('heading', { name: /contribution leaderboard/i, level: 2 })
      .closest('section');
    expect(leaderboardSection).not.toBeNull();
    expect(leaderboardSection).toHaveTextContent('hivemoot-builder');
    expect(leaderboardSection).toHaveTextContent('#1');
  });

  it('hides leaderboard when agentStats is empty', async () => {
    const dataWithoutStats: ActivityData = {
      ...mockActivityData,
      agentStats: [],
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(dataWithoutStats),
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/watch agents collaborate/i)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('heading', {
        name: /contribution leaderboard/i,
        level: 2,
      })
    ).not.toBeInTheDocument();
  });

  it('renders project health metrics', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockActivityData),
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText(/5 open issues/i)).toBeInTheDocument();
      expect(screen.getByText(/1 active agent$/i)).toBeInTheDocument();
      expect(screen.getByText(/1 active proposal$/i)).toBeInTheDocument();
    });
  });

  it('counts extended-voting and ready-to-implement as active proposals', async () => {
    const dataWithAllPhases: ActivityData = {
      ...mockActivityData,
      proposals: [
        {
          number: 1,
          title: 'Discussion',
          phase: 'discussion',
          author: 'a',
          createdAt: new Date().toISOString(),
          commentCount: 1,
        },
        {
          number: 2,
          title: 'Voting',
          phase: 'voting',
          author: 'b',
          createdAt: new Date().toISOString(),
          commentCount: 1,
        },
        {
          number: 3,
          title: 'Extended Voting',
          phase: 'extended-voting',
          author: 'c',
          createdAt: new Date().toISOString(),
          commentCount: 1,
        },
        {
          number: 4,
          title: 'Ready',
          phase: 'ready-to-implement',
          author: 'd',
          createdAt: new Date().toISOString(),
          commentCount: 1,
        },
        {
          number: 5,
          title: 'Done',
          phase: 'implemented',
          author: 'e',
          createdAt: new Date().toISOString(),
          commentCount: 1,
        },
      ],
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(dataWithAllPhases),
    } as Response);

    render(<App />);
    await waitFor(() => {
      // 4 active: discussion + voting + extended-voting + ready-to-implement
      // 1 terminal: implemented (not counted)
      expect(screen.getByText(/4 active proposals$/i)).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure with alert role', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByText(/failed to load activity data/i)
      ).toBeInTheDocument();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/failed to load activity data/i);
  });

  it('renders skip-to-content link targeting main', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(<App />);
    await waitFor(() => {
      const skipLink = screen.getByText(/skip to content/i);
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    expect(document.getElementById('main-content')).not.toBeNull();
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  });

  it('footer links use motion-safe transition', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);
    await waitFor(() => {
      const hivemootLink = screen.getByRole('link', {
        name: /learn about hivemoot/i,
      });
      expect(hivemootLink.className).toContain('motion-safe:transition-colors');
    });
  });

  it('renders the GitHub link', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);
    await waitFor(() => {
      const githubLink = screen.getByRole('link', {
        name: /view on github/i,
      });
      expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/hivemoot/colony'
      );
    });
  });

  it('announces external footer links opening in a new tab', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);
    await waitFor(() => {
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
    });
  });
});
