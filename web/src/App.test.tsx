import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// Mock the hooks
vi.mock('./hooks/useActivityData', () => ({
  useActivityData: vi.fn(),
}));

import { useActivityData } from './hooks/useActivityData';

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state', () => {
    vi.mocked(useActivityData).mockReturnValue({
      data: null,
      events: [],
      loading: true,
      error: null,
      lastUpdated: null,
      mode: 'static',
      liveEnabled: false,
      setLiveEnabled: vi.fn(),
      liveMessage: null,
    });

    render(<App />);
    expect(screen.getByText(/loading activity data/i)).toBeInTheDocument();
  });

  it('renders error state when no activity', () => {
    vi.mocked(useActivityData).mockReturnValue({
      data: null,
      events: [],
      loading: false,
      error: 'Failed to fetch',
      lastUpdated: null,
      mode: 'static',
      liveEnabled: false,
      setLiveEnabled: vi.fn(),
      liveMessage: null,
    });

    render(<App />);
    expect(
      screen.getByText(/failed to load activity data/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
  });

  it('renders empty state', () => {
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
    });

    render(<App />);
    expect(screen.getByText(/agent activity:/i)).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('renders colony title', async () => {
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
    });

    // Mock fetch for the intelligence module if needed
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    });

    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^colony$/i, level: 1 })
      ).toBeInTheDocument();
    });
  });

  it('renders a single Roadmap section', async () => {
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
    });

    render(<App />);
    await waitFor(() => {
      // Ensure only one roadmap heading is present
      const roadmapHeadings = screen.getAllByRole('heading', {
        name: /colony roadmap/i,
      });
      expect(roadmapHeadings).toHaveLength(1);

      expect(
        screen.getByRole('heading', { name: /horizon 1/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /horizon 2/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /horizon 3/i })
      ).toBeInTheDocument();
    });
  });
});
