import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActivityFeed } from './ActivityFeed';
import type { ActivityData, ActivityEvent } from '../types/activity';

// Mock formatTimeAgo to return predictable values
vi.mock('../utils/time', () => ({
  formatTimeAgo: (): string => '5 minutes ago',
}));

const mockData: ActivityData = {
  generatedAt: '2026-02-05T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  agents: [{ login: 'worker' }],
  agentStats: [
    {
      login: 'worker',
      commits: 10,
      pullRequestsMerged: 5,
      issuesOpened: 3,
      reviews: 2,
      comments: 8,
      lastActiveAt: '2026-02-05T10:00:00Z',
    },
  ],
  commits: [
    {
      sha: 'abc123',
      message: 'Test commit',
      author: 'worker',
      date: '2026-02-05T10:00:00Z',
    },
  ],
  issues: [
    {
      number: 1,
      title: 'Test issue',
      state: 'open',
      labels: [],
      author: 'scout',
      createdAt: '2026-02-05T09:00:00Z',
    },
  ],
  pullRequests: [
    {
      number: 1,
      title: 'Test PR',
      state: 'open',
      author: 'worker',
      createdAt: '2026-02-05T08:00:00Z',
    },
  ],
  comments: [
    {
      id: 1,
      issueOrPrNumber: 1,
      type: 'issue',
      author: 'worker',
      body: 'Test comment',
      createdAt: '2026-02-05T07:00:00Z',
      url: 'https://github.com/hivemoot/colony/issues/1#comment-1',
    },
  ],
  proposals: [
    {
      number: 10,
      title: 'Test proposal',
      phase: 'discussion',
      author: 'worker',
      createdAt: '2026-02-05T06:00:00Z',
      commentCount: 5,
    },
  ],
};

const mockEvents: ActivityEvent[] = [
  {
    id: 'commit-abc123',
    type: 'commit',
    summary: 'Commit pushed',
    title: 'abc123 Test commit',
    url: 'https://github.com/hivemoot/colony/commit/abc123',
    actor: 'worker',
    createdAt: '2026-02-05T10:00:00Z',
  },
];

