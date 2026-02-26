import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GovernanceAssessment } from './GovernanceAssessment';
import type { ActivityData, AgentStats, Proposal } from '../types/activity';
import type { GovernanceSnapshot } from '../../shared/governance-snapshot';

function makeAgentStats(overrides: Partial<AgentStats> = {}): AgentStats {
  return {
    login: 'agent-a',
    commits: 5,
    pullRequestsMerged: 3,
    issuesOpened: 2,
    reviews: 5,
    comments: 10,
    lastActiveAt: '2026-02-10T12:00:00Z',
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

function makeActivityData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-10T12:00:00Z',
    repository: {
      owner: 'hivemoot',
      name: 'colony',
      url: 'https://github.com/hivemoot/colony',
      stars: 10,
      forks: 2,
      openIssues: 5,
    },
    agents: [],
    agentStats: [
      makeAgentStats({ login: 'agent-a', reviews: 5, comments: 10 }),
      makeAgentStats({ login: 'agent-b', reviews: 5, comments: 8 }),
      makeAgentStats({ login: 'agent-c', reviews: 4, comments: 6 }),
      makeAgentStats({ login: 'agent-d', reviews: 3, comments: 5 }),
    ],
    commits: [],
    issues: [],
    pullRequests: [],
    comments: [],
    proposals: [
      makeProposal({ number: 1, phase: 'implemented', commentCount: 5 }),
      makeProposal({ number: 2, phase: 'implemented', commentCount: 4 }),
      makeProposal({ number: 3, phase: 'voting', commentCount: 3 }),
    ],
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<GovernanceSnapshot> = {}
): GovernanceSnapshot {
  return {
    timestamp: '2026-02-10T12:00:00Z',
    healthScore: 65,
    participation: 18,
    pipelineFlow: 15,
    followThrough: 17,
    consensusQuality: 15,
    activeProposals: 5,
    totalProposals: 20,
    activeAgents: 4,
    proposalVelocity: 1.5,
    ...overrides,
  };
}

describe('GovernanceAssessment', () => {
  it('renders healthy status when no alerts or patterns', () => {
    const data = makeActivityData();
    render(<GovernanceAssessment data={data} history={[]} />);
    expect(
      screen.getByText(/no governance alerts or patterns detected/i)
    ).toBeDefined();
  });

  it('renders alerts when health is declining', () => {
    const data = makeActivityData();
    const history = [
      makeSnapshot({ timestamp: '2026-02-07T00:00:00Z', healthScore: 70 }),
      makeSnapshot({ timestamp: '2026-02-08T00:00:00Z', healthScore: 65 }),
      makeSnapshot({ timestamp: '2026-02-09T00:00:00Z', healthScore: 60 }),
      makeSnapshot({ timestamp: '2026-02-10T00:00:00Z', healthScore: 55 }),
    ];
    render(<GovernanceAssessment data={data} history={history} />);
    expect(screen.getByText('Health score declining')).toBeDefined();
  });

  it('renders merge queue alert with many open PRs', () => {
    const openPRs = Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-02-09T00:00:00Z',
    }));
    const data = makeActivityData({ pullRequests: openPRs });
    render(<GovernanceAssessment data={data} history={[]} />);
    expect(screen.getByText('Merge queue bottleneck')).toBeDefined();
  });

  it('renders 7-day trend when history is available', () => {
    const history = [
      makeSnapshot({
        timestamp: '2026-02-03T00:00:00Z',
        healthScore: 60,
        participation: 15,
      }),
      makeSnapshot({
        timestamp: '2026-02-10T00:00:00Z',
        healthScore: 70,
        participation: 20,
      }),
    ];
    // Need to trigger at least one alert or pattern for the section to render
    const openPRs = Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-02-09T00:00:00Z',
    }));
    const data = makeActivityData({ pullRequests: openPRs });
    render(<GovernanceAssessment data={data} history={history} />);
    expect(screen.getByText('7-Day Trend')).toBeDefined();
    expect(screen.getByText('+10')).toBeDefined(); // health delta
  });

  it('renders insufficient history message', () => {
    const openPRs = Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-02-09T00:00:00Z',
    }));
    const data = makeActivityData({ pullRequests: openPRs });
    render(<GovernanceAssessment data={data} history={[]} />);
    expect(
      screen.getByText(/insufficient history for trend analysis/i)
    ).toBeDefined();
  });

  it('renders pattern detection results', () => {
    const proposals = [
      makeProposal({ phase: 'implemented', commentCount: 1 }),
      makeProposal({ phase: 'implemented', commentCount: 1 }),
      makeProposal({ phase: 'implemented', commentCount: 1 }),
      makeProposal({ phase: 'implemented', commentCount: 0 }),
    ];
    const data = makeActivityData({ proposals });
    render(<GovernanceAssessment data={data} history={[]} />);
    expect(screen.getByText('Rubber-stamping risk')).toBeDefined();
  });

  it('renders recommendations section', () => {
    const openPRs = Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-02-09T00:00:00Z',
    }));
    const data = makeActivityData({ pullRequests: openPRs });
    render(<GovernanceAssessment data={data} history={[]} />);
    expect(screen.getByText('Recommendations')).toBeDefined();
  });

  it('has proper ARIA attributes', () => {
    const openPRs = Array.from({ length: 15 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      state: 'open' as const,
      author: 'agent-a',
      createdAt: '2026-02-09T00:00:00Z',
    }));
    const data = makeActivityData({ pullRequests: openPRs });
    render(<GovernanceAssessment data={data} history={[]} />);
    expect(
      screen.getByRole('region', { name: /governance assessment/i })
    ).toBeDefined();
    expect(
      screen.getByRole('list', { name: /governance alerts/i })
    ).toBeDefined();
  });
});
