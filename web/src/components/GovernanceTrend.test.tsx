import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GovernanceTrend } from './GovernanceTrend';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot';

function makeSnapshot(
  day: number,
  score: number,
  hour = 0,
  overrides?: Partial<GovernanceSnapshot>
): GovernanceSnapshot {
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  return {
    timestamp: `2026-02-${dd}T${hh}:00:00Z`,
    healthScore: score,
    participation: 15,
    pipelineFlow: 15,
    followThrough: 10,
    consensusQuality: score - 40,
    activeProposals: 5,
    totalProposals: 20,
    activeAgents: 4,
    proposalVelocity: 0.5,
    ...overrides,
  };
}

describe('GovernanceTrend', () => {
  it('returns null with fewer than 2 daily data points', () => {
    const { container } = render(<GovernanceTrend history={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null with single snapshot', () => {
    const { container } = render(
      <GovernanceTrend history={[makeSnapshot(1, 60)]} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders sparkline with multiple days of data', () => {
    const history = [
      makeSnapshot(1, 55),
      makeSnapshot(2, 60),
      makeSnapshot(3, 65),
    ];

    render(<GovernanceTrend history={history} />);

    const svg = screen.getByRole('img', { name: /health score trend/i });
    expect(svg).toBeInTheDocument();
  });

  it('shows improving trend when scores increase', () => {
    const history = [
      makeSnapshot(1, 40),
      makeSnapshot(2, 50),
      makeSnapshot(3, 60),
    ];

    render(<GovernanceTrend history={history} />);

    expect(screen.getByText(/improving/i)).toBeInTheDocument();
  });

  it('shows declining trend when scores decrease', () => {
    const history = [
      makeSnapshot(1, 80),
      makeSnapshot(2, 70),
      makeSnapshot(3, 60),
    ];

    render(<GovernanceTrend history={history} />);

    expect(screen.getByText(/declining/i)).toBeInTheDocument();
  });

  it('shows stable trend when scores are flat', () => {
    const history = [
      makeSnapshot(1, 65),
      makeSnapshot(2, 65),
      makeSnapshot(3, 66),
    ];

    render(<GovernanceTrend history={history} />);

    expect(screen.getByText(/stable/i)).toBeInTheDocument();
  });

  it('downsamples multiple snapshots per day to daily averages', () => {
    // Two snapshots on day 1 (avg 55), two on day 2 (avg 65)
    const history = [
      makeSnapshot(1, 50, 0),
      makeSnapshot(1, 60, 6),
      makeSnapshot(2, 60, 0),
      makeSnapshot(2, 70, 6),
    ];

    render(<GovernanceTrend history={history} />);

    // Should render — 2 days of data
    const svg = screen.getByRole('img', { name: /health score trend/i });
    expect(svg).toBeInTheDocument();
    expect(screen.getByText(/2 days/i)).toBeInTheDocument();
  });

  it('displays day count in description', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot(i + 1, 60 + i * 2)
    );

    render(<GovernanceTrend history={history} />);

    expect(screen.getByText(/5 days/i)).toBeInTheDocument();
  });

  it('has proper aria labels on sparkline', () => {
    const history = [makeSnapshot(1, 55), makeSnapshot(2, 65)];

    render(<GovernanceTrend history={history} />);

    const svg = screen.getByRole('img', { name: /health score trend/i });
    expect(svg.getAttribute('aria-label')).toContain('55');
    expect(svg.getAttribute('aria-label')).toContain('65');
  });
});

describe('GovernanceTrend sub-metrics', () => {
  it('renders sub-metric grid with multiple days of data', () => {
    const history = [
      makeSnapshot(1, 60),
      makeSnapshot(2, 65),
      makeSnapshot(3, 70),
    ];

    render(<GovernanceTrend history={history} />);

    const grid = screen.getByRole('group', {
      name: /governance sub-metric trends/i,
    });
    expect(grid).toBeInTheDocument();
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
  });

  it('renders all four sub-metric labels', () => {
    const history = [
      makeSnapshot(1, 60),
      makeSnapshot(2, 65),
      makeSnapshot(3, 70),
    ];

    render(<GovernanceTrend history={history} />);

    expect(screen.getByText('Participation')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Flow')).toBeInTheDocument();
    expect(screen.getByText('Follow-Through')).toBeInTheDocument();
    expect(screen.getByText('Consensus')).toBeInTheDocument();
  });

  it('displays current sub-metric scores with max', () => {
    const history = [
      makeSnapshot(1, 60, 0, { participation: 20 }),
      makeSnapshot(2, 65, 0, { participation: 22 }),
    ];

    render(<GovernanceTrend history={history} />);

    // participation current value should be 22/25
    expect(screen.getByText('22/25')).toBeInTheDocument();
  });

  it('renders sub-metric sparklines with proper aria labels', () => {
    const history = [
      makeSnapshot(1, 60, 0, { participation: 10, pipelineFlow: 12 }),
      makeSnapshot(2, 65, 0, { participation: 15, pipelineFlow: 18 }),
      makeSnapshot(3, 70, 0, { participation: 20, pipelineFlow: 22 }),
    ];

    render(<GovernanceTrend history={history} />);

    const participationSparkline = screen.getByRole('img', {
      name: /participation trend/i,
    });
    expect(participationSparkline).toBeInTheDocument();

    const pipelineSparkline = screen.getByRole('img', {
      name: /pipeline flow trend/i,
    });
    expect(pipelineSparkline).toBeInTheDocument();
  });

  it('shows trend arrows for sub-metrics with sufficient data', () => {
    // Create data where participation is clearly improving but overall is stable
    const history = [
      makeSnapshot(1, 60, 0, { participation: 5 }),
      makeSnapshot(2, 61, 0, { participation: 12 }),
      makeSnapshot(3, 62, 0, { participation: 20 }),
    ];

    render(<GovernanceTrend history={history} />);

    // The sub-metric grid should have trend arrows
    const grid = screen.getByRole('group', {
      name: /governance sub-metric trends/i,
    });
    expect(grid).toBeInTheDocument();

    expect(
      screen.getByLabelText(/participation trend: improving/i)
    ).toBeInTheDocument();
  });

  it('does not render sub-metric grid with insufficient data', () => {
    // Only one day — not enough for sub-metric trends
    const { container } = render(
      <GovernanceTrend history={[makeSnapshot(1, 60)]} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('downsamples sub-metric values to daily averages', () => {
    const history = [
      makeSnapshot(1, 60, 0, { followThrough: 8 }),
      makeSnapshot(1, 60, 6, { followThrough: 12 }),
      makeSnapshot(2, 65, 0, { followThrough: 14 }),
      makeSnapshot(2, 65, 6, { followThrough: 18 }),
    ];

    render(<GovernanceTrend history={history} />);

    // Should render Follow-Through with averaged values
    // Day 1 avg: 10, Day 2 avg: 16, current = 16
    expect(screen.getByText('16/25')).toBeInTheDocument();
  });
});
