import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VelocityMetrics } from './VelocityMetrics';
import type { ActivityData, PullRequest, Proposal } from '../types/activity';

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    state: 'open',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Test proposal',
    phase: 'discussion',
    author: 'agent-a',
    createdAt: '2026-02-01T00:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-12T12:00:00Z',
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

describe('VelocityMetrics', () => {
  it('renders all metric card labels', () => {
    render(<VelocityMetrics data={makeData()} />);

    expect(screen.getByText('PR Cycle Time')).toBeInTheDocument();
    expect(screen.getByText('Proposal to Ship')).toBeInTheDocument();
    expect(screen.getByText('Merge Queue')).toBeInTheDocument();
    expect(screen.getByText('Weekly Throughput')).toBeInTheDocument();
    expect(screen.getByText('Governance Overhead')).toBeInTheDocument();
    expect(screen.getByText('Merge Trend (8 weeks)')).toBeInTheDocument();
  });

  it('shows dashes for empty data', () => {
    render(<VelocityMetrics data={makeData()} />);

    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders merge queue count from open PRs', () => {
    const prs = [
      makePR({ number: 1, state: 'open' }),
      makePR({ number: 2, state: 'open' }),
      makePR({ number: 3, state: 'open' }),
      makePR({ number: 4, state: 'merged', mergedAt: '2026-02-10T00:00:00Z' }),
    ];
    render(<VelocityMetrics data={makeData({ pullRequests: prs })} />);

    const queueLabel = screen.getByLabelText(/3 open pull requests/i);
    expect(queueLabel).toBeInTheDocument();
  });

  it('renders PR cycle time in hours', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        createdAt: '2026-02-10T00:00:00Z',
        mergedAt: '2026-02-10T12:00:00Z',
      }),
    ];
    render(<VelocityMetrics data={makeData({ pullRequests: prs })} />);

    expect(screen.getByText('12h')).toBeInTheDocument();
  });

  it('renders PR cycle time in days for longer durations', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        createdAt: '2026-02-01T00:00:00Z',
        mergedAt: '2026-02-03T12:00:00Z', // 60 hours = 2.5 days
      }),
    ];
    render(<VelocityMetrics data={makeData({ pullRequests: prs })} />);

    expect(screen.getByText('2.5d')).toBeInTheDocument();
  });

  it('renders governance overhead as percentage', () => {
    const proposals = [
      makeProposal({
        number: 1,
        phase: 'implemented',
        createdAt: '2026-02-01T00:00:00Z',
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-01T00:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-01T06:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-01T12:00:00Z' },
          { phase: 'implemented', enteredAt: '2026-02-02T00:00:00Z' },
        ],
      }),
    ];
    render(<VelocityMetrics data={makeData({ proposals })} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('has accessible group label', () => {
    render(<VelocityMetrics data={makeData()} />);

    const group = screen.getByRole('group', {
      name: /development velocity metrics/i,
    });
    expect(group).toBeInTheDocument();
  });

  it('renders the sparkline SVG', () => {
    render(<VelocityMetrics data={makeData()} />);

    const sparkline = screen.getByRole('img', {
      name: /weekly merge count sparkline/i,
    });
    expect(sparkline).toBeInTheDocument();
  });

  it('shows weekly throughput delta vs previous week', () => {
    const prs = [
      makePR({
        number: 1,
        state: 'merged',
        mergedAt: '2026-02-11T00:00:00Z',
      }),
      makePR({
        number: 2,
        state: 'merged',
        mergedAt: '2026-02-10T00:00:00Z',
      }),
      makePR({
        number: 3,
        state: 'merged',
        mergedAt: '2026-02-04T00:00:00Z',
      }),
    ];
    render(<VelocityMetrics data={makeData({ pullRequests: prs })} />);

    expect(screen.getByText('+1 vs last week')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<VelocityMetrics data={makeData()} />);

    expect(screen.getByText(/how fast does code move/i)).toBeInTheDocument();
  });

  it('does not render visible bars for an all-zero merge series', () => {
    // With no merged PRs, the weekly merge series is all zeros.
    // Bars should not be rendered for weeks with zero merges.
    render(<VelocityMetrics data={makeData()} />);

    const sparkline = screen.getByRole('img', {
      name: /weekly merge count sparkline/i,
    });
    const rects = sparkline.querySelectorAll('rect');
    expect(rects).toHaveLength(0);
  });
});
