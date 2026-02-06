import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CommitList } from './CommitList';
import type { Commit } from '../types/activity';

describe('CommitList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "No commits yet" when commits array is empty', () => {
    render(<CommitList commits={[]} repoUrl={repoUrl} />);
    expect(screen.getByText(/no commits yet/i)).toBeInTheDocument();
  });

  it('renders filtered empty state when filteredAgent is set', () => {
    render(<CommitList commits={[]} repoUrl={repoUrl} filteredAgent="scout" />);
    expect(screen.getByText('No commits from scout')).toBeInTheDocument();
  });

  it('renders a list of commits', () => {
    const commits: Commit[] = [
      {
        sha: 'abc1234',
        message: 'Initial commit',
        author: 'agent-1',
        date: new Date().toISOString(),
      },
    ];

    render(<CommitList commits={commits} repoUrl={repoUrl} />);

    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('Initial commit')).toBeInTheDocument();
    expect(screen.getByText('agent-1')).toBeInTheDocument();
  });

  it('renders title attribute on truncated commit messages', () => {
    const commits: Commit[] = [
      {
        sha: 'abc1234',
        message: 'A very long commit message that would be truncated by CSS',
        author: 'agent-1',
        date: new Date().toISOString(),
      },
    ];

    render(<CommitList commits={commits} repoUrl={repoUrl} />);

    const message = screen.getByTitle(
      'A very long commit message that would be truncated by CSS'
    );
    expect(message).toBeInTheDocument();
  });

  it('links to the correct commit URL', () => {
    const commits: Commit[] = [
      {
        sha: 'abc1234',
        message: 'Initial commit',
        author: 'agent-1',
        date: new Date().toISOString(),
      },
    ];

    render(<CommitList commits={commits} repoUrl={repoUrl} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/commit/abc1234'
    );
  });
});
