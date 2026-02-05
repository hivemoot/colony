import { describe, it, expect } from 'vitest';
import {
  buildStaticEvents,
  buildLiveEvents,
  formatAction,
} from './activity';
import type { GitHubEvent } from './activity';
import type { ActivityData } from '../types/activity';
import {
  createActivityData,
  createCommit,
  createIssue,
  createPullRequest,
  createComment,
} from '../test/fixtures/activity';

describe('activity utils', () => {
  describe('buildStaticEvents', () => {
    it('correctly maps commits to events', () => {
      const data = createActivityData({
        commits: [createCommit({ sha: 'abc1234', message: 'feat: test commit' })],
        issues: [],
        pullRequests: [],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'commit',
        title: 'abc1234 feat: test commit',
        actor: 'hivemoot-builder',
      });
    });

    it('correctly maps issues to events', () => {
      const data = createActivityData({
        commits: [],
        issues: [createIssue({ number: 1, title: 'Test issue', state: 'open' })],
        pullRequests: [],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events[0]).toMatchObject({
        type: 'issue',
        summary: 'Issue opened',
        title: '#1 Test issue',
      });
    });

    it('uses closedAt for closed issues', () => {
      const data = createActivityData({
        commits: [],
        issues: [
          createIssue({
            number: 1,
            state: 'closed',
            createdAt: '2026-02-04T08:00:00Z',
            closedAt: '2026-02-04T09:00:00Z',
          }),
        ],
        pullRequests: [],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events[0].createdAt).toBe('2026-02-04T09:00:00Z');
    });

    it('correctly maps pull requests to events', () => {
      const data = createActivityData({
        commits: [],
        issues: [],
        pullRequests: [
          createPullRequest({ number: 2, title: 'Test PR', state: 'merged' }),
        ],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events[0]).toMatchObject({
        type: 'merge',
        summary: 'PR merged',
        title: '#2 Test PR',
      });
    });

    it('correctly maps comments to events', () => {
      const data = createActivityData({
        commits: [],
        issues: [],
        pullRequests: [],
        comments: [
          createComment({
            issueOrPrNumber: 1,
            type: 'issue',
            body: 'Interesting',
          }),
        ],
      });
      const events = buildStaticEvents(data);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'comment',
        summary: 'Commented on issue',
      });
    });

    it('correctly identifies draft pull requests', () => {
      const data = createActivityData({
        commits: [],
        issues: [],
        pullRequests: [
          createPullRequest({
            number: 3,
            title: 'Draft PR',
            draft: true,
          }),
        ],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events[0]).toMatchObject({
        type: 'pull_request',
        title: '#3 Draft PR',
      });
    });

    it('sorts events by date descending', () => {
      const data = createActivityData({
        commits: [createCommit({ sha: 'old', date: '2026-02-01T00:00:00Z' })],
        issues: [createIssue({ title: 'new', createdAt: '2026-02-04T00:00:00Z' })],
        pullRequests: [],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events[0].title).toContain('new');
      expect(events[1].title).toContain('old');
    });

    it('respects maxEvents limit', () => {
      const data = createActivityData({
        commits: Array(10)
          .fill(0)
          .map((_, i) => createCommit({ sha: `sha-${i}`, date: `2026-02-01T00:00:0${i}Z` })),
        issues: [],
        pullRequests: [],
        comments: [],
      });
      const events = buildStaticEvents(data, 5);
      expect(events).toHaveLength(5);
    });

    it('handles empty data gracefully', () => {
      const data = createActivityData({
        commits: [],
        issues: [],
        pullRequests: [],
        comments: [],
      });
      const events = buildStaticEvents(data);
      expect(events).toHaveLength(0);
    });
  });

  describe('buildLiveEvents', () => {
    const repoUrl = 'https://github.com/hivemoot/colony';

    it('maps PushEvent correctly', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'PushEvent',
          actor: { login: 'agent-1' },
          created_at: '2026-02-04T11:00:00Z',
          payload: {
            commits: [{ sha: 'abc1234567', message: 'test push' }],
          },
        },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events[0]).toMatchObject({
        type: 'commit',
        title: 'abc1234 test push',
        actor: 'agent-1',
      });
    });

    it('maps IssuesEvent correctly', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'IssuesEvent',
          actor: { login: 'agent-1' },
          created_at: '2026-02-04T11:00:00Z',
          payload: {
            action: 'opened',
            issue: { number: 1, title: 'Bug', html_url: `${repoUrl}/issues/1` },
          },
        },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events[0]).toMatchObject({
        type: 'issue',
        summary: 'Issue Opened',
        title: '#1 Bug',
      });
    });

    it('maps IssueCommentEvent correctly', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'IssueCommentEvent',
          actor: { login: 'agent-1' },
          created_at: '2026-02-04T11:00:00Z',
          payload: {
            issue: { number: 1, title: 'Bug', html_url: `${repoUrl}/issues/1` },
            comment: { html_url: `${repoUrl}/issues/1#comment-1` },
          },
        },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events[0]).toMatchObject({
        type: 'comment',
        summary: 'Commented on issue',
        title: '#1 Bug',
        url: `${repoUrl}/issues/1#comment-1`,
      });
    });

    it('maps PullRequestEvent correctly', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'PullRequestEvent',
          actor: { login: 'agent-1' },
          created_at: '2026-02-04T11:00:00Z',
          payload: {
            action: 'closed',
            pull_request: {
              number: 2,
              title: 'Fix',
              html_url: `${repoUrl}/pull/2`,
              merged: true,
            },
          },
        },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events[0]).toMatchObject({
        type: 'merge',
        summary: 'PR merged',
      });
    });

    it('filters out unknown event types', () => {
      const rawEvents: GitHubEvent[] = [
        { id: '1', type: 'WatchEvent', created_at: '2026-02-04T11:00:00Z' },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events).toHaveLength(0);
    });

    it('handles missing payload data gracefully', () => {
      const rawEvents: GitHubEvent[] = [
        { id: '1', type: 'PushEvent', created_at: '2026-02-04T11:00:00Z', payload: {} },
        { id: '2', type: 'IssuesEvent', created_at: '2026-02-04T11:00:00Z', payload: {} },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events).toHaveLength(0);
    });

    it('handles PushEvent with empty commits array', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'PushEvent',
          created_at: '2026-02-04T11:00:00Z',
          payload: { commits: [] },
        },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events).toHaveLength(0);
    });

    it('handles IssueCommentEvent with missing comment URL', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'IssueCommentEvent',
          created_at: '2026-02-04T11:00:00Z',
          payload: {
            issue: { number: 1, title: 'Bug', html_url: `${repoUrl}/issues/1` },
          },
        },
      ];
      const events = buildLiveEvents(rawEvents, repoUrl);
      expect(events[0].url).toBe(`${repoUrl}/issues/1`);
    });
  });

  describe('formatAction', () => {
    it('formats standard actions', () => {
      expect(formatAction('opened')).toBe('Opened');
      expect(formatAction('closed')).toBe('Closed');
      expect(formatAction('merged')).toBe('Merged');
    });

    it('replaces underscores with spaces', () => {
      expect(formatAction('ready_for_review')).toBe('Ready for review');
    });

    it('returns "updated" as fallback for undefined action', () => {
      expect(formatAction(undefined)).toBe('updated');
      expect(formatAction('')).toBe('updated');
    });
  });
});