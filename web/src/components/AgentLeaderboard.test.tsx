import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentLeaderboard } from './AgentLeaderboard';
import type { AgentStats } from '../types/activity';

const stats: AgentStats[] = [
  {
    login: 'agent-1',
    commits: 10,
    pullRequestsMerged: 5,
    issuesOpened: 2,
    reviews: 0,
    comments: 0,
    lastActiveAt: new Date().toISOString(),
  },
  {
    login: 'agent-2',
    commits: 8,
    pullRequestsMerged: 3,
    issuesOpened: 1,
    reviews: 0,
    comments: 0,
    lastActiveAt: new Date().toISOString(),
  },
];

describe('AgentLeaderboard', () => {
  it('renders "No contribution data available" when stats array is empty', () => {
    render(<AgentLeaderboard stats={[]} />);
    expect(
      screen.getByText(/no contribution data available/i)
    ).toBeInTheDocument();
  });

  it('renders a table with agent statistics', () => {
    render(<AgentLeaderboard stats={[stats[0]]} />);

    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders multiple agents in order', () => {
    render(<AgentLeaderboard stats={stats} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
  });

  it('renders last active timestamp in a semantic time element', () => {
    const isoDate = '2026-02-05T10:00:00Z';
    const statsWithDate: AgentStats[] = [
      {
        login: 'agent-1',
        commits: 1,
        pullRequestsMerged: 0,
        issuesOpened: 0,
        reviews: 0,
        comments: 0,
        lastActiveAt: isoDate,
      },
    ];

    render(<AgentLeaderboard stats={statsWithDate} />);

    const timeEl = document.querySelector('time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute('datetime', isoDate);
  });

  it('calls onSelectAgent when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<AgentLeaderboard stats={stats} onSelectAgent={onSelect} />);

    const row = screen.getByText('agent-1').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('agent-1');
  });

  it('calls onSelectAgent with null when clicking already-selected row', () => {
    const onSelect = vi.fn();
    render(
      <AgentLeaderboard
        stats={stats}
        selectedAgent="agent-1"
        onSelectAgent={onSelect}
      />
    );

    const row = screen.getByText('agent-1').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('dims unselected rows when one agent is selected', () => {
    render(<AgentLeaderboard stats={stats} selectedAgent="agent-1" />);

    const selectedRow = screen.getByText('agent-1').closest('tr');
    const otherRow = screen.getByText('agent-2').closest('tr');
    expect(selectedRow).not.toBeNull();
    expect(otherRow).not.toBeNull();

    expect((otherRow as HTMLElement).className).toContain('opacity-40');
    expect((selectedRow as HTMLElement).className).not.toContain('opacity-40');
  });

  it('calls onSelectAgent when filter button is clicked', () => {
    const onSelect = vi.fn();
    render(<AgentLeaderboard stats={stats} onSelectAgent={onSelect} />);

    const button = screen.getByLabelText('Filter by agent-1');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('agent-1');
  });

  it('includes focus ring offset on agent name links', () => {
    const stats = [
      {
        login: 'agent-1',
        commits: 5,
        pullRequestsMerged: 2,
        issuesOpened: 1,
        reviews: 3,
        comments: 10,
        lastActiveAt: '2026-02-05T09:00:00Z',
      },
    ];
    render(
      <AgentLeaderboard
        stats={stats}
        onSelectAgent={vi.fn()}
        selectedAgent={null}
      />
    );

    const link = screen.getByRole('link', { name: 'agent-1' });
    expect(link.className).toContain('focus-visible:ring-offset-2');
    expect(link.className).toContain(
      'dark:focus-visible:ring-offset-neutral-900'
    );
  });

  it('has proper ARIA attributes on the filter button', () => {
    render(<AgentLeaderboard stats={stats} selectedAgent="agent-1" />);

    const selectedButton = screen.getByLabelText('Filter by agent-1');
    const otherButton = screen.getByLabelText('Filter by agent-2');

    expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    expect(otherButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('preserves table row semantics without role=button', () => {
    render(<AgentLeaderboard stats={stats} />);

    const row = screen.getByText('agent-1').closest('tr');
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute('role', 'button');
    expect(row).not.toHaveAttribute('tabindex');
  });
});
