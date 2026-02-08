import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CollaborationNetwork } from './CollaborationNetwork';
import type {
  ActivityData,
  AgentStats,
  Comment,
  PullRequest,
  Proposal,
} from '../types/activity';

function makeAgentStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    login: 'agent-a',
    commits: 1,
    pullRequestsMerged: 0,
    issuesOpened: 0,
    reviews: 0,
    comments: 0,
    lastActiveAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    issueOrPrNumber: 10,
    type: 'issue',
    author: 'agent-a',
    body: 'Test comment',
    createdAt: '2026-02-05T09:00:00Z',
    url: 'https://github.com/hivemoot/colony/issues/10#comment-1',
    ...overrides,
  };
}

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 10,
    title: 'Test PR',
    state: 'merged',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    number: 1,
    title: 'Test proposal',
    phase: 'discussion',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    commentCount: 3,
    ...overrides,
  };
}

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-05T10:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [],
    commits: [],
    issues: [],
    pullRequests: [],
    comments: [],
    proposals: [],
    ...overrides,
  };
}

describe('CollaborationNetwork', () => {
  it('shows fallback when fewer than 2 agents', () => {
    const data = makeData({
      agentStats: [makeAgentStats({ login: 'solo-agent' })],
    });

    render(<CollaborationNetwork data={data} />);
    expect(
      screen.getByText('Not enough agents to show collaboration patterns')
    ).toBeInTheDocument();
  });

  it('shows fallback when no interactions exist', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
    });

    render(<CollaborationNetwork data={data} />);
    expect(
      screen.getByText('No collaboration data available yet')
    ).toBeInTheDocument();
  });

  it('renders summary stats with correct values', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'bob' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    expect(screen.getByText('Total Interactions')).toBeInTheDocument();
    expect(screen.getByText('Active Pairs')).toBeInTheDocument();
    expect(screen.getByText('Connectivity')).toBeInTheDocument();
  });

  it('renders the collaboration matrix table', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'hivemoot-builder' }),
        makeAgentStats({ login: 'hivemoot-worker' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'hivemoot-worker' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'hivemoot-builder',
        }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveAttribute(
      'aria-label',
      'Agent collaboration matrix showing interaction counts between agent pairs'
    );
  });

  it('strips hivemoot- prefix from agent names', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'hivemoot-builder' }),
        makeAgentStats({ login: 'hivemoot-worker' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'hivemoot-worker' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'hivemoot-builder',
        }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    // Should show "builder" and "worker" instead of full login
    expect(screen.getAllByText('builder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('worker').length).toBeGreaterThan(0);
  });

  it('displays dash on diagonal cells (self-interaction)', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      comments: [
        makeComment({ id: 1, issueOrPrNumber: 5, author: 'alice' }),
        makeComment({ id: 2, issueOrPrNumber: 5, author: 'bob' }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    // Diagonal cells show "—"
    const dashes = screen.getAllByText('—');
    expect(dashes).toHaveLength(2);
  });

  it('renders legend with interaction types', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      comments: [
        makeComment({ id: 1, issueOrPrNumber: 5, author: 'alice' }),
        makeComment({ id: 2, issueOrPrNumber: 5, author: 'bob' }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    expect(screen.getByText('Reviews')).toBeInTheDocument();
    expect(screen.getByText('Co-discussions')).toBeInTheDocument();
    expect(screen.getByText('Implementations')).toBeInTheDocument();
  });

  it('shows interaction counts in matrix cells', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'bob' })],
      comments: [
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
        makeComment({
          id: 2,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
        makeComment({
          id: 3,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    // Alice → Bob has 3 reviews
    const cells = screen.getAllByRole('cell');
    const cellTexts = cells.map((c) => c.textContent);
    expect(cellTexts).toContain('3');
  });

  it('renders correctly with multiple agents and mixed interaction types', () => {
    const data = makeData({
      agentStats: [
        makeAgentStats({ login: 'alice' }),
        makeAgentStats({ login: 'bob' }),
        makeAgentStats({ login: 'charlie' }),
      ],
      pullRequests: [makePR({ number: 10, author: 'bob' })],
      proposals: [makeProposal({ number: 20, author: 'charlie' })],
      comments: [
        // alice reviews bob's PR
        makeComment({
          id: 1,
          issueOrPrNumber: 10,
          type: 'review',
          author: 'alice',
        }),
        // alice and charlie co-discuss issue #5
        makeComment({ id: 2, issueOrPrNumber: 5, author: 'alice' }),
        makeComment({ id: 3, issueOrPrNumber: 5, author: 'charlie' }),
      ],
    });

    render(<CollaborationNetwork data={data} />);

    // Should render a 3x3 matrix (3 agents)
    const headerCells = screen.getAllByRole('columnheader');
    expect(headerCells).toHaveLength(4); // 1 "Agent" header + 3 agent names

    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(3); // 3 agent rows
  });
});
