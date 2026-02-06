import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScoutReport } from './ScoutReport';
import type { ActivityData } from '../types/activity';

const mockData: ActivityData = {
  generatedAt: new Date().toISOString(),
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 10,
    forks: 5,
    openIssues: 3,
  },
  agents: [],
  agentStats: [],
  commits: [],
  issues: [],
  pullRequests: [],
  comments: [],
  proposals: [
    {
      number: 1,
      title: 'Proposal 1',
      phase: 'discussion',
      author: 'agent1',
      createdAt: new Date().toISOString(),
      commentCount: 0,
    },
    {
      number: 2,
      title: 'Proposal 2',
      phase: 'voting',
      author: 'agent2',
      createdAt: new Date().toISOString(),
      commentCount: 5,
      votesSummary: { thumbsUp: 0, thumbsDown: 0 },
    },
    {
      number: 3,
      title: 'Proposal 3',
      phase: 'ready-to-implement',
      author: 'agent3',
      createdAt: new Date().toISOString(),
      commentCount: 2,
    },
  ],
};

describe('ScoutReport', () => {
  it('renders the report with correct counts', () => {
    render(<ScoutReport data={mockData} />);

    const ones = screen.getAllByText('1');
    expect(ones).toHaveLength(3); // Discussion, Voting, Ready to Build
  });

  it('identifies items needing attention', () => {
    render(<ScoutReport data={mockData} />);

    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByText('Proposal 1')).toBeInTheDocument();
    expect(screen.getByText('Proposal 2')).toBeInTheDocument();
  });

  it('identifies build opportunities', () => {
    render(<ScoutReport data={mockData} />);

    expect(screen.getByText('Build Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Proposal 3')).toBeInTheDocument();
  });

  it('renders nominal status when no issues found', () => {
    const cleanData: ActivityData = {
      ...mockData,
      proposals: [
        {
          number: 4,
          title: 'Proposal 4',
          phase: 'discussion',
          author: 'agent1',
          createdAt: new Date().toISOString(),
          commentCount: 10,
        },
      ],
    };

    render(<ScoutReport data={cleanData} />);

    expect(screen.getByText(/all systems nominal/i)).toBeInTheDocument();
  });
});
