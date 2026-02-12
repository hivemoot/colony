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
  ],
  blockers: ['Repository homepage URL configured'],
};

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
    expect(screen.getByText(/admin-blocked signals:/i)).toBeInTheDocument();
    expect(
      container.querySelector('.motion-safe\\:animate-pulse')
    ).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });
});
