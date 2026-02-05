import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PullRequestList } from './PullRequestList';
import { createPullRequest } from '../test/fixtures/activity';

describe('PullRequestList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "draft" badge when pr.draft is true', () => {
    const pullRequests = [
      createPullRequest({
        number: 123,
        title: 'Draft PR',
        draft: true,
      }),
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);
    
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('Draft PR')).toBeInTheDocument();
  });

  it('does not render "draft" badge when pr.draft is false', () => {
    const pullRequests = [
      createPullRequest({
        number: 124,
        title: 'Regular PR',
        draft: false,
      }),
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);
    
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
    expect(screen.getByText('Regular PR')).toBeInTheDocument();
  });

  it('renders state badge correctly', () => {
    const pullRequests = [
      createPullRequest({
        state: 'merged',
      }),
    ];

    render(<PullRequestList pullRequests={pullRequests} repoUrl={repoUrl} />);
    
    expect(screen.getByText('merged')).toBeInTheDocument();
  });
});
