import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColonyStory } from './ColonyStory';
import type { ActivityData } from '../types/activity';

const baseData: ActivityData = {
  generatedAt: '2026-02-07T00:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 10,
    forks: 2,
    openIssues: 5,
  },
  agents: [
    { login: 'builder' },
    { login: 'worker' },
    { login: 'scout' },
    { login: 'polisher' },
  ],
  agentStats: [],
  commits: [
    { sha: 'abc', message: 'init', author: 'builder', date: '2026-02-01' },
    { sha: 'def', message: 'feat', author: 'worker', date: '2026-02-02' },
  ],
  issues: [],
  pullRequests: [
    {
      number: 1,
      title: 'feat(web): add dashboard',
      state: 'merged',
      author: 'builder',
      createdAt: '2026-02-02',
    },
    {
      number: 2,
      title: 'polish(web): fix colors',
      state: 'merged',
      author: 'polisher',
      createdAt: '2026-02-05',
    },
    {
      number: 3,
      title: 'a11y(web): add focus rings',
      state: 'merged',
      author: 'polisher',
      createdAt: '2026-02-05',
    },
  ],
  comments: [],
  proposals: [
    {
      number: 10,
      title: 'Proposal: Build dashboard',
      phase: 'implemented',
      author: 'builder',
      createdAt: '2026-02-02',
      commentCount: 5,
    },
    {
      number: 11,
      title: 'Proposal: Dark mode',
      phase: 'inconclusive',
      author: 'scout',
      createdAt: '2026-02-04',
      commentCount: 3,
    },
  ],
};

describe('ColonyStory', () => {
  it('renders all milestone titles', () => {
    render(<ColonyStory data={baseData} />);

    expect(screen.getByText('Genesis')).toBeInTheDocument();
    expect(screen.getByText('The First Proposals')).toBeInTheDocument();
    expect(screen.getByText('Bootstrap')).toBeInTheDocument();
    expect(screen.getByText('Building Sprint')).toBeInTheDocument();
    expect(screen.getByText('First Deploy')).toBeInTheDocument();
    expect(screen.getByText('The Polish Plateau')).toBeInTheDocument();
    expect(screen.getByText('Course Correction')).toBeInTheDocument();
    expect(screen.getByText('Horizon 2 Begins')).toBeInTheDocument();
  });

  it('renders the introductory description', () => {
    render(<ColonyStory data={baseData} />);

    expect(
      screen.getByText(/4 autonomous agents built a governance dashboard/)
    ).toBeInTheDocument();
  });

  it('renders milestone descriptions', () => {
    render(<ColonyStory data={baseData} />);

    expect(
      screen.getByText(/Let the bees decide what to build/)
    ).toBeInTheDocument();
  });

  it('renders formatted dates', () => {
    render(<ColonyStory data={baseData} />);

    const timeElements = document.querySelectorAll('time');
    expect(timeElements.length).toBeGreaterThanOrEqual(8);
    expect(timeElements[0]).toHaveAttribute('dateTime', '2026-02-01');
  });

  it('renders milestone stats when present', () => {
    render(<ColonyStory data={baseData} />);

    expect(screen.getByText(/4 agents/)).toBeInTheDocument();
    expect(screen.getByText(/2 total commits/)).toBeInTheDocument();
  });

  it('renders as an ordered list for semantic structure', () => {
    const { container } = render(<ColonyStory data={baseData} />);

    const ol = container.querySelector('ol');
    expect(ol).toBeInTheDocument();

    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(8);
  });

  it('renders milestone dates in UTC regardless of local timezone', () => {
    render(<ColonyStory data={baseData} />);

    // The first milestone uses date '2026-02-01' — should always render as "Feb 1"
    // regardless of the viewer's timezone. Without UTC handling, users in
    // timezones east of UTC would see "Jan 31".
    const timeElements = document.querySelectorAll('time');
    expect(timeElements[0].textContent).toBe('Feb 1');
  });
});
