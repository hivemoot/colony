import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProjectHealth } from './ProjectHealth';

describe('ProjectHealth', () => {
  const mockRepos = [
    {
      owner: 'hivemoot',
      name: 'colony',
      stars: 42,
      forks: 8,
      openIssues: 5,
      url: 'https://github.com/hivemoot/colony',
    },
  ];

  it('renders all metrics with correct values', () => {
    render(
      <ProjectHealth
        repositories={mockRepos}
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

  it('renders correct links for single repo', () => {
    render(
      <ProjectHealth
        repositories={mockRepos}
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
  });

  it('aggregates metrics for multiple repos', () => {
    const multiRepos = [
      ...mockRepos,
      {
        owner: 'hivemoot',
        name: 'hivemoot',
        stars: 10,
        forks: 2,
        openIssues: 3,
        url: 'https://github.com/hivemoot/hivemoot',
      },
    ];

    render(
      <ProjectHealth
        repositories={multiRepos}
        activeAgentsCount={5}
        activeProposalsCount={4}
      />
    );

    // 42 + 10 = 52
    expect(screen.getByText('52')).toBeInTheDocument();
    // 8 + 2 = 10
    expect(screen.getByText('10')).toBeInTheDocument();
    // 5 + 3 = 8
    expect(screen.getByText(/8 open issues/i)).toBeInTheDocument();
    expect(screen.getByText('2 repos')).toBeInTheDocument();
  });

  it('links to organization for multiple repos', () => {
    const multiRepos = [
      ...mockRepos,
      {
        owner: 'hivemoot',
        name: 'hivemoot',
        stars: 10,
        forks: 2,
        openIssues: 3,
        url: 'https://github.com/hivemoot/hivemoot',
      },
    ];

    render(
      <ProjectHealth
        repositories={multiRepos}
        activeAgentsCount={5}
        activeProposalsCount={4}
      />
    );

    const orgUrl = 'https://github.com/hivemoot';
    expect(screen.getByTitle('Total Stars')).toHaveAttribute('href', orgUrl);
    expect(screen.getByTitle('Total Forks')).toHaveAttribute('href', orgUrl);
    expect(screen.getByTitle('Total Open Issues')).toHaveAttribute(
      'href',
      orgUrl
    );
  });

  it('includes focus ring offset on all links', () => {
    render(
      <ProjectHealth
        repositories={mockRepos}
        activeAgentsCount={3}
        activeProposalsCount={2}
      />
    );

    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link.className).toContain('focus-visible:ring-offset-2');
      expect(link.className).toContain(
        'dark:focus-visible:ring-offset-neutral-900'
      );
    }
  });

  it('renders singular labels when count is 1', () => {
    render(
      <ProjectHealth
        repositories={[{ ...mockRepos[0], openIssues: 1 }]}
        activeAgentsCount={1}
        activeProposalsCount={1}
      />
    );

    expect(screen.getByText('1 open issue')).toBeInTheDocument();
    expect(screen.getByText('1 active agent')).toBeInTheDocument();
    expect(screen.getByText('1 active proposal')).toBeInTheDocument();
  });
});
