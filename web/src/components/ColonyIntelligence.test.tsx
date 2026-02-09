import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ColonyIntelligence } from './ColonyIntelligence';
import type { ActivityData, Proposal, PullRequest } from '../types/activity';

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

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 100,
    title: 'Test PR',
    state: 'open',
    author: 'agent-a',
    createdAt: '2026-02-05T09:00:00Z',
    ...overrides,
  };
}

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-07T10:00:00Z',
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

describe('ColonyIntelligence', () => {
  it('renders all-clear message when there are no bottlenecks', () => {
    const data = makeData();
    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );
    expect(
      screen.getByText(/governance is flowing smoothly/)
    ).toBeInTheDocument();
  });

  it('renders unclaimed work bottleneck card', () => {
    const data = makeData({
      proposals: [
        makeProposal({
          number: 10,
          title: 'Feature X',
          phase: 'ready-to-implement',
        }),
      ],
    });

    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );

    expect(screen.getByText('Unclaimed Work')).toBeInTheDocument();
    // Issue number appears in both bottleneck card and suggested actions
    expect(screen.getAllByText('#10').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Feature X')).toBeInTheDocument();
  });

  it('renders competing implementations bottleneck card', () => {
    const data = makeData({
      proposals: [
        makeProposal({
          number: 40,
          title: 'Feature Z',
          phase: 'ready-to-implement',
        }),
      ],
      pullRequests: [
        makePR({
          number: 60,
          title: 'feat: approach A (Fixes #40)',
          state: 'open',
        }),
        makePR({
          number: 61,
          title: 'feat: approach B (Closes #40)',
          state: 'open',
        }),
      ],
    });

    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );

    expect(screen.getByText('Competing Implementations')).toBeInTheDocument();
    expect(screen.getAllByText('#40').length).toBeGreaterThanOrEqual(1);
  });

  it('renders stalled discussion bottleneck card', () => {
    const staleDate = new Date('2026-02-05T10:00:00Z');
    const data = makeData({
      generatedAt: '2026-02-07T10:00:00Z',
      proposals: [
        makeProposal({
          number: 20,
          title: 'Stale proposal',
          phase: 'discussion',
          createdAt: staleDate.toISOString(),
        }),
      ],
      comments: [
        {
          id: 1,
          issueOrPrNumber: 20,
          type: 'proposal',
          author: 'agent-a',
          body: 'Old comment',
          createdAt: staleDate.toISOString(),
          url: 'https://github.com/hivemoot/colony/issues/20#issuecomment-1',
        },
      ],
    });

    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );

    expect(screen.getByText('Stalled Discussions')).toBeInTheDocument();
    expect(screen.getAllByText('#20').length).toBeGreaterThanOrEqual(1);
  });

  it('renders attention item count summary', () => {
    const data = makeData({
      proposals: [
        makeProposal({ number: 10, phase: 'ready-to-implement' }),
        makeProposal({ number: 11, phase: 'ready-to-implement' }),
      ],
    });

    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );

    expect(screen.getByText(/2 attention items/)).toBeInTheDocument();
  });

  it('renders suggested actions section', () => {
    const data = makeData({
      proposals: [
        makeProposal({
          number: 10,
          title: 'Feature X',
          phase: 'ready-to-implement',
        }),
      ],
    });

    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );

    expect(screen.getByText('Suggested Actions')).toBeInTheDocument();
    // There are multiple lists (bottleneck cards + actions), so find by explicit role
    const allLists = screen.getAllByRole('list');
    expect(allLists.length).toBeGreaterThan(0);
    // At least one list should have action items
    const totalItems = allLists.reduce(
      (sum, list) => sum + within(list).queryAllByRole('listitem').length,
      0
    );
    expect(totalItems).toBeGreaterThan(0);
  });

  it('links issue numbers to the repo URL', () => {
    const data = makeData({
      proposals: [
        makeProposal({
          number: 42,
          title: 'Feature Y',
          phase: 'ready-to-implement',
        }),
      ],
    });

    render(
      <ColonyIntelligence
        data={data}
        repoUrl="https://github.com/hivemoot/colony"
      />
    );

    const links = screen.getAllByRole('link', { name: '#42' });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/42'
    );
  });
});
