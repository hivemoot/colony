import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StructuralHealthTrend } from './StructuralHealthTrend';
import type { GovernanceHealthEntry } from '../../shared/governance-health-history';

function makeEntry(
  timestamp: string,
  overrides: Partial<GovernanceHealthEntry> = {}
): GovernanceHealthEntry {
  return {
    timestamp,
    prCycleTime: { p50: 1440, p95: 10080, sampleSize: 10 },
    roleDiversity: {
      uniqueRoles: 5,
      giniIndex: 0.3,
      topRole: 'builder',
      topRoleShare: 0.4,
    },
    contestedDecisionRate: { contestedCount: 2, totalVoted: 10, rate: 0.2 },
    crossRoleReviewRate: { crossRoleCount: 8, totalReviews: 10, rate: 0.8 },
    warningCount: 0,
    ...overrides,
  };
}

describe('StructuralHealthTrend', () => {
  it('returns null with empty snapshots', () => {
    const { container } = render(<StructuralHealthTrend snapshots={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null with a single snapshot (insufficient for trend)', () => {
    const { container } = render(
      <StructuralHealthTrend snapshots={[makeEntry('2026-03-01T00:00:00Z')]} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders structural health trends with 2+ snapshots', () => {
    const snapshots = [
      makeEntry('2026-03-01T00:00:00Z'),
      makeEntry('2026-03-08T00:00:00Z'),
    ];

    render(<StructuralHealthTrend snapshots={snapshots} />);

    expect(screen.getByText('Structural Health Trends')).toBeInTheDocument();
    expect(screen.getByText('PR Cycle Time (p95)')).toBeInTheDocument();
    expect(screen.getByText('Role Diversity (Gini)')).toBeInTheDocument();
    expect(screen.getByText('Contested Decision Rate')).toBeInTheDocument();
    expect(screen.getByText('Cross-Role Review Rate')).toBeInTheDocument();
  });

  it('shows snapshot count', () => {
    const snapshots = [
      makeEntry('2026-03-01T00:00:00Z'),
      makeEntry('2026-03-08T00:00:00Z'),
    ];

    render(<StructuralHealthTrend snapshots={snapshots} />);

    expect(screen.getByText(/2 snapshots/)).toBeInTheDocument();
  });

  it('shows sparklines via SVG elements', () => {
    const snapshots = [
      makeEntry('2026-03-01T00:00:00Z', {
        prCycleTime: { p50: 720, p95: 7200, sampleSize: 5 },
      }),
      makeEntry('2026-03-08T00:00:00Z', {
        prCycleTime: { p50: 1440, p95: 10080, sampleSize: 10 },
      }),
    ];

    const { container } = render(
      <StructuralHealthTrend snapshots={snapshots} />
    );

    const svgs = container.querySelectorAll('svg');
    // One sparkline per metric that has 2+ data points (all 4)
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders aria-label on sparklines', () => {
    const snapshots = [
      makeEntry('2026-03-01T00:00:00Z'),
      makeEntry('2026-03-08T00:00:00Z'),
    ];

    render(<StructuralHealthTrend snapshots={snapshots} />);

    expect(
      screen.getByRole('img', { name: /PR Cycle Time .p95. trend/i })
    ).toBeInTheDocument();
  });

  it('skips metrics with null values gracefully', () => {
    const snapshots = [
      makeEntry('2026-03-01T00:00:00Z', {
        prCycleTime: { p50: null, p95: null, sampleSize: 0 },
      }),
      makeEntry('2026-03-08T00:00:00Z', {
        prCycleTime: { p50: null, p95: null, sampleSize: 0 },
      }),
    ];

    render(<StructuralHealthTrend snapshots={snapshots} />);

    // Component renders (other metrics still have data)
    expect(screen.getByText('Structural Health Trends')).toBeInTheDocument();
    // PR Cycle Time card shows "Insufficient data" since all values are null
    expect(screen.getByText(/Insufficient data/)).toBeInTheDocument();
  });
});
