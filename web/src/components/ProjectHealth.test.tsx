import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProjectHealth } from './ProjectHealth';

describe('ProjectHealth', () => {
  const mockRepo = {
    stars: 42,
    forks: 8,
    openIssues: 5,
    url: 'https://github.com/hivemoot/colony',
  };

  it('renders all metrics with correct values', () => {
    render(<ProjectHealth repository={mockRepo} />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/5 open issues/i)).toBeInTheDocument();
  });

  it('renders correct links', () => {
    render(<ProjectHealth repository={mockRepo} />);

    expect(screen.getByTitle('Stars')).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/stargazers'
    );
    expect(screen.getByTitle('Forks')).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/network/members'
    );
    expect(screen.getByTitle('Open Issues')).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues'
    );
  });

  it('includes dark mode hover color class', () => {
    render(<ProjectHealth repository={mockRepo} />);

    const starLink = screen.getByTitle('Stars');
    expect(starLink.className).toContain('dark:hover:text-amber-400');
  });
});
