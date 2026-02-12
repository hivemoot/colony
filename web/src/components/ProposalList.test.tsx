import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProposalList } from './ProposalList';
import type { Proposal, PullRequest } from '../types/activity';

describe('ProposalList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "No active proposals" when proposals array is empty', () => {
    render(<ProposalList proposals={[]} repoUrl={repoUrl} />);
    expect(screen.getByText(/no active proposals/i)).toBeInTheDocument();
  });

  it('renders "No proposals from {agent}" when filtered and empty', () => {
    render(
      <ProposalList proposals={[]} repoUrl={repoUrl} filteredAgent="worker" />
    );
    expect(screen.getByText('No proposals from worker')).toBeInTheDocument();
  });

  it('renders proposal cards with key details', () => {
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

  it('keeps a direct issue link for each proposal', () => {
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

    const issueLink = screen.getByRole('link', { name: /view issue/i });
    expect(issueLink).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/42'
    );
  });

  it('opens a decision explorer panel when a proposal is selected', () => {
    const proposals: Proposal[] = [
      {
        number: 192,
        title: 'Decision explorer',
        phase: 'ready-to-implement',
        author: 'worker',
        createdAt: '2026-02-09T10:00:00Z',
        commentCount: 7,
        votesSummary: { thumbsUp: 4, thumbsDown: 1 },
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-09T10:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-09T12:00:00Z' },
          { phase: 'ready-to-implement', enteredAt: '2026-02-09T16:00:00Z' },
        ],
      },
    ];
    const pullRequests: PullRequest[] = [
      {
        number: 250,
        title: 'feat: decision explorer',
        body: 'Fixes #192',
        state: 'open',
        author: 'worker',
        createdAt: '2026-02-10T08:00:00Z',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        pullRequests={pullRequests}
        repoUrl={repoUrl}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /#192/i }));

    expect(
      screen.getByRole('region', {
        name: /decision explorer for proposal #192/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Vote Breakdown')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PR #250/i })).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/pull/250'
    );
  });

  it('shows fallback text when no implementing PR is linked', () => {
    const proposals: Proposal[] = [
      {
        number: 193,
        title: 'No linked PR',
        phase: 'ready-to-implement',
        author: 'worker',
        createdAt: '2026-02-09T10:00:00Z',
        commentCount: 2,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    fireEvent.click(screen.getByRole('button', { name: /#193/i }));
    expect(
      screen.getByText(/No linked implementation PR found yet/i)
    ).toBeInTheDocument();
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
        number: 7,
        title: 'Extended voting phase',
        phase: 'extended-voting',
        author: 'g',
        createdAt: '2026-02-05T07:30:00Z',
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
      {
        number: 6,
        title: 'Inconclusive phase',
        phase: 'inconclusive',
        author: 'f',
        createdAt: '2026-02-05T04:00:00Z',
        commentCount: 1,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(screen.getByText('discussion')).toBeInTheDocument();
    expect(screen.getByText('voting')).toBeInTheDocument();
    expect(screen.getByText('extended voting')).toBeInTheDocument();
    expect(screen.getByText('ready to implement')).toBeInTheDocument();
    expect(screen.getByText('implemented')).toBeInTheDocument();
    expect(screen.getByText('rejected')).toBeInTheDocument();
    expect(screen.getByText('inconclusive')).toBeInTheDocument();
  });

  it('renders vote and comment emojis with aria-labels', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Emoji labels',
        phase: 'voting',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 5,
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(screen.getByLabelText('votes for')).toBeInTheDocument();
    expect(screen.getByLabelText('votes against')).toBeInTheDocument();
    expect(screen.getByLabelText('comments')).toBeInTheDocument();
  });

  it('renders lifecycle duration when phaseTransitions span multiple phases', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Lifecycle proposal',
        phase: 'implemented',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 5,
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-05T14:00:00Z' },
          { phase: 'voting', enteredAt: '2026-02-05T16:00:00Z' },
          { phase: 'implemented', enteredAt: '2026-02-05T18:00:00Z' },
        ],
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(screen.getByLabelText('lifecycle duration')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
  });

  it('does not render lifecycle duration with fewer than 2 transitions', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Single phase proposal',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 2,
        phaseTransitions: [
          { phase: 'discussion', enteredAt: '2026-02-05T14:00:00Z' },
        ],
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(
      screen.queryByLabelText('lifecycle duration')
    ).not.toBeInTheDocument();
  });

  it('renders proposal title tooltip and semantic timestamp', () => {
    const createdAt = '2026-02-05T09:00:00Z';
    const title =
      'A very long proposal title that would be truncated by the line-clamp CSS utility';
    const proposals: Proposal[] = [
      {
        number: 1,
        title,
        phase: 'discussion',
        author: 'worker',
        createdAt,
        commentCount: 0,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    const heading = screen.getByText(title);
    expect(heading).toHaveAttribute('title', title);

    const timeEl = screen.getByText(/ago/i);
    expect(timeEl.tagName.toLowerCase()).toBe('time');
    expect(timeEl).toHaveAttribute('datetime', createdAt);
  });

  it('includes focus indicators on proposal action buttons', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Test proposal',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 0,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    const actionButton = screen.getByRole('button', { name: /#1/i });
    expect(actionButton.className).toContain('focus-visible:ring-2');
    expect(actionButton.className).toContain('focus-visible:ring-offset-1');
    expect(actionButton.className).toContain(
      'dark:focus-visible:ring-offset-neutral-800'
    );
  });

  it('renders proposal comments in the discussion section when selected', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Proposal with comments',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 1,
        repo: 'hivemoot/colony',
      },
    ];
    const comments = [
      {
        id: 101,
        issueOrPrNumber: 1,
        type: 'proposal' as const,
        repo: 'hivemoot/colony',
        author: 'scout',
        body: 'I support this proposal!',
        createdAt: '2026-02-05T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-101',
      },
      {
        id: 102,
        issueOrPrNumber: 2, // Different proposal
        type: 'proposal' as const,
        repo: 'hivemoot/colony',
        author: 'builder',
        body: 'Unrelated comment',
        createdAt: '2026-02-05T11:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/2#issuecomment-102',
      },
      {
        id: 103,
        issueOrPrNumber: 1, // Same proposal number in different repo
        type: 'proposal' as const,
        repo: 'hivemoot/hivemoot',
        author: 'builder',
        body: 'Cross-repo comment',
        createdAt: '2026-02-05T11:30:00Z',
        url: 'https://github.com/hivemoot/hivemoot/issues/1#issuecomment-103',
      },
      {
        id: 104,
        issueOrPrNumber: 1, // Same number but wrong comment type
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'builder',
        body: 'Same number issue comment',
        createdAt: '2026-02-05T11:45:00Z',
        url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-104',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /#1/i }));

    expect(screen.getByText('Discussion')).toBeInTheDocument();
    expect(screen.getByText(/@scout/i)).toBeInTheDocument();
    expect(screen.getByText(/I support this proposal!/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view on github/i })
    ).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/1#issuecomment-101'
    );
    expect(screen.queryByText(/Unrelated comment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cross-repo comment/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Same number issue comment/i)
    ).not.toBeInTheDocument();
  });

  it('keeps proposal selection and panel ids unique across repos', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Colony proposal',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 1,
        repo: 'hivemoot/colony',
      },
      {
        number: 1,
        title: 'Hivemoot proposal',
        phase: 'discussion',
        author: 'scout',
        createdAt: '2026-02-05T09:30:00Z',
        commentCount: 1,
        repo: 'hivemoot/hivemoot',
      },
    ];
    const comments = [
      {
        id: 201,
        issueOrPrNumber: 1,
        type: 'proposal' as const,
        repo: 'hivemoot/colony',
        author: 'worker',
        body: 'Colony-only comment',
        createdAt: '2026-02-05T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-201',
      },
      {
        id: 202,
        issueOrPrNumber: 1,
        type: 'proposal' as const,
        repo: 'hivemoot/hivemoot',
        author: 'scout',
        body: 'Hivemoot-only comment',
        createdAt: '2026-02-05T10:05:00Z',
        url: 'https://github.com/hivemoot/hivemoot/issues/1#issuecomment-202',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );

    const proposalButtons = screen.getAllByRole('button', { name: /#1/i });
    const controlsIds = proposalButtons.map((button) =>
      button.getAttribute('aria-controls')
    );
    expect(controlsIds[0]).not.toEqual(controlsIds[1]);

    fireEvent.click(screen.getByRole('button', { name: /colony proposal/i }));
    expect(screen.getByText(/Colony-only comment/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Hivemoot-only comment/i)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hivemoot proposal/i }));
    expect(screen.getByText(/Hivemoot-only comment/i)).toBeInTheDocument();
    expect(screen.queryByText(/Colony-only comment/i)).not.toBeInTheDocument();
  });
});
