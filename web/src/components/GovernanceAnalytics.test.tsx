import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GovernanceAnalytics } from './GovernanceAnalytics';
import type { ActivityData } from '../types/activity';

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

describe('GovernanceAnalytics', () => {
  it('renders summary stat cards', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'implemented',
          author: 'bot-a',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 4,
        },
        {
          number: 2,
          title: 'B',
          phase: 'rejected',
          author: 'bot-b',
          createdAt: '2026-02-05T08:00:00Z',
          commentCount: 6,
        },
        {
          number: 3,
          title: 'C',
          phase: 'voting',
          author: 'bot-a',
          createdAt: '2026-02-05T07:00:00Z',
          commentCount: 2,
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    // Verify all four stat card labels are present
    expect(screen.getByText('Total Proposals')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Active Now')).toBeInTheDocument();
    expect(screen.getByText('Avg Discussion')).toBeInTheDocument();

    // Check specific values: 50% is unique, 4.0 comments is unique
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('4.0 comments')).toBeInTheDocument();

    // "3" and "1" appear in multiple places (stat cards + pipeline legend),
    // so verify they exist via getAllByText
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('shows dash for success rate when no decided proposals', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 2,
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the proposal pipeline bar with phase legend', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 1,
        },
        {
          number: 2,
          title: 'B',
          phase: 'implemented',
          author: 'bot',
          createdAt: '2026-02-05T08:00:00Z',
          commentCount: 1,
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.getByText('Proposal Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Discussion')).toBeInTheDocument();
    expect(screen.getByText('Implemented')).toBeInTheDocument();
  });

  it('renders inconclusive proposals in the pipeline', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'inconclusive',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 3,
        },
        {
          number: 2,
          title: 'B',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T08:00:00Z',
          commentCount: 1,
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.getByText('Inconclusive')).toBeInTheDocument();
    expect(screen.getByText('Discussion')).toBeInTheDocument();
  });

  it('shows Inactive label for agents with zero activity', () => {
    const data = makeData({
      agentStats: [
        {
          login: 'idle-bot',
          commits: 0,
          pullRequestsMerged: 0,
          issuesOpened: 0,
          reviews: 0,
          comments: 0,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
      ],
      proposals: [],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.getByText('idle-bot')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders pipeline with aria-label for accessibility', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'voting',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 1,
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    const pipelineBar = screen.getByRole('img', {
      name: /proposal pipeline/i,
    });
    expect(pipelineBar).toBeInTheDocument();
  });

  it('renders agent specializations when agent stats exist', () => {
    const data = makeData({
      agentStats: [
        {
          login: 'builder',
          commits: 20,
          pullRequestsMerged: 5,
          issuesOpened: 3,
          reviews: 2,
          comments: 10,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
      ],
      proposals: [],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.getByText('Agent Specializations')).toBeInTheDocument();
    expect(screen.getByText('builder')).toBeInTheDocument();
    // builder's primary role is coder (20 commits + 5 PRs = 25 > 10 comments)
    // "Coder" appears both as the role label next to the bar and in the legend
    expect(screen.getAllByText('Coder').length).toBeGreaterThanOrEqual(1);
  });

  it('hides agent specializations when no agent stats', () => {
    const data = makeData({ agentStats: [], proposals: [] });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.queryByText('Agent Specializations')).not.toBeInTheDocument();
  });

  it('renders top proposers section', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'A',
          phase: 'discussion',
          author: 'alice',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 1,
        },
        {
          number: 2,
          title: 'B',
          phase: 'voting',
          author: 'alice',
          createdAt: '2026-02-05T08:00:00Z',
          commentCount: 1,
        },
        {
          number: 3,
          title: 'C',
          phase: 'implemented',
          author: 'bob',
          createdAt: '2026-02-05T07:00:00Z',
          commentCount: 1,
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.getByText('Top Proposers')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();

    // alice has 2, bob has 1
    const aliceBar = screen.getByRole('img', {
      name: /alice: 2 of 3 proposals/,
    });
    expect(aliceBar).toBeInTheDocument();
  });

  it('hides top proposers when no proposals exist', () => {
    const data = makeData({ proposals: [] });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.queryByText('Top Proposers')).not.toBeInTheDocument();
  });

  it('shows empty pipeline message when no proposals exist', () => {
    const data = makeData({ proposals: [] });

    render(<GovernanceAnalytics data={data} />);

    expect(
      screen.getByText('No proposal data to visualize')
    ).toBeInTheDocument();
  });

  it('renders role legend with all four roles', () => {
    const data = makeData({
      agentStats: [
        {
          login: 'bot',
          commits: 1,
          pullRequestsMerged: 0,
          issuesOpened: 0,
          reviews: 0,
          comments: 0,
          lastActiveAt: '2026-02-05T09:00:00Z',
        },
      ],
      proposals: [],
    });

    render(<GovernanceAnalytics data={data} />);

    // "Coder" appears both in the agent's role label and in the legend
    expect(screen.getAllByText('Coder').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Proposer')).toBeInTheDocument();
    expect(screen.getByText('Discussant')).toBeInTheDocument();
  });

  it('renders governance throughput when resolved proposals exist', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'Fast proposal',
          phase: 'ready-to-implement',
          author: 'bot-a',
          createdAt: '2026-02-05T00:00:00Z',
          commentCount: 4,
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-05T00:00:00Z' },
            { phase: 'voting', enteredAt: '2026-02-05T06:00:00Z' },
            {
              phase: 'ready-to-implement',
              enteredAt: '2026-02-05T14:00:00Z',
            },
          ],
        },
        {
          number: 2,
          title: 'Active proposal',
          phase: 'discussion',
          author: 'bot-b',
          createdAt: '2026-02-05T10:00:00Z',
          commentCount: 2,
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-05T10:00:00Z' },
          ],
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.getByText('Governance Throughput')).toBeInTheDocument();
    // Discussion: 6h, Voting: 8h, Cycle: 14h
    expect(screen.getByText('6h')).toBeInTheDocument();
    expect(screen.getByText('8h')).toBeInTheDocument();
    expect(screen.getByText('14h')).toBeInTheDocument();
    // Progress bar: 1 resolved out of 2 total
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('hides governance throughput when no resolved proposals', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'Active only',
          phase: 'discussion',
          author: 'bot',
          createdAt: '2026-02-05T09:00:00Z',
          commentCount: 1,
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-05T09:00:00Z' },
          ],
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    expect(screen.queryByText('Governance Throughput')).not.toBeInTheDocument();
  });

  it('renders throughput progress bar with accessible label', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'Resolved',
          phase: 'implemented',
          author: 'bot',
          createdAt: '2026-02-05T00:00:00Z',
          commentCount: 3,
          phaseTransitions: [
            { phase: 'discussion', enteredAt: '2026-02-05T00:00:00Z' },
            { phase: 'voting', enteredAt: '2026-02-05T04:00:00Z' },
            { phase: 'implemented', enteredAt: '2026-02-05T08:00:00Z' },
          ],
        },
      ],
    });

    render(<GovernanceAnalytics data={data} />);

    const progressBar = screen.getByRole('img', {
      name: /1 resolved, 0 active of 1 proposals/,
    });
    expect(progressBar).toBeInTheDocument();
  });
});
