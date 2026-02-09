import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActivityHeatmap } from './ActivityHeatmap';
import type { ActivityData } from '../types/activity';

function makeData(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    generatedAt: '2026-02-07T12:00:00Z',
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

// Fix "now" to a known date for deterministic tests
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-02-07T18:00:00Z'));

describe('ActivityHeatmap', () => {
  it('renders total contribution count', () => {
    const data = makeData({
      commits: [
        { sha: 'a', message: 'm', author: 'x', date: '2026-02-07T10:00:00Z' },
        { sha: 'b', message: 'n', author: 'y', date: '2026-02-06T10:00:00Z' },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent={null} />);

    expect(
      screen.getByText(/2 contributions in the last 14 days/i)
    ).toBeInTheDocument();
  });

  it('renders active days count', () => {
    const data = makeData({
      commits: [
        { sha: 'a', message: 'm', author: 'x', date: '2026-02-07T10:00:00Z' },
        { sha: 'b', message: 'n', author: 'y', date: '2026-02-06T10:00:00Z' },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent={null} />);

    expect(screen.getByText(/2 active days/i)).toBeInTheDocument();
  });

  it('renders heatmap with accessible grid role', () => {
    render(<ActivityHeatmap data={makeData()} selectedAgent={null} />);

    const heatmap = screen.getByRole('grid');
    expect(heatmap).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Activity heatmap')
    );
  });

  it('renders legend with Less and More labels', () => {
    render(<ActivityHeatmap data={makeData()} selectedAgent={null} />);

    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('shows day count inside cells with activity', () => {
    const data = makeData({
      commits: [
        { sha: 'a', message: 'm', author: 'x', date: '2026-02-07T10:00:00Z' },
        { sha: 'b', message: 'n', author: 'x', date: '2026-02-07T11:00:00Z' },
        { sha: 'c', message: 'o', author: 'x', date: '2026-02-07T12:00:00Z' },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent={null} />);

    // The cell for Feb 7 should have a tooltip indicating 3 commits
    const cell = document.querySelector('[title*="Feb 7"]');
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute('title')).toContain('3');
    expect(cell?.textContent).toBe('3');
  });

  it('filters by selected agent', () => {
    const data = makeData({
      commits: [
        {
          sha: 'a',
          message: 'm',
          author: 'builder',
          date: '2026-02-07T10:00:00Z',
        },
        {
          sha: 'b',
          message: 'n',
          author: 'worker',
          date: '2026-02-07T11:00:00Z',
        },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent="builder" />);

    expect(
      screen.getByText(/1 contribution in the last 14 days/i)
    ).toBeInTheDocument();
  });

  it('shows tooltip with breakdown on cells', () => {
    const data = makeData({
      commits: [
        { sha: 'a', message: 'm', author: 'x', date: '2026-02-05T10:00:00Z' },
      ],
      issues: [
        {
          number: 1,
          title: 't',
          state: 'open',
          labels: [],
          author: 'x',
          createdAt: '2026-02-05T11:00:00Z',
        },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent={null} />);

    const cells = document.querySelectorAll('[title*="Feb 5"]');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].getAttribute('title')).toContain('1 commit');
    expect(cells[0].getAttribute('title')).toContain('1 issue');
  });

  it('shows proposals in tooltip breakdown', () => {
    const data = makeData({
      proposals: [
        {
          number: 1,
          title: 'p',
          phase: 'discussion',
          author: 'x',
          createdAt: '2026-02-05T10:00:00Z',
          commentCount: 0,
        },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent={null} />);

    const cell = document.querySelector('[title*="Feb 5"]');
    expect(cell?.getAttribute('title')).toContain('1 proposal');
  });

  it('provides keyboard accessibility for cells', () => {
    const data = makeData({
      commits: [
        { sha: 'a', message: 'm', author: 'x', date: '2026-02-07T10:00:00Z' },
      ],
    });

    render(<ActivityHeatmap data={data} selectedAgent={null} />);

    const cell = screen.getByRole('gridcell', { name: /Feb 7: 1/i });
    expect(cell).toHaveAttribute('tabIndex', '0');
  });

  it('renders date labels at start and end', () => {
    render(<ActivityHeatmap data={makeData()} selectedAgent={null} />);

    expect(screen.getByText('Jan 25')).toBeInTheDocument();
    expect(screen.getByText('Feb 7')).toBeInTheDocument();
  });

  it('shows zero contributions when data is empty', () => {
    render(<ActivityHeatmap data={makeData()} selectedAgent={null} />);

    expect(
      screen.getByText(/0 contributions in the last 14 days/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/0 active days/i)).toBeInTheDocument();
  });
});
