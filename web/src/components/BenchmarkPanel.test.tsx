import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BenchmarkPanel } from './BenchmarkPanel';
import type { ActivityData, PullRequest, Proposal } from '../types/activity';

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Test PR',
    state: 'open',
    author: 'agent-a',
    createdAt: '2026-02-10T00:00:00Z',
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

describe('BenchmarkPanel', () => {
  it('renders without crashing with empty ActivityData', () => {
    render(<BenchmarkPanel data={makeData()} />);
    expect(
      screen.getByRole('group', { name: /velocity benchmarks/i })
    ).toBeInTheDocument();
  });

  it('renders all three benchmark metric rows', () => {
    render(<BenchmarkPanel data={makeData()} />);
    expect(screen.getByText('PR Cycle Time')).toBeInTheDocument();
    expect(screen.getByText('Proposal-to-Ship Lead Time')).toBeInTheDocument();
    expect(
      screen.getByText('Weekly Throughput per Contributor')
    ).toBeInTheDocument();
  });

  it('shows "No data" badge for unknown verdict when colony value is null', () => {
    // No merged PRs → prCycleTime verdict is unknown
    render(<BenchmarkPanel data={makeData()} />);
    const noBadges = screen.getAllByText('No data');
    expect(noBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render progress bar for unknown verdict', () => {
    render(<BenchmarkPanel data={makeData()} />);
    // With no data, no progressbar should appear
    const bars = screen.queryAllByRole('progressbar');
    expect(bars).toHaveLength(0);
  });

  it('renders progress bar when verdict is known', () => {
    // One merged PR in the last 7 days gives a known prCycleTime verdict
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(
      now.getTime() - 12 * 60 * 60 * 1000
    ).toISOString(); // 12h ago
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
          agentStats: [
            {
              login: 'agent-a',
              commits: 1,
              pullRequestsMerged: 1,
              issuesOpened: 0,
              reviews: 0,
              comments: 0,
              lastActiveAt: mergedAt,
            },
          ],
        })}
      />
    );

    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });

  it('formats Colony PR cycle time in minutes when under 1 hour', () => {
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // 30 min
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    // 30 minutes → "30m"
    expect(screen.getByLabelText(/Colony value: 30m/i)).toBeInTheDocument();
  });

  it('formats Colony PR cycle time in hours when between 1 and 24 hours', () => {
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(
      now.getTime() - 12 * 60 * 60 * 1000
    ).toISOString();
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    // 12 hours → "12.0h"
    expect(screen.getByLabelText(/Colony value: 12\.0h/i)).toBeInTheDocument();
  });

  it('formats Colony PR cycle time in days when 24+ hours', () => {
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(
      now.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    // 48 hours = exactly 2 days → "2d"
    expect(screen.getByLabelText(/Colony value: 2d/i)).toBeInTheDocument();
  });

  it('shows "Much faster" badge when Colony is well under baseline', () => {
    // Baseline is 48h; 30 min is ~1.04% → much-faster
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    expect(screen.getByLabelText(/Verdict: Much faster/i)).toBeInTheDocument();
  });

  it('shows "Comparable" badge when Colony is near baseline', () => {
    // Baseline is 48h; 48h cycle time → ratio 1.0 → comparable
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(
      now.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    expect(screen.getByLabelText(/Verdict: Comparable/i)).toBeInTheDocument();
  });

  it('shows "Much slower" badge when Colony is over 2× baseline', () => {
    // Baseline is 48h; 200h cycle time → ratio > 2.0 → much-slower
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(
      now.getTime() - 200 * 60 * 60 * 1000
    ).toISOString();
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    expect(screen.getByLabelText(/Verdict: Much slower/i)).toBeInTheDocument();
  });

  it('formats PRs/contributor value with one decimal place', () => {
    const now = new Date('2026-02-12T12:00:00Z');
    const mergedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [
            makePR({
              number: 1,
              state: 'merged',
              createdAt: mergedAt,
              mergedAt,
            }),
          ],
          agentStats: [
            {
              login: 'agent-a',
              commits: 1,
              pullRequestsMerged: 1,
              issuesOpened: 0,
              reviews: 0,
              comments: 0,
              lastActiveAt: mergedAt,
            },
          ],
        })}
      />
    );

    // 1 PR / 1 contributor = 1.0
    expect(screen.getByLabelText(/Colony value: 1\.0/i)).toBeInTheDocument();
  });

  it('shows data note with merged PR count', () => {
    const now = new Date('2026-02-12T12:00:00Z');
    const prs = Array.from({ length: 5 }, (_, i) =>
      makePR({
        number: i + 1,
        state: 'merged',
        createdAt: new Date(
          now.getTime() - (i + 1) * 60 * 60 * 1000
        ).toISOString(),
        mergedAt: new Date(now.getTime() - i * 60 * 60 * 1000).toISOString(),
      })
    );

    render(<BenchmarkPanel data={makeData({ pullRequests: prs })} />);

    expect(screen.getByLabelText(/data note/i)).toHaveTextContent(
      /Based on 5 merged PRs/i
    );
  });

  it('renders progress bar aria attributes correctly', () => {
    const now = new Date('2026-02-12T12:00:00Z');
    const createdAt = new Date(
      now.getTime() - 12 * 60 * 60 * 1000
    ).toISOString();
    const mergedAt = now.toISOString();

    render(
      <BenchmarkPanel
        data={makeData({
          pullRequests: [makePR({ state: 'merged', createdAt, mergedAt })],
        })}
      />
    );

    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThanOrEqual(1);
    const bar = bars[0];
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow');
  });

  it('renders the industry baseline source and population for each comparison', () => {
    render(<BenchmarkPanel data={makeData()} />);
    // Each ComparisonRow shows baseline source
    expect(
      screen.getByText(/CNCF DevStats \/ ossinsight\.io/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/CHAOSS Lead Time metric/i)).toBeInTheDocument();
  });

  it('renders "Proposal-to-Ship" verdict as unknown when no implemented proposals', () => {
    render(
      <BenchmarkPanel
        data={makeData({
          proposals: [makeProposal({ phase: 'discussion' })],
        })}
      />
    );

    // All three metrics should show "No data" with zero implemented proposals
    const noBadges = screen.getAllByText('No data');
    expect(noBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('renders benchmark group row containers as accessible groups', () => {
    render(<BenchmarkPanel data={makeData()} />);
    const groups = screen.getAllByRole('group', {
      name: /benchmark comparison/i,
    });
    expect(groups).toHaveLength(3);
  });
});
