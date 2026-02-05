import { describe, it, expect } from 'vitest';
import { buildStaticEvents, buildLiveEvents } from './activity';
import type { ActivityData } from '../types/activity';

const mockActivityData: ActivityData = {
  generatedAt: '2026-02-05T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 42,
    forks: 8,
    openIssues: 5,
  },
  agents: [],
  agentStats: [],
  commits: [
    {
      sha: 'abc1234',
      message: 'feat: add tests',
      author: 'worker',
      date: '2026-02-05T10:00:00Z',
    },
  ],
  issues: [
    {
      number: 1,
      title: 'Bug report',
      state: 'open',
      labels: [],
      author: 'scout',
      createdAt: '2026-02-05T09:00:00Z',
    },
    {
      number: 2,
      title: 'Closed issue',
      state: 'closed',
      labels: [],
      author: 'scout',
      createdAt: '2026-02-05T08:00:00Z',
      closedAt: '2026-02-05T11:00:00Z',
    },
  ],
  pullRequests: [
    {
      number: 3,
      title: 'New feature',
      state: 'open',
      author: 'worker',
      createdAt: '2026-02-05T07:00:00Z',
    },
    {
      number: 4,
      title: 'Merged PR',
      state: 'merged',
      author: 'worker',
      createdAt: '2026-02-05T06:00:00Z',
      mergedAt: '2026-02-05T12:00:00Z',
    },
  ],
  comments: [],
  proposals: [],
};

describe('activity utils', () => {
  describe('buildStaticEvents', () => {
    it('correctly maps all event types', () => {
      const events = buildStaticEvents(mockActivityData);

      const commit = events.find((e) => e.type === 'commit');
      expect(commit).toMatchObject({
        id: 'commit-abc1234',
        summary: 'Commit pushed',
        title: 'abc1234 feat: add tests',
        url: 'https://github.com/hivemoot/colony/commit/abc1234',
        actor: 'worker',
        createdAt: '2026-02-05T10:00:00Z',
      });

      const openIssue = events.find((e) => e.id === 'issue-1-open');
      expect(openIssue).toMatchObject({
        type: 'issue',
        summary: 'Issue opened',
        createdAt: '2026-02-05T09:00:00Z',
      });

      const closedIssue = events.find((e) => e.id === 'issue-2-closed');
      expect(closedIssue).toMatchObject({
        type: 'issue',
        summary: 'Issue closed',
        createdAt: '2026-02-05T11:00:00Z', // uses closedAt
      });

      const openPR = events.find((e) => e.id === 'pr-3-open');
      expect(openPR).toMatchObject({
        type: 'pull_request',
        summary: 'PR opened',
        createdAt: '2026-02-05T07:00:00Z',
      });

      const mergedPR = events.find((e) => e.id === 'pr-4-merged');
      expect(mergedPR).toMatchObject({
        type: 'merge',
        summary: 'PR merged',
        createdAt: '2026-02-05T12:00:00Z', // uses mergedAt
      });
    });

    it('returns events sorted by date (most recent first)', () => {
      const events = buildStaticEvents(mockActivityData);
      const dates = events.map((e) => new Date(e.createdAt).getTime());
      const sortedDates = [...dates].sort((a, b) => b - a);
      expect(dates).toEqual(sortedDates);
      expect(events[0].summary).toBe('PR merged'); // 12:00:00
    });

    it('respects maxEvents limit', () => {
      const events = buildStaticEvents(mockActivityData, 2);
      expect(events).toHaveLength(2);
    });

    it('handles empty data gracefully', () => {
      const emptyData: ActivityData = {
        ...mockActivityData,
        commits: [],
        issues: [],
        pullRequests: [],
      };
      const events = buildStaticEvents(emptyData);
      expect(events).toEqual([]);
    });
  });

  describe('buildLiveEvents', () => {
    const fallbackUrl = 'https://github.com/hivemoot/colony';

    it('maps PushEvent correctly', () => {
      const raw = [
        {
          id: '1',
          type: 'PushEvent',
          actor: { login: 'worker' },
          created_at: '2026-02-05T12:00:00Z',
          payload: {
            commits: [{ sha: 'def5678', message: 'fix: something' }],
          },
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events[0]).toMatchObject({
        type: 'commit',
        title: 'def5678 fix: something',
        actor: 'worker',
      });
    });

    it('maps IssuesEvent correctly', () => {
      const raw = [
        {
          id: '2',
          type: 'IssuesEvent',
          actor: { login: 'scout' },
          created_at: '2026-02-05T12:00:00Z',
          payload: {
            action: 'opened',
            issue: { number: 5, title: 'I haz bug', html_url: 'url' },
          },
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events[0]).toMatchObject({
        type: 'issue',
        summary: 'Issue Opened',
        title: '#5 I haz bug',
      });
    });

    it('maps IssueCommentEvent correctly', () => {
      const raw = [
        {
          id: '3',
          type: 'IssueCommentEvent',
          actor: { login: 'polisher' },
          created_at: '2026-02-05T12:00:00Z',
          payload: {
            issue: { number: 5, title: 'I haz bug', html_url: 'url' },
            comment: { html_url: 'comment-url' },
          },
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events[0]).toMatchObject({
        type: 'comment',
        summary: 'Commented on issue',
        url: 'comment-url',
      });
    });

    it('maps PullRequestEvent correctly (opened)', () => {
      const raw = [
        {
          id: '4',
          type: 'PullRequestEvent',
          actor: { login: 'worker' },
          created_at: '2026-02-05T12:00:00Z',
          payload: {
            action: 'opened',
            pull_request: { number: 6, title: 'New PR', html_url: 'pr-url' },
          },
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events[0]).toMatchObject({
        type: 'pull_request',
        summary: 'PR Opened',
      });
    });

    it('maps PullRequestEvent correctly (merged)', () => {
      const raw = [
        {
          id: '5',
          type: 'PullRequestEvent',
          actor: { login: 'worker' },
          created_at: '2026-02-05T12:00:00Z',
          payload: {
            action: 'closed',
            pull_request: {
              number: 6,
              title: 'New PR',
              html_url: 'pr-url',
              merged: true,
            },
          },
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events[0]).toMatchObject({
        type: 'merge',
        summary: 'PR merged',
      });
    });

    it('filters out unknown event types', () => {
      const raw = [
        {
          id: '6',
          type: 'WatchEvent',
          actor: { login: 'someone' },
          created_at: '2026-02-05T12:00:00Z',
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events).toHaveLength(0);
    });

    it('handles missing payload data gracefully', () => {
      const raw = [
        {
          id: '7',
          type: 'PushEvent',
          created_at: '2026-02-05T12:00:00Z',
          payload: {},
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl);
      expect(events).toHaveLength(0);
    });

    it('respects maxEvents limit', () => {
      const raw = [
        {
          id: '1',
          type: 'IssuesEvent',
          created_at: '2026-02-05T12:00:00Z',
          payload: { issue: { number: 1 }, action: 'opened' },
        },
        {
          id: '2',
          type: 'IssuesEvent',
          created_at: '2026-02-05T11:00:00Z',
          payload: { issue: { number: 2 }, action: 'opened' },
        },
      ];
      const events = buildLiveEvents(raw, fallbackUrl, 1);
      expect(events).toHaveLength(1);
    });
  });
});
