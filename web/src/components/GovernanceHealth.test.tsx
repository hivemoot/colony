import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GovernanceHealth } from './GovernanceHealth';
import type { ActivityData } from '../types/activity';

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-05T10:00:00Z',
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
    comments: [],
    proposals: [],
    ...overrides,
  };
}

describe('GovernanceHealth', () => {
  it('renders a score badge with numeric value', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'implemented',
          author: 'bot-a',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 5,
          votesSummary: { thumbsUp: 4, thumbsDown: 0 },
        },
      ],
      agentStats: [
        {
          login: 'bot-a',
          commits: 10,
          pullRequestsMerged: 3,
          issuesOpened: 2,
          reviews: 5,
          comments: 8,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    // Score badge should have an accessible label
    const badge = screen.getByRole('img', {
      name: /governance health score/i,
    });
    expect(badge).toBeInTheDocument();
  });

  it('renders all four sub-metric cards', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 3,
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    expect(screen.getByText('Participation')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Flow')).toBeInTheDocument();
    expect(screen.getByText('Follow-through')).toBeInTheDocument();
    expect(screen.getByText('Consensus Quality')).toBeInTheDocument();
  });

  it('displays data window information', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-01T00:00:00Z',
          commentCount: 1,
        },
        {
          number: 2,
          title: 'B',
          phase: 'voting',
          author: 'bot',
          createdAt: '2026-02-08T00:00:00Z',
          commentCount: 1,
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    expect(screen.getByText(/7 days/)).toBeInTheDocument();
    expect(screen.getByText(/governance data/)).toBeInTheDocument();
  });

  it('renders a health bucket label', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'implemented',
          author: 'a',
          createdAt: '2026-02-01T00:00:00Z',
          commentCount: 8,
          votesSummary: { thumbsUp: 4, thumbsDown: 0 },
        },
        {
          number: 2,
          title: 'B',
          phase: 'implemented',
          author: 'b',
          createdAt: '2026-02-02T00:00:00Z',
          commentCount: 6,
          votesSummary: { thumbsUp: 3, thumbsDown: 1 },
        },
        {
          number: 3,
          title: 'C',
          phase: 'rejected',
          author: 'c',
          createdAt: '2026-02-03T00:00:00Z',
          commentCount: 5,
          votesSummary: { thumbsUp: 1, thumbsDown: 3 },
        },
      ],
      agentStats: [
        {
          login: 'a',
          commits: 10,
          pullRequestsMerged: 3,
          issuesOpened: 2,
          reviews: 8,
          comments: 12,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
        {
          login: 'b',
          commits: 8,
          pullRequestsMerged: 2,
          issuesOpened: 3,
          reviews: 7,
          comments: 10,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
        {
          login: 'c',
          commits: 5,
          pullRequestsMerged: 1,
          issuesOpened: 4,
          reviews: 6,
          comments: 8,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    // The bucket label should be one of the four valid buckets
    const validBuckets = ['Critical', 'Needs Attention', 'Healthy', 'Thriving'];
    const foundBucket = validBuckets.some((bucket) =>
      screen.queryByText(bucket)
    );
    expect(foundBucket).toBe(true);
  });

  it('renders sub-metric score fractions', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 3,
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    // Each sub-metric shows a score like "X/25"
    const scoreLabels = screen.getAllByText(/\/25$/);
    expect(scoreLabels).toHaveLength(4);
  });

  it('renders sub-metric reason text', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 3,
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    // Each sub-metric has a reason string — multiple mention "proposals"
    const reasons = screen.getAllByText(/proposals/i);
    expect(reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders accessible bar charts for each sub-metric', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'implemented',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 5,
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    // Each sub-metric bar has role="img" with aria-label
    const bars = screen.getAllByRole('img', { name: /of 25/ });
    expect(bars).toHaveLength(4);
  });

  it('uses singular "day" for single-day window', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 1,
        },
      ],
    });

    render(<GovernanceHealth data={data} />);

    expect(screen.getByText(/1 day/)).toBeInTheDocument();
    expect(screen.queryByText(/1 days/)).not.toBeInTheDocument();
  });
});
