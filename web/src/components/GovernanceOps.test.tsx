import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GovernanceOps } from './GovernanceOps';
import type { GovernanceOps as GovernanceOpsData } from '../../shared/types';

const mockData: GovernanceOpsData = {
  status: 'yellow',
  score: 67,
  slos: [
    {
      id: 'proposal-cycle-time',
      label: 'Proposal cycle time',
      target: '<= 48h median (discussion -> ready)',
      current: '20h median',
      status: 'healthy',
      details: '3 proposal cycles measured.',
    },
    {
      id: 'blocked-ready-work',
      label: 'Blocked ready work',
      target: '<= 20% ready proposals blocked >24h',
      current: '1/3 blocked (33%)',
      status: 'at-risk',
    },
  ],
  incidents: [
    {
      id: 'pr-258-maintainer-gate',
      class: 'maintainer-gate',
      severity: 'high',
      sourceType: 'pr',
      sourceNumber: 258,
      sourceUrl: 'https://github.com/hivemoot/colony/pull/258#issuecomment-1',
      marker: 'merge-required',
      summary: 'BLOCKED: merge-required',
      detectedAt: '2026-02-11T15:08:00Z',
      ageHours: 4.2,
    },
  ],
  reliabilityBudget: {
    remaining: 56,
    policy:
      'If reliability budget stays below 40 for 3 consecutive days, prioritize reliability fixes over net-new features.',
    recommendation:
      'Budget is healthy but watch at-risk SLOs and schedule preventative maintenance.',
  },
};

describe('GovernanceOps', () => {
  it('renders nothing when no data is provided', () => {
    const { container } = render(<GovernanceOps data={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders score, slos, incidents, and reliability budget', () => {
    render(<GovernanceOps data={mockData} />);

    expect(
      screen.getByRole('heading', { name: /governance ops/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/at risk \(67\/100\)/i)).toBeInTheDocument();
    expect(screen.getByText(/proposal cycle time/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 blocked \(33%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/active incidents/i)).toBeInTheDocument();
    expect(screen.getAllByText(/merge-required/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /open pr #258/i })).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/pull/258#issuecomment-1'
    );
    expect(screen.getByText('56%')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /reliability budget/i })
    ).toBeInTheDocument();
  });
});
