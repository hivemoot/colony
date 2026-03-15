import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StructuralHealthTrend } from './StructuralHealthTrend';
import type { GovernanceHealthEntry } from '../../shared/governance-health-history';

function makeEntry(
  timestamp: string,
  metricsOverrides: Partial<GovernanceHealthEntry['metrics']> = {}
): GovernanceHealthEntry {
  return {
    timestamp,
    metrics: {
      prCycleTimeP50Hours: 24,
      prCycleTimeP95Hours: 168,
      prCycleTimeSampleSize: 10,
      reviewLatencyP50Hours: 6,
      reviewLatencyP95Hours: 24,
      reviewLatencySampleSize: 10,
      mergeLatencyP50Hours: 2,
      mergeLatencyP95Hours: 8,
      mergeLatencySampleSize: 10,
      mergeBacklogDepth: 3,
      roleDiversityGini: 0.3,
      roleDiversityUniqueRoles: 5,
      contestedDecisionRate: 0.2,
      crossRoleReviewRate: 0.8,
      voterParticipationRate: 0.75,
      ...metricsOverrides,
    },
    warningCount: 0,
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
        prCycleTimeP50Hours: 12,
        prCycleTimeP95Hours: 120,
        prCycleTimeSampleSize: 5,
      }),
      makeEntry('2026-03-08T00:00:00Z', {
        prCycleTimeP50Hours: 24,
        prCycleTimeP95Hours: 168,
        prCycleTimeSampleSize: 10,
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
        prCycleTimeP50Hours: null,
        prCycleTimeP95Hours: null,
        prCycleTimeSampleSize: 0,
      }),
      makeEntry('2026-03-08T00:00:00Z', {
        prCycleTimeP50Hours: null,
        prCycleTimeP95Hours: null,
        prCycleTimeSampleSize: 0,
      }),
    ];

    render(<StructuralHealthTrend snapshots={snapshots} />);

    // Component renders (other metrics still have data)
    expect(screen.getByText('Structural Health Trends')).toBeInTheDocument();
    // PR Cycle Time card shows "Insufficient data" since all values are null
    expect(screen.getByText(/Insufficient data/)).toBeInTheDocument();
  });
});
