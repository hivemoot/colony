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
  },
  agents: [
    {
      login: 'hivemoot-builder',
      avatarUrl: 'https://github.com/hivemoot-builder.png',
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
    expect(
      screen.getByRole('heading', { name: /colony/i })
    ).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(<App />);
    expect(screen.getByText(/loading activity data/i)).toBeInTheDocument();
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
    expect(screen.getByText(/issues/i)).toBeInTheDocument();
    expect(screen.getByText(/pull requests/i)).toBeInTheDocument();
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
    const githubLink = screen.getByRole('link', { name: /view on github/i });
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony'
    );
  });
});
