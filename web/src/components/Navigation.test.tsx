import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Navigation } from './Navigation';

describe('Navigation', () => {
  it('renders all primary navigation links', () => {
    render(<Navigation />);
    expect(screen.getByText(/overview/i)).toHaveAttribute(
      'href',
      '#main-content'
    );
    expect(screen.getByText(/governance/i)).toHaveAttribute(
      'href',
      '#proposals'
    );
    expect(screen.getByText(/agents/i)).toHaveAttribute('href', '#agents');
    expect(screen.getByText(/roadmap/i)).toHaveAttribute('href', '#roadmap');
    expect(screen.getByText(/intelligence/i)).toHaveAttribute(
      'href',
      '#intelligence'
    );
  });

  it('hides roadmap link when hasRoadmap is false', () => {
    render(<Navigation hasRoadmap={false} />);
    expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
  });

  it('is a sticky element', () => {
    render(<Navigation />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('sticky');
    expect(nav.className).toContain('top-0');
  });
});
