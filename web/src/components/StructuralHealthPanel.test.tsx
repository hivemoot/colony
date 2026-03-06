import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StructuralHealthPanel } from './StructuralHealthPanel';
import type { GovernanceHealthMetrics } from '../../shared/governance-health-metrics.ts';

function makeMetrics(
  overrides: Partial<GovernanceHealthMetrics> = {}
): GovernanceHealthMetrics {
  return {
    computedAt: '2026-03-05T00:00:00Z',
    dataWindowDays: 30,
    mergedPrsSampled: 10,
    metrics: {
      prCycleTime: { p50Days: 0.8, p95Days: 2.5, sampleSize: 10 },
      roleDiversity: { gini: 0.32, sampleSize: 6 },
      contestedDecisionRate: {
        rate: 0.1,
        contestedCount: 1,
        totalVoted: 10,
      },
      crossAgentReviewRate: {
        rate: 0.85,
        crossAgentCount: 17,
        totalReviews: 20,
      },
    },
    warnings: [],
    ...overrides,
  };
}

describe('StructuralHealthPanel', () => {
  it('renders a placeholder when metrics are null', () => {
    render(<StructuralHealthPanel metrics={null} />);
    expect(
      screen.getByText(/Structural health metrics not yet available/i)
    ).toBeDefined();
  });

  it('renders all four metric labels when data is present', () => {
    render(<StructuralHealthPanel metrics={makeMetrics()} />);
    expect(screen.getByText(/PR Cycle Time/i)).toBeDefined();
    expect(screen.getByText(/Contribution Diversity/i)).toBeDefined();
    expect(screen.getByText(/Contested Decision Rate/i)).toBeDefined();
    expect(screen.getByText(/Cross-Agent Review Rate/i)).toBeDefined();
  });

  it('shows data window and merged PRs sampled summary', () => {
    render(<StructuralHealthPanel metrics={makeMetrics()} />);
    expect(screen.getByText(/30 days/i)).toBeDefined();
    expect(screen.getByText(/Merged PRs sampled/i)).toBeDefined();
  });

  it('shows warning count when warnings are present', () => {
    const metrics = makeMetrics({
      warnings: ['PR cycle time: insufficient data.', 'Another warning.'],
    });
    render(<StructuralHealthPanel metrics={metrics} />);
    expect(screen.getByText(/2 warnings/i)).toBeDefined();
    expect(
      screen.getByText(/PR cycle time: insufficient data\./i)
    ).toBeDefined();
    expect(screen.getByText(/Another warning\./i)).toBeDefined();
  });

  it('does not show warnings section when warnings list is empty', () => {
    render(<StructuralHealthPanel metrics={makeMetrics()} />);
    expect(screen.queryByText(/warning/i)).toBeNull();
  });

  it('displays cycle time p50 and p95 values', () => {
    const metrics = makeMetrics({
      metrics: {
        prCycleTime: { p50Days: 1.5, p95Days: 4.2, sampleSize: 8 },
        roleDiversity: { gini: 0.3, sampleSize: 4 },
        contestedDecisionRate: { rate: 0, contestedCount: 0, totalVoted: 5 },
        crossAgentReviewRate: {
          rate: 0.9,
          crossAgentCount: 9,
          totalReviews: 10,
        },
      },
    });
    render(<StructuralHealthPanel metrics={metrics} />);
    expect(screen.getByText(/1\.5d/)).toBeDefined();
    expect(screen.getByText(/p95: 4\.2d/)).toBeDefined();
  });

  it('displays cross-agent review rate as percentage', () => {
    const metrics = makeMetrics({
      metrics: {
        prCycleTime: { p50Days: 1, p95Days: 2, sampleSize: 5 },
        roleDiversity: { gini: 0.3, sampleSize: 4 },
        contestedDecisionRate: { rate: 0, contestedCount: 0, totalVoted: 5 },
        crossAgentReviewRate: {
          rate: 0.85,
          crossAgentCount: 17,
          totalReviews: 20,
        },
      },
    });
    render(<StructuralHealthPanel metrics={metrics} />);
    expect(screen.getByText(/85\.0%/)).toBeDefined();
  });
});
