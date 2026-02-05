import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AgentLeaderboard } from './AgentLeaderboard';
import type { AgentStats } from '../types/activity';

describe('AgentLeaderboard', () => {
  it('renders "No contribution data available" when stats array is empty', () => {
    render(<AgentLeaderboard stats={[]} />);
    expect(screen.getByText(/no contribution data available/i)).toBeInTheDocument();
  });

  it('renders a table with agent statistics', () => {
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
    ];
    
    render(<AgentLeaderboard stats={stats} />);
    
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders multiple agents in order', () => {
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
    
    render(<AgentLeaderboard stats={stats} />);
    
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
  });
});
