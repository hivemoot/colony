import { describe, it, expect } from 'vitest';
import { buildStaticEvents, buildLiveEvents, GitHubEvent } from './activity';
import type { ActivityData } from '../types/activity';

const mockBaseData: ActivityData = {
  generatedAt: '2026-02-04T12:00:00Z',
  repository: {
    owner: 'hivemoot',
    name: 'colony',
    url: 'https://github.com/hivemoot/colony',
    stars: 0,
    forks: 0,
    openIssues: 0,
  },
  agents: [],
  commits: [],
  issues: [],
  pullRequests: [],
  proposals: [],
  comments: [],
};

describe('activity utils', () => {
  describe('buildStaticEvents', () => {
    it('correctly maps commits to events', () => {
      const data: ActivityData = {
        ...mockBaseData,
        commits: [
          {
            sha: 'abc1234',
            message: 'feat: test commit',
            author: 'agent-1',
            date: '2026-02-04T10:00:00Z',
          },
        ],
      };
      const events = buildStaticEvents(data);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'commit',
        title: 'abc1234 feat: test commit',
        actor: 'agent-1',
      });
    });

    it('correctly maps issues to events', () => {
      const data: ActivityData = {
        ...mockBaseData,
        issues: [
          {
            number: 1,
            title: 'Test issue',
            state: 'open',
            labels: [],
            createdAt: '2026-02-04T09:00:00Z',
          },
        ],
      };
      const events = buildStaticEvents(data);
      expect(events[0]).toMatchObject({
        type: 'issue',
        summary: 'Issue opened',
        title: '#1 Test issue',
      });
    });

    it('correctly maps pull requests to events', () => {
      const data: ActivityData = {
        ...mockBaseData,
        pullRequests: [
          {
            number: 2,
            title: 'Test PR',
            state: 'merged',
            author: 'agent-2',
            createdAt: '2026-02-04T08:00:00Z',
          },
        ],
      };
      const events = buildStaticEvents(data);
      expect(events[0]).toMatchObject({
        type: 'merge',
        summary: 'PR merged',
        title: '#2 Test PR',
      });
    });

    it('sorts events by date descending', () => {
      const data: ActivityData = {
        ...mockBaseData,
        commits: [
          {
            sha: 'old',
            message: 'old',
            author: 'a',
            date: '2026-02-01T00:00:00Z',
          },
        ],
        issues: [
          {
            number: 1,
            title: 'new',
            state: 'open',
            labels: [],
            createdAt: '2026-02-04T00:00:00Z',
          },
        ],
      };
      const events = buildStaticEvents(data);
      expect(events[0].title).toContain('new');
      expect(events[1].title).toContain('old');
    });

    it('respects maxEvents limit', () => {
      const data: ActivityData = {
        ...mockBaseData,
        commits: Array(10)
          .fill(0)
          .map((_, i) => ({
            sha: `sha-${i}`,
            message: `msg-${i}`,
            author: 'a',
            date: `2026-02-01T00:00:0${i}Z`,
          })),
      };
      const events = buildStaticEvents(data, 5);
      expect(events).toHaveLength(5);
    });
  });

  describe('buildLiveEvents', () => {
    it('maps GitHub PushEvent correctly', () => {
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
      const events = buildLiveEvents(rawEvents, 'https://github.com/repo');
      expect(events[0]).toMatchObject({
        type: 'commit',
        title: 'abc1234 test push',
        actor: 'agent-1',
      });
    });

    it('filters out unknown event types', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'WatchEvent',
          created_at: '2026-02-04T11:00:00Z',
        },
      ];
      const events = buildLiveEvents(rawEvents, 'https://github.com/repo');
      expect(events).toHaveLength(0);
    });

    it('handles missing payload data gracefully', () => {
      const rawEvents: GitHubEvent[] = [
        {
          id: '1',
          type: 'PushEvent',
          created_at: '2026-02-04T11:00:00Z',
          payload: {},
        },
      ];
      const events = buildLiveEvents(rawEvents, 'https://github.com/repo');
      expect(events).toHaveLength(0);
    });
  });
});
