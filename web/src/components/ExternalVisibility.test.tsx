import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExternalVisibility } from './ExternalVisibility';
import type { ExternalVisibility as ExternalVisibilityData } from '../../shared/types';

const mockVisibility: ExternalVisibilityData = {
  status: 'yellow',
  score: 60,
  checks: [
    {
      id: 'has-homepage',
      label: 'Repository homepage URL configured',
      ok: false,
      details: 'Missing homepage repository setting.',
      blockedByAdmin: true,
    },
    {
      id: 'has-structured-data',
      label: 'Structured metadata (JSON-LD) in HTML',
      ok: true,
      details: 'application/ld+json found',
    },
    {
      id: 'deployed-activity-freshness',
      label: 'Deployed data freshness (<= 18h)',
      ok: false,
      details: 'activity.json is stale',
    },
  ],
  blockers: ['Repository homepage URL configured'],
};

function withStatus(
  status: ExternalVisibilityData['status']
): ExternalVisibilityData {
  return {
    ...mockVisibility,
    status,
  };
}

describe('ExternalVisibility', () => {
  it('renders nothing when no data is provided', () => {
    const { container } = render(<ExternalVisibility data={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders status, checks, and blockers', () => {
    const { container } = render(<ExternalVisibility data={mockVisibility} />);

    expect(
      screen.getByRole('heading', { name: /external visibility/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/at risk \(60\/100\)/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/repository homepage url configured/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/structured metadata \(json-ld\) in html/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/^blocked$/i)).toBeInTheDocument();
    expect(screen.getByText(/^fail$/i)).toBeInTheDocument();
    expect(screen.getByText(/^pass$/i)).toBeInTheDocument();
    expect(screen.getByText(/^blocked$/i)).toHaveAttribute(
      'title',
      expect.stringContaining('Requires repository admin action')
    );
    expect(screen.getByText(/admin-blocked signals:/i)).toBeInTheDocument();
    expect(
      container.querySelector('.motion-safe\\:animate-pulse')
    ).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('does not animate the status indicator for healthy status', () => {
    const { container } = render(
      <ExternalVisibility data={withStatus('green')} />
    );
    expect(screen.getByText(/healthy \(60\/100\)/i)).toBeInTheDocument();
    expect(
      container.querySelector('.motion-safe\\:animate-pulse')
    ).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('uses motion-safe pulse for critical status and avoids always-on pulse', () => {
    const { container } = render(
      <ExternalVisibility data={withStatus('red')} />
    );
    expect(screen.getByText(/critical \(60\/100\)/i)).toBeInTheDocument();
    expect(
      container.querySelector('.motion-safe\\:animate-pulse')
    ).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('hides admin-blocked signals section when blockers list is empty', () => {
    const dataWithNoBlockers: ExternalVisibilityData = {
      ...mockVisibility,
      blockers: [],
    };

    render(<ExternalVisibility data={dataWithNoBlockers} />);

    expect(
      screen.queryByText(/admin-blocked signals:/i)
    ).not.toBeInTheDocument();
  });

  it('renders check details text', () => {
    render(<ExternalVisibility data={mockVisibility} />);

    expect(
      screen.getByText('Missing homepage repository setting.')
    ).toBeInTheDocument();
    expect(screen.getByText('activity.json is stale')).toBeInTheDocument();
  });

  it('sets aria-label on blocked badge with admin action guidance', () => {
    render(<ExternalVisibility data={mockVisibility} />);

    const blockedBadge = screen.getByText(/^blocked$/i);
    expect(blockedBadge).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^blocked:.*requires repository admin action/i)
    );
  });
});
