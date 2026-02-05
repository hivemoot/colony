import { describe, it, expect } from 'vitest';
import {
  buildStaticEvents,
  buildLiveEvents,
  formatAction,
  DEFAULT_EVENT_LIMIT,
} from './activity';
import {
  createActivityData,
  createCommit,
  createIssue,
  createPullRequest,
  createComment,
} from '../test/fixtures/activity';
import type { ActivityData } from '../types/activity';
import type { GitHubEvent } from './activity';

describe('activity utils', () => {
  describe('buildStaticEvents', () => {
    it('correctly maps commits, issues, and PRs', () => {
      const data = createActivityData({
        commits: [
          createCommit({
            sha: 'sha1',
            message: 'feat: add tests',
            author: 'scout',
          }),
        ],
        issues: [
          createIssue({
            number: 1,
            title: 'Issue 1',
            state: 'open',
            createdAt: '2026-02-05T10:00:00Z',
          }),
          createIssue({
            number: 2,
            title: 'Issue 2',
            state: 'closed',
            closedAt: '2026-02-05T09:30:00Z',
          }),
        ],
        pullRequests: [
          createPullRequest({
            number: 3,
            title: 'PR 3',
            state: 'open',
            createdAt: '2026-02-05T08:00:00Z',
          }),
          createPullRequest({
            number: 4,
            title: 'PR 4',
            state: 'merged',
            mergedAt: '2026-02-05T07:30:00Z',
          }),
        ],
        comments: [
          createComment({
            id: 1,
            issueOrPrNumber: 1,
            type: 'issue',
            author: 'scout',
            createdAt: '2026-02-05T07:00:00Z',
          }),
        ],
      });

      const events = buildStaticEvents(data);

      const commit = events.find((e) => e.type === 'commit');
      expect(commit).toMatchObject({
        summary: 'Commit pushed',
        title: 'sha1 feat: add tests',
        actor: 'scout',
      });

      const openIssue = events.find((e) => e.id === 'issue-1-open');
      expect(openIssue).toMatchObject({
        type: 'issue',
        summary: 'Issue Opened',
        title: '#1 Issue 1',
        createdAt: '2026-02-05T10:00:00Z',
      });

      const closedIssue = events.find((e) => e.id === 'issue-2-closed');
      expect(closedIssue).toMatchObject({
        type: 'issue',
        summary: 'Issue Closed',
        createdAt: '2026-02-05T09:30:00Z',
      });

      const mergedPR = events.find((e) => e.type === 'merge');
      expect(mergedPR).toMatchObject({
        summary: 'PR Merged',
        title: '#4 PR 4',
        createdAt: '2026-02-05T07:30:00Z',
      });

      const comment = events.find((e) => e.type === 'comment');
      expect(comment).toMatchObject({
        summary: 'Commented on issue',
        title: '#1',
        actor: 'scout',
      });
    });

    it('includes review and PR comment events from static data', () => {
      const data = createActivityData({
        comments: [
          createComment({
            id: 100,
            issueOrPrNumber: 1,
            type: 'issue',
            author: 'polisher',
            createdAt: '2026-02-05T10:30:00Z',
            url: 'https://github.com/hivemoot/colony/issues/1#issuecomment-100',
          }),
          createComment({
            id: 101,
            issueOrPrNumber: 3,
            type: 'review',
            author: 'builder',
            createdAt: '2026-02-05T10:45:00Z',
            url: 'https://github.com/hivemoot/colony/pull/3#pullrequestreview-101',
          }),
          createComment({
            id: 102,
            issueOrPrNumber: 3,
            type: 'pr',
            author: 'scout',
            createdAt: '2026-02-05T10:50:00Z',
            url: 'https://github.com/hivemoot/colony/pull/3#discussion_r102',
          }),
        ],
      });

      const events = buildStaticEvents(data);

      const issueComment = events.find((e) => e.id === 'comment-100');
      expect(issueComment).toMatchObject({
        type: 'comment',
        summary: 'Commented on issue',
        title: '#1',
        actor: 'polisher',
      });

      const reviewComment = events.find((e) => e.id === 'comment-101');
      expect(reviewComment).toMatchObject({
        type: 'review',
        summary: 'PR review submitted',
        title: '#3',
        actor: 'builder',
      });

      const prComment = events.find((e) => e.id === 'comment-102');
      expect(prComment).toMatchObject({
        type: 'comment',
        summary: 'Commented on PR',
        title: '#3',
        actor: 'scout',
      });
    });

    it('respects maxEvents limit', () => {
      const data = createActivityData({
        commits: [
          createCommit({ sha: '1' }),
          createCommit({ sha: '2' }),
          createCommit({ sha: '3' }),
        ],
      });
      const events = buildStaticEvents(data, 2);
      expect(events).toHaveLength(2);
    });

    it('returns events sorted by date (most recent first)', () => {
      const data = createActivityData({
        commits: [
          createCommit({ sha: '1', date: '2026-02-05T10:00:00Z' }),
          createCommit({ sha: '2', date: '2026-02-05T12:00:00Z' }),
          createCommit({ sha: '3', date: '2026-02-05T11:00:00Z' }),
        ],
      });
      const events = buildStaticEvents(data);
      expect(events[0].createdAt).toBe('2026-02-05T12:00:00Z');
      expect(events[1].createdAt).toBe('2026-02-05T11:00:00Z');
      expect(events[2].createdAt).toBe('2026-02-05T10:00:00Z');
    });

    it('handles empty data arrays gracefully', () => {
      const data = createActivityData();
      const events = buildStaticEvents(data);
      expect(events).toEqual([]);
    });

    it('handles empty comments array (older data)', () => {
      const data = createActivityData({
        commits: [createCommit({ sha: '1' })],
        comments: [],
      });
      const events = buildStaticEvents(data);
      const commentEvents = events.filter(
        (e) => e.type === 'comment' || e.type === 'review'
      );
      expect(commentEvents).toHaveLength(0);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('buildLiveEvents', () => {
    const fallbackUrl = 'https://github.com/hivemoot/colony';

    it('maps various GitHub event types and filters unknown ones', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'PushEvent',
          created_at: '2026-02-05T11:00:00Z',
          actor: { login: 'scout' },
          payload: {
            commits: [{ sha: 'sha1234567', message: 'feat: live commit' }],
          },
        },
        {
          id: '2',
          type: 'IssuesEvent',
          created_at: '2026-02-05T10:00:00Z',
          actor: { login: 'scout' },
          payload: {
            action: 'opened',
            issue: { number: 1, title: 'Live Issue', html_url: 'url1' },
          },
        },
        {
          id: '3',
          type: 'IssueCommentEvent',
          created_at: '2026-02-05T09:00:00Z',
          actor: { login: 'scout' },
          payload: {
            issue: { number: 1, title: 'Live Issue', html_url: 'url1' },
            comment: { html_url: 'comment_url' },
          },
        },
        {
          id: '4',
          type: 'UnknownEvent',
          created_at: '2026-02-05T08:00:00Z',
        } as any,
      ];

      const events = buildLiveEvents(rawEvents, fallbackUrl);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.type)).toContain('commit');
      expect(events.map((e) => e.type)).toContain('issue');
      expect(events.map((e) => e.type)).toContain('comment');
    });

    it('handles PushEvent correctly', () => {
      const event: GitHubEvent = {
        id: '1',
        type: 'PushEvent',
        created_at: '2026-02-05T11:00:00Z',
        actor: { login: 'scout' },
        payload: {
          commits: [{ sha: 'sha1234567', message: 'feat: live commit' }],
        },
      };
      const events = buildLiveEvents([event], fallbackUrl);
      expect(events[0]).toMatchObject({
        title: 'sha1234 feat: live commit',
        summary: 'Commit pushed',
      });
    });

    it('handles PullRequestEvent (opened and merged)', () => {
      const prEvents: GitHubEvent[] = [
        {
          id: '5',
          type: 'PullRequestEvent',
          created_at: '2026-02-05T07:00:00Z',
          payload: {
            action: 'opened',
            pull_request: { number: 2, title: 'Live PR', html_url: 'pr_url' },
          },
        },
        {
          id: '6',
          type: 'PullRequestEvent',
          created_at: '2026-02-05T07:30:00Z',
          payload: {
            action: 'closed',
            pull_request: {
              number: 2,
              title: 'Live PR',
              html_url: 'pr_url',
              merged: true,
            },
          },
        },
      ];
      const events = buildLiveEvents(prEvents, fallbackUrl);
      expect(events[0].type).toBe('merge');
      expect(events[0].summary).toBe('PR Merged');
      expect(events[1].type).toBe('pull_request');
      expect(events[1].summary).toBe('PR Opened');
    });

    it('handles PullRequestReviewCommentEvent and PullRequestReviewEvent', () => {
      const reviewEvents: GitHubEvent[] = [
        {
          id: '7',
          type: 'PullRequestReviewCommentEvent',
          created_at: '2026-02-05T06:00:00Z',
          payload: {
            pull_request: {
              number: 3,
              title: 'Review PR',
              html_url: 'pr_url',
            },
            comment: { html_url: 'comment_url' },
          },
        },
        {
          id: '8',
          type: 'PullRequestReviewEvent',
          created_at: '2026-02-05T06:30:00Z',
          payload: {
            pull_request: {
              number: 3,
              title: 'Review PR',
              html_url: 'pr_url',
            },
            review: { state: 'approved' },
          },
        },
      ];
      const events = buildLiveEvents(reviewEvents, fallbackUrl);
      expect(events[0].type).toBe('review');
      expect(events[0].summary).toBe('PR review Approved');
      expect(events[1].type).toBe('comment');
      expect(events[1].summary).toBe('Commented on PR');
    });

    describe('edge cases and null guards', () => {
      it('PushEvent with empty commits array returns null (filtered)', () => {
        const event: GitHubEvent = {
          id: '9',
          type: 'PushEvent',
          created_at: '2026-02-05T05:00:00Z',
          payload: { commits: [] },
        };
        const events = buildLiveEvents([event], fallbackUrl);
        expect(events).toHaveLength(0);
      });

      it('IssueCommentEvent with missing comment URL falls back to issue URL', () => {
        const event: GitHubEvent = {
          id: '10',
          type: 'IssueCommentEvent',
          created_at: '2026-02-05T04:00:00Z',
          payload: {
            issue: { number: 1, title: 'Issue', html_url: 'issue_url' },
            // comment missing
          },
        };
        const events = buildLiveEvents([event], fallbackUrl);
        expect(events[0].url).toBe('issue_url');
      });

      it('PullRequestReviewEvent with undefined review state falls back to "updated"', () => {
        const event: GitHubEvent = {
          id: '11',
          type: 'PullRequestReviewEvent',
          created_at: '2026-02-05T03:00:00Z',
          payload: {
            pull_request: { number: 4, title: 'PR', html_url: 'pr_url' },
            // review state missing
          },
        };
        const events = buildLiveEvents([event], fallbackUrl);
        expect(events[0].summary).toBe('PR review updated');
      });

      it('handles missing repo and actor gracefully', () => {
        const event: GitHubEvent = {
          id: '12',
          type: 'IssuesEvent',
          created_at: '2026-02-05T02:00:00Z',
          payload: {
            action: 'opened',
            issue: { number: 5, title: 'No Repo', html_url: 'url' },
          },
        };
        const events = buildLiveEvents([event], fallbackUrl);
        expect(events[0].actor).toBe('unknown');
        expect(events[0].url).toBe('url'); // uses issue URL from payload
      });
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
    });
  });
});
