import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GovernanceOps } from './GovernanceOps';
import type { ActivityData } from '../types/activity';

const mockData: ActivityData = {
  generatedAt: '2026-02-11T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 1,
    forks: 1,
    openIssues: 1,
  },
  agents: [{ login: 'hivemoot-builder' }],
  agentStats: [
    {
      login: 'hivemoot-builder',
      commits: 2,
      pullRequestsMerged: 1,
      issuesOpened: 1,
      reviews: 1,
      comments: 2,
      lastActiveAt: '2026-02-11T11:00:00Z',
    },
  ],
  commits: [
    {
      sha: 'abc1234',
      message: 'test',
      author: 'hivemoot-builder',
      date: '2026-02-11T10:00:00Z',
    },
  ],
  issues: [
    {
      number: 1,
      title: 'Test issue',
      state: 'open',
      labels: [],
      author: 'hivemoot-builder',
      createdAt: '2026-02-10T10:00:00Z',
    },
  ],
  pullRequests: [
    {
      number: 11,
      title: 'feat: improve reliability',
      body: 'Fixes #1',
      state: 'open',
      author: 'hivemoot-builder',
      createdAt: '2026-02-11T09:00:00Z',
    },
  ],
  proposals: [
    {
      number: 1,
      title: 'Reliability proposal',
      phase: 'ready-to-implement',
      author: 'hivemoot-builder',
      createdAt: '2026-02-10T00:00:00Z',
      commentCount: 3,
      phaseTransitions: [
        { phase: 'discussion', enteredAt: '2026-02-10T00:00:00Z' },
        { phase: 'voting', enteredAt: '2026-02-10T06:00:00Z' },
        { phase: 'ready-to-implement', enteredAt: '2026-02-10T12:00:00Z' },
      ],
    },
  ],
  comments: [],
  externalVisibility: {
    status: 'yellow',
    score: 65,
    checks: [],
    blockers: ['Repository homepage URL configured'],
  },
  governanceIncidents: [
    {
      id: 'incident-1',
      category: 'permissions',
      severity: 'high',
      title: 'Push permissions denied',
      detectedAt: '2026-02-11T11:30:00Z',
      sourceUrl: 'https://github.com/hivemoot/colony/issues/242#issuecomment-1',
      status: 'open',
    },
  ],
};

describe('GovernanceOps', () => {
  it('renders reliability budget, SLO checks, and incident taxonomy', () => {
    render(<GovernanceOps data={mockData} />);

    expect(screen.getByText(/^reliability budget$/i)).toBeInTheDocument();
    expect(screen.getByText(/slo outcomes:/i)).toBeInTheDocument();

    expect(screen.getByText('Proposal Cycle Time')).toBeInTheDocument();
    expect(screen.getByText('Implementation Lead Time')).toBeInTheDocument();
    expect(screen.getByText('Blocked Ready Work')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Freshness')).toBeInTheDocument();
    expect(screen.getByText('Discoverability Health')).toBeInTheDocument();

    expect(screen.getByText(/incident taxonomy/i)).toBeInTheDocument();
    expect(screen.getAllByText('Permissions').length).toBeGreaterThan(0);
    expect(screen.getByText(/push permissions denied/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /source/i })).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/242#issuecomment-1'
    );
  });

  it('shows empty-state copy when no open incidents exist', () => {
    render(
      <GovernanceOps
        data={{
          ...mockData,
          governanceIncidents: [
            {
              id: 'incident-2',
              category: 'automation-failure',
              severity: 'medium',
              title: 'CI failed once',
              detectedAt: '2026-02-11T10:00:00Z',
              status: 'mitigated',
            },
          ],
        }}
      />
    );

    expect(
      screen.getByText(/no open governance incidents detected/i)
    ).toBeInTheDocument();
  });

  it('sanitizes unsafe incident source URLs', () => {
    render(
      <GovernanceOps
        data={{
          ...mockData,
          governanceIncidents: [
            {
              id: 'incident-unsafe',
              category: 'automation-failure',
              severity: 'high',
              title: 'Unsafe link incident',
              detectedAt: '2026-02-11T11:30:00Z',
              sourceUrl: 'javascript:alert(1)',
              status: 'open',
            },
          ],
        }}
      />
    );

    expect(screen.getByRole('link', { name: /source/i })).toHaveAttribute(
      'href',
      '#'
    );
  });
});
