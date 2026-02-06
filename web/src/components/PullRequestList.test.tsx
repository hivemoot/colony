import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PullRequestList } from './PullRequestList';
import type { PullRequest } from '../types/activity';

const REPO_URL = 'https://github.com/hivemoot/colony';

const basePR: PullRequest = {
  number: 10,
  title: 'feat: add dashboard',
  state: 'open',
  author: 'hivemoot-builder',
  createdAt: '2026-02-01T00:00:00Z',
};

describe('PullRequestList', () => {
  it('renders empty state when no pull requests', () => {
    render(<PullRequestList pullRequests={[]} repoUrl={REPO_URL} />);
    expect(screen.getByText(/no pull requests yet/i)).toBeInTheDocument();
  });

  it('renders PR with number, title, author, and link', () => {
    render(<PullRequestList pullRequests={[basePR]} repoUrl={REPO_URL} />);

    expect(screen.getByText('#10')).toBeInTheDocument();
    expect(screen.getByText('feat: add dashboard')).toBeInTheDocument();
    expect(screen.getByText('hivemoot-builder')).toBeInTheDocument();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/pull/10'
    );
  });

  it('renders title attribute on truncated PR titles', () => {
    render(<PullRequestList pullRequests={[basePR]} repoUrl={REPO_URL} />);

    const title = screen.getByTitle('feat: add dashboard');
    expect(title).toBeInTheDocument();
  });

  it('renders open state badge', () => {
    render(<PullRequestList pullRequests={[basePR]} repoUrl={REPO_URL} />);
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('renders merged state badge', () => {
    const mergedPR: PullRequest = { ...basePR, state: 'merged' };
    render(<PullRequestList pullRequests={[mergedPR]} repoUrl={REPO_URL} />);
    expect(screen.getByText('merged')).toBeInTheDocument();
  });

  it('renders closed state badge', () => {
    const closedPR: PullRequest = { ...basePR, state: 'closed' };
    render(<PullRequestList pullRequests={[closedPR]} repoUrl={REPO_URL} />);
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('renders author avatar images', () => {
    render(<PullRequestList pullRequests={[basePR]} repoUrl={REPO_URL} />);

    const avatar = screen.getByAltText('hivemoot-builder');
    expect(avatar).toHaveAttribute(
      'src',
      'https://github.com/hivemoot-builder.png'
    );
  });

  it('renders draft badge when PR is a draft', () => {
    const draftPR: PullRequest = { ...basePR, draft: true };
    render(<PullRequestList pullRequests={[draftPR]} repoUrl={REPO_URL} />);
    expect(screen.getByText('draft')).toBeInTheDocument();
    // State badge should still be present alongside draft badge
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('uses neutral palette for draft badge', () => {
    const draftPR: PullRequest = { ...basePR, draft: true };
    render(<PullRequestList pullRequests={[draftPR]} repoUrl={REPO_URL} />);
    const badge = screen.getByText('draft');
    expect(badge.className).toContain('bg-neutral-100');
    expect(badge.className).not.toContain('bg-gray-');
  });

  it('applies transition-colors to list item links', () => {
    render(<PullRequestList pullRequests={[basePR]} repoUrl={REPO_URL} />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('transition-colors');
  });

  it('does not render draft badge when PR is not a draft', () => {
    render(<PullRequestList pullRequests={[basePR]} repoUrl={REPO_URL} />);
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });

  it('does not render draft badge when draft is explicitly false', () => {
    const nonDraftPR: PullRequest = { ...basePR, draft: false };
    render(<PullRequestList pullRequests={[nonDraftPR]} repoUrl={REPO_URL} />);
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });

  it('renders multiple pull requests', () => {
    const prs: PullRequest[] = [
      basePR,
      { ...basePR, number: 11, title: 'fix: resolve crash', state: 'merged' },
      {
        ...basePR,
        number: 12,
        title: 'wip: new feature',
        state: 'open',
        draft: true,
      },
    ];
    render(<PullRequestList pullRequests={prs} repoUrl={REPO_URL} />);

    expect(screen.getByText('#10')).toBeInTheDocument();
    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
});
