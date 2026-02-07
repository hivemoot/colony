import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActivityTimeline } from './ActivityTimeline';
import type { ActivityEvent } from '../types/activity';

// Mock formatTimeAgo to return predictable values
vi.mock('../utils/time', () => ({
  formatTimeAgo: (): string => '5 minutes ago',
}));

describe('ActivityTimeline', () => {
  it('renders "No recent activity yet" when events array is empty', () => {
    render(<ActivityTimeline events={[]} />);
    expect(screen.getByText(/no recent activity yet/i)).toBeInTheDocument();
  });

  it('renders a list of activity events', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'abc123 Add tests',
        url: 'https://github.com/hivemoot/colony/commit/abc123',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
      {
        id: 'issue-2',
        type: 'issue',
        summary: 'Issue opened',
        title: '#42 Bug report',
        url: 'https://github.com/hivemoot/colony/issues/42',
        actor: 'scout',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    expect(screen.getByText('Commit pushed')).toBeInTheDocument();
    expect(screen.getByText('abc123 Add tests')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();

    expect(screen.getByText('Issue opened')).toBeInTheDocument();
    expect(screen.getByText('#42 Bug report')).toBeInTheDocument();
    expect(screen.getByText('scout')).toBeInTheDocument();
  });

  it('renders all event types with correct icons', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test commit',
        actor: 'a',
        createdAt: '2026-02-05T12:00:00Z',
      },
      {
        id: 'issue-1',
        type: 'issue',
        summary: 'Issue opened',
        title: 'Test issue',
        actor: 'b',
        createdAt: '2026-02-05T11:00:00Z',
      },
      {
        id: 'pr-1',
        type: 'pull_request',
        summary: 'PR opened',
        title: 'Test PR',
        actor: 'c',
        createdAt: '2026-02-05T10:00:00Z',
      },
      {
        id: 'merge-1',
        type: 'merge',
        summary: 'PR merged',
        title: 'Test merge',
        actor: 'd',
        createdAt: '2026-02-05T09:00:00Z',
      },
      {
        id: 'comment-1',
        type: 'comment',
        summary: 'Commented',
        title: 'Test comment',
        actor: 'e',
        createdAt: '2026-02-05T08:00:00Z',
      },
      {
        id: 'review-1',
        type: 'review',
        summary: 'Reviewed',
        title: 'Test review',
        actor: 'f',
        createdAt: '2026-02-05T07:00:00Z',
      },
      {
        id: 'proposal-1',
        type: 'proposal',
        summary: 'Phase change',
        title: 'Test proposal',
        actor: 'g',
        createdAt: '2026-02-05T06:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    // Check that event type icons are rendered
    expect(screen.getByRole('img', { name: 'Commit' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Issue' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'PR' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Merge' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Comment' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Proposal' })).toBeInTheDocument();
  });

  it('renders event with link when url is provided', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test commit',
        url: 'https://github.com/hivemoot/colony/commit/abc123',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    const link = screen.getByRole('link', { name: 'Test commit' });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/commit/abc123'
    );
    expect(link.className).toContain('motion-safe:transition-colors');
  });

  it('includes focus ring offset on event links', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test commit',
        url: 'https://github.com/hivemoot/colony/commit/abc123',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    const link = screen.getByRole('link', { name: 'Test commit' });
    expect(link.className).toContain('focus-visible:ring-offset-1');
    expect(link.className).toContain(
      'dark:focus-visible:ring-offset-neutral-800'
    );
  });

  it('renders event without link when url is not provided', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test commit without URL',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    expect(screen.getByText('Test commit without URL')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Test commit without URL' })
    ).not.toBeInTheDocument();
  });

  it('renders time ago in a semantic time element with dateTime', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    const timeEl = screen.getByText('5 minutes ago');
    expect(timeEl.tagName).toBe('TIME');
    expect(timeEl).toHaveAttribute('datetime', '2026-02-05T10:00:00Z');
  });

  it('renders actor avatars', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    const avatar = screen.getByAltText('worker');
    expect(avatar).toHaveAttribute('src', 'https://github.com/worker.png');
  });

  it('links actor names to GitHub profiles', () => {
    const events: ActivityEvent[] = [
      {
        id: 'commit-1',
        type: 'commit',
        summary: 'Commit pushed',
        title: 'Test commit',
        url: 'https://github.com/hivemoot/colony/commit/abc123',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<ActivityTimeline events={events} />);

    const actorLink = screen.getByRole('link', { name: 'worker' });
    expect(actorLink).toHaveAttribute('href', 'https://github.com/worker');
    expect(actorLink).toHaveAttribute('target', '_blank');
    expect(actorLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
