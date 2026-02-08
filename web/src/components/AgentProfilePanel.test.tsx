import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentProfilePanel } from './AgentProfilePanel';
import type { ActivityData, ActivityEvent } from '../types/activity';

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
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
    agents: [{ login: 'builder' }, { login: 'worker' }],
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
    ],
    issues: [],
    pullRequests: [
      {
        number: 20,
        title: 'feat: PR by builder',
        state: 'merged',
        author: 'builder',
        createdAt: '2026-02-06T12:00:00Z',
        mergedAt: '2026-02-07T12:00:00Z',
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
    ],
    ...overrides,
  };
}

const events: ActivityEvent[] = [
  {
    id: '1',
    type: 'commit',
    summary: 'builder committed',
    title: 'feat: add feature',
    actor: 'builder',
    createdAt: '2026-02-08T10:00:00Z',
  },
  {
    id: '2',
    type: 'comment',
    summary: 'worker commented',
    title: 'Review comment',
    actor: 'worker',
    createdAt: '2026-02-08T09:00:00Z',
  },
];

describe('AgentProfilePanel', () => {
  it('renders agent name and primary role badge', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    // The summary card heading contains the agent name as a link
    const summarySection = screen.getByRole('region', {
      name: 'builder profile',
    });
    expect(summarySection).toBeInTheDocument();

    // Builder should have a primary role based on their stats
    const roles = ['Coder', 'Reviewer', 'Proposer', 'Discussant'];
    const roleBadge = roles.some((r) => screen.queryByText(r));
    expect(roleBadge).toBe(true);
  });

  it('renders contribution stats', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('15')).toBeInTheDocument(); // commits
    expect(screen.getByText('8')).toBeInTheDocument(); // PRs merged
    expect(screen.getByText('10')).toBeInTheDocument(); // reviews
    expect(screen.getByText('5')).toBeInTheDocument(); // issues
    expect(screen.getByText('20')).toBeInTheDocument(); // comments
  });

  it('shows stat labels', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Commits')).toBeInTheDocument();
    expect(screen.getByText('PRs Merged')).toBeInTheDocument();
    expect(screen.getByText('Reviews')).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('renders back button that calls onClose', () => {
    const onClose = vi.fn();
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={onClose}
      />
    );

    const backButton = screen.getByText('Back to Dashboard');
    fireEvent.click(backButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders proposals authored by the agent', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Proposals (1)')).toBeInTheDocument();
    expect(screen.getByText(/#100 Add agent profiles/)).toBeInTheDocument();
  });

  it('does not show proposals by other agents', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/#101 Fix bug/)).not.toBeInTheDocument();
  });

  it('renders phase badges on proposals', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('ready-to-implement')).toBeInTheDocument();
  });

  it('filters activity timeline to selected agent', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    // Builder's event should be visible
    expect(screen.getByText('feat: add feature')).toBeInTheDocument();
    // Worker's event should NOT be visible
    expect(screen.queryByText('Review comment')).not.toBeInTheDocument();
  });

  it('shows empty state for unknown agent', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="unknown-agent"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/no profile data available/i)).toBeInTheDocument();
  });

  it('renders collaborators section', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Collaborators')).toBeInTheDocument();
    // worker commented on builder's PR, so should appear
    expect(
      screen.getByRole('list', { name: /collaborators of builder/i })
    ).toBeInTheDocument();
  });

  it('has accessible region label', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole('region', { name: 'builder profile' })
    ).toBeInTheDocument();
  });

  it('renders active since date', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/active since/i)).toBeInTheDocument();
  });

  it('renders last seen timestamp', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/last seen/i)).toBeInTheDocument();
  });

  it('renders total contributions count', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    // 15 + 8 + 5 + 10 + 20 = 58
    expect(screen.getByText('58 total contributions')).toBeInTheDocument();
  });

  it('renders role distribution bar with accessible label', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole('img', { name: /role distribution/i })
    ).toBeInTheDocument();
  });

  it('renders avatar with alt text', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    const avatar = screen.getByAltText("builder's avatar");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', 'https://github.com/builder.png');
  });

  it('links proposals to GitHub issue URLs', () => {
    const data = makeData();
    render(
      <AgentProfilePanel
        data={data}
        events={events}
        selectedAgent="builder"
        onClose={vi.fn()}
      />
    );

    const link = screen.getByText(/#100 Add agent profiles/);
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/100'
    );
  });
});
