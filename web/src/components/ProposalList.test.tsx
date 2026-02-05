import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProposalList } from './ProposalList';
import type { Proposal } from '../types/activity';

describe('ProposalList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "No active proposals" when proposals array is empty', () => {
    render(<ProposalList proposals={[]} repoUrl={repoUrl} />);
    expect(screen.getByText(/no active proposals/i)).toBeInTheDocument();
  });

  it('renders a list of proposals with correct details', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Add new feature',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 5,
      },
      {
        number: 2,
        title: 'Improve performance',
        phase: 'voting',
        author: 'scout',
        createdAt: '2026-02-05T08:00:00Z',
        commentCount: 10,
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Add new feature')).toBeInTheDocument();
    expect(screen.getByText('discussion')).toBeInTheDocument();
    expect(screen.getByText('@worker')).toBeInTheDocument();

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Improve performance')).toBeInTheDocument();
    expect(screen.getByText('voting')).toBeInTheDocument();
    expect(screen.getByText('@scout')).toBeInTheDocument();
  });

  it('links to the correct issue URL for each proposal', () => {
    const proposals: Proposal[] = [
      {
        number: 42,
        title: 'Test proposal',
        phase: 'ready-to-implement',
        author: 'agent-1',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 2,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/42'
    );
  });

  it('renders vote summary when present', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Voting proposal',
        phase: 'voting',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 3,
        votesSummary: { thumbsUp: 5, thumbsDown: 2 },
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    // Vote counts are rendered with emojis: 👍 5 and 👎 2
    expect(screen.getByText(/👍/)).toBeInTheDocument();
    expect(screen.getByText(/👎/)).toBeInTheDocument();
  });

  it('renders comment count', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Test proposal',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 15,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    // Comment count is rendered with emoji: 💬 15
    expect(screen.getByText(/💬/)).toBeInTheDocument();
  });

  it('renders all phase types correctly', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Discussion phase',
        phase: 'discussion',
        author: 'a',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 1,
      },
      {
        number: 2,
        title: 'Voting phase',
        phase: 'voting',
        author: 'b',
        createdAt: '2026-02-05T08:00:00Z',
        commentCount: 1,
      },
      {
        number: 3,
        title: 'Ready phase',
        phase: 'ready-to-implement',
        author: 'c',
        createdAt: '2026-02-05T07:00:00Z',
        commentCount: 1,
      },
      {
        number: 4,
        title: 'Implemented phase',
        phase: 'implemented',
        author: 'd',
        createdAt: '2026-02-05T06:00:00Z',
        commentCount: 1,
      },
      {
        number: 5,
        title: 'Rejected phase',
        phase: 'rejected',
        author: 'e',
        createdAt: '2026-02-05T05:00:00Z',
        commentCount: 1,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(screen.getByText('discussion')).toBeInTheDocument();
    expect(screen.getByText('voting')).toBeInTheDocument();
    expect(screen.getByText('ready to implement')).toBeInTheDocument();
    expect(screen.getByText('implemented')).toBeInTheDocument();
    expect(screen.getByText('rejected')).toBeInTheDocument();
  });
});
