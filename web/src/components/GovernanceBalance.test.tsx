import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GovernanceBalance } from './GovernanceBalance';
import type { ActivityData } from '../types/activity';

function makeMinimalData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-13T00:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    proposals: [],
    comments: [],
    ...overrides,
  };
}

describe('GovernanceBalance', () => {
  it('renders insufficient-data verdict with empty data', () => {
    render(<GovernanceBalance data={makeMinimalData()} />);
    expect(screen.getByText(/not enough governance data/i)).toBeInTheDocument();
  });

  it('renders all three metric cards', () => {
    const data = makeMinimalData({
      agents: [{ login: 'hivemoot-builder' }, { login: 'hivemoot-worker' }],
      agentStats: [
        {
          login: 'hivemoot-builder',
          reviews: 5,
          comments: 3,
          commits: 2,
          pullRequestsMerged: 1,
          issuesOpened: 1,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
        {
          login: 'hivemoot-worker',
          reviews: 4,
          comments: 3,
          commits: 2,
          pullRequestsMerged: 1,
          issuesOpened: 1,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
      ],
      proposals: [
        {
          number: 1,
          title: 'Proposal 1',
          phase: 'voting',
          author: 'hivemoot-builder',
          createdAt: '2026-02-01T10:00:00Z',
          commentCount: 3,
        },
        {
          number: 2,
          title: 'Proposal 2',
          phase: 'discussion',
          author: 'hivemoot-worker',
          createdAt: '2026-02-02T10:00:00Z',
          commentCount: 2,
        },
      ],
      comments: [
        {
          id: 1,
          issueOrPrNumber: 1,
          type: 'proposal',
          author: 'hivemoot-worker',
          body: 'Review comment',
          createdAt: '2026-02-01T11:00:00Z',
          url: 'https://example.com',
        },
        {
          id: 2,
          issueOrPrNumber: 2,
          type: 'proposal',
          author: 'hivemoot-builder',
          body: 'Feedback',
          createdAt: '2026-02-02T11:30:00Z',
          url: 'https://example.com',
        },
      ],
    });

    render(<GovernanceBalance data={data} />);

    expect(screen.getByText('Power Concentration')).toBeInTheDocument();
    expect(screen.getByText('Role Diversity')).toBeInTheDocument();
    expect(screen.getByText('Responsiveness')).toBeInTheDocument();
  });

  it('renders the verdict banner', () => {
    const data = makeMinimalData({
      agents: [
        { login: 'hivemoot-builder' },
        { login: 'hivemoot-worker' },
        { login: 'hivemoot-scout' },
        { login: 'hivemoot-polisher' },
      ],
      agentStats: [
        {
          login: 'hivemoot-builder',
          reviews: 10,
          comments: 8,
          commits: 5,
          pullRequestsMerged: 3,
          issuesOpened: 2,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
        {
          login: 'hivemoot-worker',
          reviews: 8,
          comments: 6,
          commits: 4,
          pullRequestsMerged: 2,
          issuesOpened: 1,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
        {
          login: 'hivemoot-scout',
          reviews: 7,
          comments: 5,
          commits: 3,
          pullRequestsMerged: 1,
          issuesOpened: 1,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
        {
          login: 'hivemoot-polisher',
          reviews: 6,
          comments: 4,
          commits: 2,
          pullRequestsMerged: 1,
          issuesOpened: 0,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
      ],
      proposals: [
        {
          number: 1,
          title: 'Proposal 1',
          phase: 'implemented',
          author: 'hivemoot-builder',
          createdAt: '2026-02-01T10:00:00Z',
          commentCount: 5,
        },
        {
          number: 2,
          title: 'Proposal 2',
          phase: 'voting',
          author: 'hivemoot-worker',
          createdAt: '2026-02-02T10:00:00Z',
          commentCount: 4,
        },
        {
          number: 3,
          title: 'Proposal 3',
          phase: 'discussion',
          author: 'hivemoot-scout',
          createdAt: '2026-02-03T10:00:00Z',
          commentCount: 3,
        },
        {
          number: 4,
          title: 'Proposal 4',
          phase: 'ready-to-implement',
          author: 'hivemoot-polisher',
          createdAt: '2026-02-04T10:00:00Z',
          commentCount: 2,
        },
      ],
      comments: [
        {
          id: 1,
          issueOrPrNumber: 1,
          type: 'proposal',
          author: 'hivemoot-worker',
          body: 'Quick response',
          createdAt: '2026-02-01T10:30:00Z',
          url: 'https://example.com',
        },
        {
          id: 2,
          issueOrPrNumber: 2,
          type: 'proposal',
          author: 'hivemoot-builder',
          body: 'Feedback',
          createdAt: '2026-02-02T11:00:00Z',
          url: 'https://example.com',
        },
        {
          id: 3,
          issueOrPrNumber: 3,
          type: 'proposal',
          author: 'hivemoot-polisher',
          body: 'Comment',
          createdAt: '2026-02-03T10:45:00Z',
          url: 'https://example.com',
        },
        {
          id: 4,
          issueOrPrNumber: 4,
          type: 'proposal',
          author: 'hivemoot-scout',
          body: 'Review',
          createdAt: '2026-02-04T11:15:00Z',
          url: 'https://example.com',
        },
      ],
    });

    render(<GovernanceBalance data={data} />);

    // Should render a verdict status element
    const verdictElement = screen.getByRole('status');
    expect(verdictElement).toBeInTheDocument();
  });

  it('shows the role coverage grid', () => {
    const data = makeMinimalData({
      agents: [{ login: 'hivemoot-builder' }, { login: 'hivemoot-worker' }],
      agentStats: [
        {
          login: 'hivemoot-builder',
          reviews: 5,
          comments: 3,
          commits: 2,
          pullRequestsMerged: 1,
          issuesOpened: 1,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
        {
          login: 'hivemoot-worker',
          reviews: 4,
          comments: 3,
          commits: 2,
          pullRequestsMerged: 1,
          issuesOpened: 1,
          lastActiveAt: '2026-02-13T00:00:00Z',
        },
      ],
      proposals: [
        {
          number: 1,
          title: 'Proposal 1',
          phase: 'voting',
          author: 'hivemoot-builder',
          createdAt: '2026-02-01T10:00:00Z',
          commentCount: 2,
        },
      ],
      comments: [
        {
          id: 1,
          issueOrPrNumber: 1,
          type: 'proposal',
          author: 'hivemoot-worker',
          body: 'Comment',
          createdAt: '2026-02-01T11:00:00Z',
          url: 'https://example.com',
        },
      ],
    });

    render(<GovernanceBalance data={data} />);

    // The grid should show role names (getAllByText because login names also contain these words)
    expect(screen.getAllByText('builder').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('worker').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('scout').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('polisher').length).toBeGreaterThanOrEqual(1);
  });
});
