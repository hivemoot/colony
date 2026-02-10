import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GovernanceTrend } from './GovernanceTrend';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot';

function makeSnapshot(
  day: number,
  score: number,
  hour = 0
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
