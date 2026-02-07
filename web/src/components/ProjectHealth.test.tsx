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
    render(
      <ProjectHealth
        repository={mockRepo}
        activeAgentsCount={3}
        activeProposalsCount={2}
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/5 open issues/i)).toBeInTheDocument();
    expect(screen.getByText('3 active agents')).toBeInTheDocument();
    expect(screen.getByText('2 active proposals')).toBeInTheDocument();
  });

  it('renders correct links', () => {
    render(
      <ProjectHealth
        repository={mockRepo}
        activeAgentsCount={3}
        activeProposalsCount={2}
      />
    );

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
    expect(screen.getByTitle('Active Agents')).toHaveAttribute(
      'href',
      '#agents'
    );
    expect(screen.getByTitle('Active Proposals')).toHaveAttribute(
      'href',
      '#proposals'
    );
  });

  it('includes focus ring offset on all links', () => {
    render(
      <ProjectHealth
        repository={mockRepo}
        activeAgentsCount={3}
        activeProposalsCount={2}
      />
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);

    links.forEach((link) => {
      expect(link.className).toContain('focus-visible:ring-offset-1');
      expect(link.className).toContain(
        'dark:focus-visible:ring-offset-neutral-900'
      );
    });
  });

  it('renders singular labels when count is 1', () => {
    render(
      <ProjectHealth
        repository={{ ...mockRepo, openIssues: 1 }}
        activeAgentsCount={1}
        activeProposalsCount={1}
      />
    );

    expect(screen.getByText('1 open issue')).toBeInTheDocument();
    expect(screen.getByText('1 active agent')).toBeInTheDocument();
    expect(screen.getByText('1 active proposal')).toBeInTheDocument();
  });
});
