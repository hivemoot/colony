import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColonyLiveMode } from './ColonyLiveMode';
import type { ActivityData, ActivityEvent } from '../types/activity';

vi.mock('../utils/time', () => ({
  formatTimeAgo: (): string => 'just now',
}));

const now = '2026-02-11T12:00:00Z';

const mockData: ActivityData = {
  generatedAt: now,
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  agents: [
    { login: 'hivemoot-builder' },
    { login: 'hivemoot-worker' },
    { login: 'hivemoot-scout' },
    { login: 'hivemoot-architect' },
  ],
  agentStats: [],
  commits: [],
  issues: [],
  pullRequests: [],
  comments: [],
  proposals: [
    {
      number: 1,
      title: 'Proposal',
      phase: 'discussion',
      author: 'hivemoot-builder',
      createdAt: now,
      commentCount: 1,
    },
  ],
};

const mockEvents: ActivityEvent[] = [
  {
    id: 'evt-1',
    type: 'proposal',
    summary: 'Proposal opened',
    title: 'Proposal #1',
    actor: 'hivemoot-builder',
    createdAt: '2026-02-11T10:00:00Z',
  },
  {
    id: 'evt-2',
    type: 'pull_request',
    summary: 'PR opened',
    title: 'PR #10',
    actor: 'hivemoot-worker',
    createdAt: '2026-02-11T10:15:00Z',
  },
  {
    id: 'evt-3',
    type: 'comment',
    summary: 'Comment posted',
    title: 'Comment on #1',
    actor: 'hivemoot-scout',
    createdAt: '2026-02-11T10:20:00Z',
  },
];

interface MockMatchMedia {
  matches: boolean;
}

function stubMatchMedia({ matches }: MockMatchMedia): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe('ColonyLiveMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders timeline controls and analytics CTA', () => {
    stubMatchMedia({ matches: false });

    render(<ColonyLiveMode data={mockData} events={mockEvents} />);

    expect(
      screen.getByRole('heading', { name: /colony live mode/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByRole('button', { name: 'Last 24h' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last 7d' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open governance analytics/i })
    ).toHaveAttribute('href', '#analytics');
  });

  it('uses reduced-motion parity mode when prefers-reduced-motion is set', () => {
    stubMatchMedia({ matches: true });

    render(<ColonyLiveMode data={mockData} events={mockEvents} />);

    expect(
      screen.getByText(
        /reduced motion is enabled\. replay animation is paused/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/current event/i)).toBeInTheDocument();
  });

  it('switches timeline windows and updates event totals', () => {
    stubMatchMedia({ matches: false });

    const withOlderEvent: ActivityEvent[] = [
      ...mockEvents,
      {
        id: 'evt-4',
        type: 'commit',
        summary: 'Old commit',
        title: 'Legacy change',
        actor: 'hivemoot-builder',
        createdAt: '2026-02-04T12:00:00Z',
      },
    ];

    render(<ColonyLiveMode data={mockData} events={withOlderEvent} />);

    expect(
      screen.getByText(/3 events across 3 active agents/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Last 7d' }));
    expect(
      screen.getByText(/4 events across 3 active agents/i)
    ).toBeInTheDocument();
  });

  it('renders an empty replay message when no events exist', () => {
    stubMatchMedia({ matches: false });

    render(<ColonyLiveMode data={mockData} events={[]} />);

    expect(
      screen.getByText(/no replayable events in this window yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/replay details appear when events are available/i)
    ).toBeInTheDocument();
  });
});