describe('ActivityFeed', () => {
  const defaultProps = {
    data: mockData,
    events: mockEvents,
    mode: 'static' as const,
    lastUpdated: new Date('2026-02-05T12:00:00Z'),
    liveEnabled: false,
    onToggleLive: vi.fn(),
    liveMessage: null,
    selectedAgent: null,
    onSelectAgent: vi.fn(),
  };

  it('renders the activity feed header', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByText('Live Activity Feed')).toBeInTheDocument();
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
  });

  it('renders status label for static mode', () => {
    render(<ActivityFeed {...defaultProps} mode="static" />);
    expect(screen.getByText('Static')).toBeInTheDocument();
  });

  it('renders status label for live mode', () => {
    render(<ActivityFeed {...defaultProps} mode="live" liveEnabled={true} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders status label for connecting mode', () => {
    render(
      <ActivityFeed {...defaultProps} mode="connecting" liveEnabled={true} />
    );
    expect(screen.getByText('Connecting')).toBeInTheDocument();
  });

  it('renders status label for fallback mode', () => {
    render(
      <ActivityFeed {...defaultProps} mode="fallback" liveEnabled={true} />
    );
    expect(screen.getByText('Static (fallback)')).toBeInTheDocument();
  });

  it('renders live mode checkbox', () => {
    render(<ActivityFeed {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('calls onToggleLive when checkbox is clicked', () => {
    const onToggleLive = vi.fn();
    render(<ActivityFeed {...defaultProps} onToggleLive={onToggleLive} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onToggleLive).toHaveBeenCalledWith(true);
  });

  it('renders live message when provided', () => {
    render(
      <ActivityFeed
        {...defaultProps}
        liveMessage="Connecting to GitHub live feed…"
      />
    );
    expect(
      screen.getByText('Connecting to GitHub live feed…')
    ).toBeInTheDocument();
  });

  it('does not render live message when null', () => {
    render(<ActivityFeed {...defaultProps} liveMessage={null} />);
    expect(screen.queryByText(/connecting to github/i)).not.toBeInTheDocument();
  });

  it('renders Active Agents section when data is provided', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
  });

  it('renders Contribution Leaderboard when agentStats are present', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByText('Contribution Leaderboard')).toBeInTheDocument();
  });

  it('does not render Contribution Leaderboard when agentStats are empty', () => {
    const dataWithoutStats = { ...mockData, agentStats: [] };
    render(<ActivityFeed {...defaultProps} data={dataWithoutStats} />);
    expect(
      screen.queryByText('Contribution Leaderboard')
    ).not.toBeInTheDocument();
  });

  it('renders Governance Status section when proposals are present', () => {
    render(<ActivityFeed {...defaultProps} />);
    expect(screen.getByText('Governance Status')).toBeInTheDocument();
  });

  it('does not render Governance Status when proposals are empty', () => {
    const dataWithoutProposals = { ...mockData, proposals: [] };
    render(<ActivityFeed {...defaultProps} data={dataWithoutProposals} />);
    expect(screen.queryByText('Governance Status')).not.toBeInTheDocument();
  });

  it('renders all data sections when data is provided', () => {
    render(<ActivityFeed {...defaultProps} />);

    expect(screen.getByText('Recent Commits')).toBeInTheDocument();
    // 'Issues' appears twice (in leaderboard table header and in the Issues section)
    expect(
      screen.getByRole('heading', { name: /issues/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Pull Requests')).toBeInTheDocument();
    expect(screen.getByText('Discussion')).toBeInTheDocument();
  });

  it('does not render data sections when data is null', () => {
    render(<ActivityFeed {...defaultProps} data={null} />);

    expect(screen.queryByText('Active Agents')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Commits')).not.toBeInTheDocument();
    expect(screen.queryByText('Issues')).not.toBeInTheDocument();
    expect(screen.queryByText('Pull Requests')).not.toBeInTheDocument();
    expect(screen.queryByText('Discussion')).not.toBeInTheDocument();
  });

  it('displays "unknown" when lastUpdated is null', () => {
    render(<ActivityFeed {...defaultProps} lastUpdated={null} />);
    expect(screen.getByText(/last updated: unknown/i)).toBeInTheDocument();
  });

  it('renders last updated timestamp in a semantic time element', () => {
    render(<ActivityFeed {...defaultProps} />);
    const paragraph = screen.getByText(/last updated/i);
    const timeEl = paragraph.querySelector('time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute('datetime', '2026-02-05T12:00:00.000Z');
  });

  it('does not render a time element when lastUpdated is null', () => {
    render(<ActivityFeed {...defaultProps} lastUpdated={null} />);
    const paragraph = screen.getByText(/last updated: unknown/i);
    expect(paragraph.querySelector('time')).toBeNull();
  });

  describe('agent filtering', () => {
    const multiAgentData: ActivityData = {
      ...mockData,
      agents: [{ login: 'worker' }, { login: 'scout' }],
      commits: [
        {
          sha: 'abc123',
          message: 'Worker commit',
          author: 'worker',
          date: '2026-02-05T10:00:00Z',
        },
        {
          sha: 'def456',
          message: 'Scout commit',
          author: 'scout',
          date: '2026-02-05T09:00:00Z',
        },
      ],
      issues: [
        {
          number: 1,
          title: 'Scout issue',
          state: 'open',
          labels: [],
          author: 'scout',
          createdAt: '2026-02-05T09:00:00Z',
        },
      ],
      pullRequests: [
        {
          number: 1,
          title: 'Worker PR',
          state: 'open',
          author: 'worker',
          createdAt: '2026-02-05T08:00:00Z',
        },
      ],
      comments: [
        {
          id: 1,
          issueOrPrNumber: 1,
          type: 'issue',
          author: 'scout',
          body: 'Scout comment',
          createdAt: '2026-02-05T07:00:00Z',
          url: 'https://example.com/1',
        },
      ],
    };

    const multiAgentEvents: ActivityEvent[] = [
      {
        id: 'e1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Worker commit',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
      {
        id: 'e2',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Scout commit',
        actor: 'scout',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    it('shows filter indicator when an agent is selected', () => {
      render(
        <ActivityFeed
          {...defaultProps}
          data={multiAgentData}
          events={multiAgentEvents}
          selectedAgent="worker"
        />
      );

      expect(screen.getByText(/filtered by:/i)).toBeInTheDocument();
      expect(screen.getByText('Clear filter')).toBeInTheDocument();
    });

    it('does not show filter indicator when no agent is selected', () => {
      render(
        <ActivityFeed
          {...defaultProps}
          data={multiAgentData}
          events={multiAgentEvents}
          selectedAgent={null}
        />
      );

      expect(screen.queryByText('Clear filter')).not.toBeInTheDocument();
    });

    it('calls onSelectAgent(null) when Clear filter is clicked', () => {
      const onSelectAgent = vi.fn();
      render(
        <ActivityFeed
          {...defaultProps}
          data={multiAgentData}
          events={multiAgentEvents}
          selectedAgent="worker"
          onSelectAgent={onSelectAgent}
        />
      );

      fireEvent.click(screen.getByText('Clear filter'));
      expect(onSelectAgent).toHaveBeenCalledWith(null);
    });
  });
});
