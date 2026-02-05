import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PullRequestList } from './PullRequestList';
import type { PullRequest } from '../types/activity';

describe('PullRequestList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "No pull requests yet" when pullRequests array is empty', () => {
    render(<PullRequestList pullRequests={[]} repoUrl={repoUrl} />);
    expect(screen.getByText(/no pull requests yet/i)).toBeInTheDocument();
  });

  it('renders a list of pull requests with correct details', () => {
    const pullRequests: PullRequest[] = [
      {
        number: 1,
        title: 'Add new feature',
        state: 'open',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
      },
      {
        number: 2,
        title: 'Fix bug',
        state: 'merged',
        author: 'scout',
        createdAt: '2026-02-05T08:00:00Z',
        mergedAt: '2026-02-05T10:00:00Z',
      },
      {
        number: 3,
        title: 'Closed PR',
        state: 'closed',
        author: 'polisher',
        createdAt: '2026-02-05T07:00:00Z',
        closedAt: '2026-02-05T11:00:00Z',
      },
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Add new feature')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('merged')).toBeInTheDocument();
    expect(screen.getByText('scout')).toBeInTheDocument();

    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('Closed PR')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(screen.getByText('polisher')).toBeInTheDocument();
  });

  it('renders a draft pull request with "draft" label', () => {
    const pullRequests: PullRequest[] = [
      {
        number: 4,
        title: 'Draft feature',
        state: 'open',
        draft: true,
        author: 'worker',
        createdAt: '2026-02-05T12:00:00Z',
      },
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);

    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText('Draft feature')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.queryByText('open')).not.toBeInTheDocument();
  });

  it('links to the correct pull request URL', () => {
    const pullRequests: PullRequest[] = [
      {
        number: 42,
        title: 'Test PR',
        state: 'open',
        author: 'agent-1',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/pull/42'
    );
  });

  it('renders author avatar images', () => {
    const pullRequests: PullRequest[] = [
      {
        number: 1,
        title: 'Test PR',
        state: 'open',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);

    const avatar = screen.getByAltText('worker');
    expect(avatar).toHaveAttribute('src', 'https://github.com/worker.png');
  });
});
