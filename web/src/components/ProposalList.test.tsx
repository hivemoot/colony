import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProposalList } from './ProposalList';
import { getProposalHash } from '../utils/decision-explorer';
import type { Proposal, PullRequest } from '../types/activity';

describe('ProposalList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  beforeEach(() => {
    window.location.hash = '';
  });

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

  it('opens a detail panel when a proposal is selected', () => {
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
        name: /proposal detail for #192/i,
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

  it('uses motion-safe transition classes on vote support progress bar', () => {
    const proposals: Proposal[] = [
      {
        number: 1,
        title: 'Voting proposal',
        phase: 'voting',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 2,
        votesSummary: { thumbsUp: 3, thumbsDown: 1 },
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    fireEvent.click(screen.getByRole('button', { name: /#1/i }));

    const progressBar = screen.getByRole('progressbar', {
      name: /support percentage/i,
    });
    expect(progressBar.className).toContain('motion-safe:transition-all');
    expect(progressBar.className).toContain('motion-safe:duration-500');
    expect(progressBar.className).not.toMatch(/(^|\s)transition-all(\s|$)/);
    expect(progressBar.className).not.toMatch(/(^|\s)duration-500(\s|$)/);
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
        type: 'issue' as const,
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
        type: 'issue' as const,
        repo: 'hivemoot/hivemoot',
        author: 'builder',
        body: 'Cross-repo comment',
        createdAt: '2026-02-05T11:30:00Z',
        url: 'https://github.com/hivemoot/hivemoot/issues/1#issuecomment-103',
      },
      {
        id: 104,
        issueOrPrNumber: 1, // Same number but phase-transition synthetic type
        type: 'proposal' as const,
        repo: 'hivemoot/colony',
        author: 'builder',
        body: 'Moved to voting phase',
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

    expect(screen.getByText('Discussion (1)')).toBeInTheDocument();
    expect(screen.getAllByText(/@scout/i).length).toBeGreaterThanOrEqual(1);
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
      screen.queryByText(/Moved to voting phase/i)
    ).not.toBeInTheDocument();
  });

  it('marks metadata/system comments in proposal discussion', () => {
    const proposals: Proposal[] = [
      {
        number: 7,
        title: 'System message visibility',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 1,
        repo: 'hivemoot/colony',
      },
    ];
    const comments = [
      {
        id: 301,
        issueOrPrNumber: 7,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'hivemoot',
        body: '<!-- hivemoot-metadata: {"type":"welcome"} -->\n# Discussion Phase',
        createdAt: '2026-02-05T09:30:00Z',
        url: 'https://github.com/hivemoot/colony/issues/7#issuecomment-301',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /#7/i }));

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText(/@hivemoot/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view on github/i })
    ).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/7#issuecomment-301'
    );
  });

  it('clamps long discussion comments and supports expand/collapse', () => {
    const proposals: Proposal[] = [
      {
        number: 8,
        title: 'Clamp long comments',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-05T09:00:00Z',
        commentCount: 1,
        repo: 'hivemoot/colony',
      },
    ];
    const longBody = `Long comment: ${'lorem ipsum '.repeat(40)}`;
    const comments = [
      {
        id: 401,
        issueOrPrNumber: 8,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'builder',
        body: longBody,
        createdAt: '2026-02-05T09:30:00Z',
        url: 'https://github.com/hivemoot/colony/issues/8#issuecomment-401',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /#8/i }));

    const showMoreButton = screen.getByRole('button', { name: /show more/i });
    expect(showMoreButton).toHaveAttribute('aria-expanded', 'false');
    const clampedComment = screen.getByText((content) =>
      content.startsWith('Long comment:')
    );
    expect(clampedComment.textContent?.endsWith('...')).toBe(true);

    fireEvent.click(showMoreButton);
    const expandedComment = screen.getByText((content) =>
      content.startsWith('Long comment:')
    );
    expect(expandedComment.textContent).toBe(longBody);

    const showLessButton = screen.getByRole('button', { name: /show less/i });
    expect(showLessButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(showLessButton);
    const reclampedComment = screen.getByText((content) =>
      content.startsWith('Long comment:')
    );
    expect(reclampedComment.textContent?.endsWith('...')).toBe(true);
    expect(
      screen.getByRole('button', { name: /show more/i })
    ).toBeInTheDocument();
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
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'worker',
        body: 'Colony-only comment',
        createdAt: '2026-02-05T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-201',
      },
      {
        id: 202,
        issueOrPrNumber: 1,
        type: 'issue' as const,
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

    const issueLinks = screen.getAllByRole('link', { name: /view issue/i });
    expect(issueLinks[0]).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/1'
    );
    expect(issueLinks[1]).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/hivemoot/issues/1'
    );

    fireEvent.click(screen.getByRole('button', { name: /colony proposal/i }));
    expect(screen.getByText(/Colony-only comment/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Hivemoot-only comment/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view proposal thread/i })
    ).toHaveAttribute('href', 'https://github.com/hivemoot/colony/issues/1');

    fireEvent.click(screen.getByRole('button', { name: /hivemoot proposal/i }));
    expect(screen.getByText(/Hivemoot-only comment/i)).toBeInTheDocument();
    expect(screen.queryByText(/Colony-only comment/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view proposal thread/i })
    ).toHaveAttribute('href', 'https://github.com/hivemoot/hivemoot/issues/1');
  });

  it('shows proposal title in the detail panel header', () => {
    const proposals: Proposal[] = [
      {
        number: 50,
        title: 'My important proposal',
        phase: 'voting',
        author: 'builder',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 3,
        votesSummary: { thumbsUp: 2, thumbsDown: 0 },
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);
    fireEvent.click(screen.getByRole('button', { name: /#50/i }));

    // Title appears in both the card and the detail panel header
    expect(screen.getAllByText('My important proposal').length).toBe(2);
    expect(
      screen.getByRole('button', { name: /close detail view/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy link to proposal/i })
    ).toBeInTheDocument();
  });

  it('closes detail panel with the close button', () => {
    const proposals: Proposal[] = [
      {
        number: 60,
        title: 'Closeable proposal',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 0,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);
    fireEvent.click(screen.getByRole('button', { name: /#60/i }));

    expect(
      screen.getByRole('region', { name: /proposal detail for #60/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close detail view/i }));
    expect(
      screen.queryByRole('region', { name: /proposal detail for #60/i })
    ).not.toBeInTheDocument();
  });

  it('shows participants in the detail panel sidebar', () => {
    const proposals: Proposal[] = [
      {
        number: 70,
        title: 'Proposal with participants',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 3,
        repo: 'hivemoot/colony',
      },
    ];
    const comments = [
      {
        id: 501,
        issueOrPrNumber: 70,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'scout',
        body: 'First comment',
        createdAt: '2026-02-10T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/70#issuecomment-501',
      },
      {
        id: 502,
        issueOrPrNumber: 70,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'builder',
        body: 'Second comment',
        createdAt: '2026-02-10T11:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/70#issuecomment-502',
      },
      {
        id: 503,
        issueOrPrNumber: 70,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'scout',
        body: 'Third comment',
        createdAt: '2026-02-10T12:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/70#issuecomment-503',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /#70/i }));

    expect(screen.getByText('Participants (2)')).toBeInTheDocument();
    expect(screen.getByText('2 comments')).toBeInTheDocument();
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  it('excludes system comments from participants', () => {
    const proposals: Proposal[] = [
      {
        number: 71,
        title: 'System excluded from participants',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 2,
        repo: 'hivemoot/colony',
      },
    ];
    const comments = [
      {
        id: 601,
        issueOrPrNumber: 71,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'hivemoot',
        body: '<!-- hivemoot-metadata: {"type":"welcome"} -->\nWelcome!',
        createdAt: '2026-02-10T09:05:00Z',
        url: 'https://github.com/hivemoot/colony/issues/71#issuecomment-601',
      },
      {
        id: 602,
        issueOrPrNumber: 71,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'scout',
        body: 'Real feedback',
        createdAt: '2026-02-10T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/71#issuecomment-602',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /#71/i }));

    expect(screen.getByText('Participants (1)')).toBeInTheDocument();
  });

  it('includes an author when they have any non-system comment', () => {
    const proposals: Proposal[] = [
      {
        number: 72,
        title: 'Mixed system and non-system comments',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 2,
        repo: 'hivemoot/colony',
      },
    ];
    const comments = [
      {
        id: 701,
        issueOrPrNumber: 72,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'scout',
        body: '<!-- hivemoot-metadata: {"type":"welcome"} -->\nWelcome!',
        createdAt: '2026-02-10T09:05:00Z',
        url: 'https://github.com/hivemoot/colony/issues/72#issuecomment-701',
      },
      {
        id: 702,
        issueOrPrNumber: 72,
        type: 'issue' as const,
        repo: 'hivemoot/colony',
        author: 'scout',
        body: 'Real feedback from scout',
        createdAt: '2026-02-10T10:00:00Z',
        url: 'https://github.com/hivemoot/colony/issues/72#issuecomment-702',
      },
    ];

    render(
      <ProposalList
        proposals={proposals}
        comments={comments}
        repoUrl={repoUrl}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /#72/i }));

    expect(screen.getByText('Participants (1)')).toBeInTheDocument();
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  it('updates URL hash when selecting a proposal', () => {
    const proposals: Proposal[] = [
      {
        number: 42,
        title: 'Hash test',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 0,
      },
    ];

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);
    fireEvent.click(screen.getByRole('button', { name: /#42/i }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#proposal-42');

    replaceStateSpy.mockRestore();
  });

  it('clears URL hash when deselecting a proposal', () => {
    const proposals: Proposal[] = [
      {
        number: 43,
        title: 'Deselect hash test',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 0,
      },
    ];

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);
    fireEvent.click(screen.getByRole('button', { name: /#43/i }));
    fireEvent.click(screen.getByRole('button', { name: /close detail view/i }));

    const lastCall =
      replaceStateSpy.mock.calls[replaceStateSpy.mock.calls.length - 1];
    expect(lastCall[2]).not.toContain('#proposal-');

    replaceStateSpy.mockRestore();
  });

  it('resolves proposal from URL hash on mount', () => {
    window.location.hash = '#proposal-99';

    const proposals: Proposal[] = [
      {
        number: 99,
        title: 'Auto-opened proposal',
        phase: 'voting',
        author: 'builder',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 1,
        votesSummary: { thumbsUp: 3, thumbsDown: 0 },
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(
      screen.getByRole('region', { name: /proposal detail for #99/i })
    ).toBeInTheDocument();
  });

  it('resolves multi-repo proposal hash', () => {
    window.location.hash = '#proposal-hivemoot-hivemoot-5';

    const proposals: Proposal[] = [
      {
        number: 5,
        title: 'Cross-repo hash test',
        phase: 'discussion',
        author: 'scout',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 0,
        repo: 'hivemoot/hivemoot',
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(
      screen.getByRole('region', { name: /proposal detail for #5/i })
    ).toBeInTheDocument();
  });

  it('sets id attribute on proposal card for hash navigation', () => {
    const proposals: Proposal[] = [
      {
        number: 10,
        title: 'ID test',
        phase: 'discussion',
        author: 'worker',
        createdAt: '2026-02-10T09:00:00Z',
        commentCount: 0,
      },
    ];

    render(<ProposalList proposals={proposals} repoUrl={repoUrl} />);

    expect(document.getElementById('proposal-10')).toBeInTheDocument();
  });

  it('generates correct hash for local and repo proposals', () => {
    expect(
      getProposalHash({
        number: 42,
        title: 't',
        phase: 'discussion',
        author: 'a',
        createdAt: '',
        commentCount: 0,
      })
    ).toBe('proposal-42');

    expect(
      getProposalHash({
        number: 3,
        title: 't',
        phase: 'voting',
        author: 'b',
        createdAt: '',
        commentCount: 0,
        repo: 'hivemoot/hivemoot',
      })
    ).toBe('proposal-hivemoot-hivemoot-3');
  });
});
