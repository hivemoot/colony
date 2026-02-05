import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import { createActivityData } from './test/fixtures/activity';
import type { ActivityData } from './types/activity';

const mockActivityData = createActivityData();

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

    // Comments should appear in the activity timeline (as event badges)
    expect(
      screen.getAllByText(/commented on issue #1/i).length
    ).toBeGreaterThanOrEqual(1);
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
    });
  });

  it('shows error state on fetch failure', async () => {
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
});
