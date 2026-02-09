import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentProfilePanel } from './AgentProfilePanel';
import type { ActivityData, ActivityEvent } from '../types/activity';

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-07T12:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [{ login: 'builder', avatarUrl: 'https://example.com/avatar.png' }],
    agentStats: [
      {
        login: 'builder',
        avatarUrl: 'https://example.com/avatar.png',
        commits: 20,
        pullRequestsMerged: 5,
        issuesOpened: 3,
        reviews: 8,
        comments: 15,
        lastActiveAt: '2026-02-07T10:00:00Z',
      },
    ],
    commits: [
      {
        sha: 'abc123',
        message: 'fix bug',
        author: 'builder',
        date: '2026-02-01T10:00:00Z',
      },
    ],
    issues: [
      {
        number: 1,
        title: 'Bug report',
        state: 'open',
        labels: [],
        author: 'builder',
        createdAt: '2026-02-03T10:00:00Z',
      },
    ],
    pullRequests: [
      {
        number: 10,
        title: 'Fix thing',
        state: 'merged',
        author: 'builder',
        createdAt: '2026-02-05T10:00:00Z',
        mergedAt: '2026-02-06T10:00:00Z',
      },
    ],
    comments: [
      {
        id: 1,
        issueOrPrNumber: 10,
        type: 'review',
        author: 'builder',
        body: 'LGTM',
        createdAt: '2026-02-05T12:00:00Z',
        url: 'https://example.com/comment/1',
      },
      {
        id: 2,
        issueOrPrNumber: 1,
        type: 'issue',
        author: 'builder',
        body: 'Working on it',
        createdAt: '2026-02-04T12:00:00Z',
        url: 'https://example.com/comment/2',
      },
    ],
    proposals: [
      {
        number: 100,
        title: 'Add dark mode',
        phase: 'implemented',
        author: 'builder',
        createdAt: '2026-02-02T10:00:00Z',
        commentCount: 5,
      },
      {
        number: 101,
        title: 'Fix navigation',
        phase: 'voting',
        author: 'builder',
        createdAt: '2026-02-04T10:00:00Z',
        commentCount: 3,
      },
    ],
    ...overrides,
  };
}

function makeEvents(): ActivityEvent[] {
  return [
    {
      id: '1',
      type: 'commit',
      summary: 'Committed fix bug',
      title: 'fix bug',
      actor: 'builder',
      createdAt: '2026-02-07T10:00:00Z',
      url: 'https://example.com/commit/1',
    },
    {
      id: '2',
      type: 'review',
      summary: 'Reviewed PR #10',
      title: 'Review',
      actor: 'builder',
      createdAt: '2026-02-06T10:00:00Z',
    },
    {
      id: '3',
      type: 'commit',
      summary: 'Other agent commit',
      title: 'other',
      actor: 'worker',
      createdAt: '2026-02-07T11:00:00Z',
    },
  ];
}

describe('AgentProfilePanel', () => {
  it('renders agent name and profile heading', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Agent Profile')).toBeInTheDocument();
    expect(screen.getByText('builder')).toBeInTheDocument();
  });

  it('renders back to dashboard button that calls onClose', () => {
    const onClose = vi.fn();
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={onClose}
      />
    );

    const backButton = screen.getByRole('button', {
      name: /back to dashboard/i,
    });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders contribution stats', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Commits')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('PRs Merged')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders primary role badge', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    // builder's primary role is coder (20 commits + 5 PRs = 25)
    // "Coder" appears in the badge and in the role breakdown legend
    expect(screen.getAllByText('Coder').length).toBeGreaterThanOrEqual(1);
  });

  it('renders role breakdown bar with accessible label', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Role Breakdown')).toBeInTheDocument();

    const roleBar = screen.getByRole('img', {
      name: /builder's role distribution/i,
    });
    expect(roleBar).toBeInTheDocument();
  });

  it('renders proposals authored by the agent', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Proposals Authored (2)')).toBeInTheDocument();
    expect(screen.getByText(/#100 Add dark mode/)).toBeInTheDocument();
    expect(screen.getByText(/#101 Fix navigation/)).toBeInTheDocument();
  });

  it('renders phase badges on proposals', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('implemented')).toBeInTheDocument();
    expect(screen.getByText('voting')).toBeInTheDocument();
  });

  it('renders recent activity filtered to the agent', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Committed fix bug')).toBeInTheDocument();
    expect(screen.getByText('Reviewed PR #10')).toBeInTheDocument();
    // Worker's event should not appear
    expect(screen.queryByText('Other agent commit')).not.toBeInTheDocument();
  });

  it('renders avatar with accessible alt text', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    const avatar = screen.getByAltText("builder's avatar");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('hides proposals section when agent has no proposals', () => {
    const data = makeData({ proposals: [] });
    render(
      <AgentProfilePanel
        data={data}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/Proposals Authored/)).not.toBeInTheDocument();
  });

  it('hides recent activity section when no events for agent', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={[]}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
  });

  it('renders review count from comments data', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    // builder has 1 review-type comment in our test data
    expect(screen.getByText('Reviews')).toBeInTheDocument();
    const reviewsStat = screen.getByText('Reviews').closest('div');
    expect(reviewsStat).toHaveTextContent('1');
  });

  it('shows active since date from earliest activity', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="builder"
        onClose={vi.fn()}
      />
    );

    // Earliest activity is commit on Feb 1
    expect(screen.getByText(/Active since Feb 1/)).toBeInTheDocument();
  });

  it('renders gracefully for unknown agent', () => {
    render(
      <AgentProfilePanel
        data={makeData()}
        events={makeEvents()}
        agentLogin="unknown-bot"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('unknown-bot')).toBeInTheDocument();
    expect(screen.getByText('Contributor')).toBeInTheDocument();
    expect(screen.queryByText(/Proposals Authored/)).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Activity')).not.toBeInTheDocument();
  });
});
