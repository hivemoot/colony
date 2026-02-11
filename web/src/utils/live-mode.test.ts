import { describe, it, expect } from 'vitest';
import type { ActivityEvent } from '../types/activity';
import { buildLiveModeScene, selectLiveModeEvents } from './live-mode';

const NOW = new Date('2026-02-11T12:00:00Z');

function makeEvent(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: 'evt-1',
    type: 'commit',
    summary: 'Commit pushed',
    title: 'Test event',
    actor: 'hivemoot-worker',
    createdAt: '2026-02-11T11:00:00Z',
    ...overrides,
  };
}

describe('selectLiveModeEvents', () => {
  it('uses a short rolling window for Live mode and falls back to latest events', () => {
    const events: ActivityEvent[] = [
      makeEvent({
        id: 'old-a',
        createdAt: '2026-02-11T08:00:00Z',
        actor: 'a',
      }),
      makeEvent({
        id: 'old-b',
        createdAt: '2026-02-11T08:30:00Z',
        actor: 'b',
      }),
      makeEvent({
        id: 'recent-a',
        createdAt: '2026-02-11T11:30:00Z',
        actor: 'a',
      }),
      makeEvent({
        id: 'recent-c',
        createdAt: '2026-02-11T11:55:00Z',
        actor: 'c',
      }),
    ];

    const selected = selectLiveModeEvents(events, 'live', NOW);
    expect(selected.map((event) => event.id)).toEqual(['recent-a', 'recent-c']);
  });

  it('filters events to the last 24h and 7d windows', () => {
    const events: ActivityEvent[] = [
      makeEvent({
        id: 'within-24h',
        createdAt: '2026-02-11T02:00:00Z',
      }),
      makeEvent({
        id: 'within-7d',
        createdAt: '2026-02-06T12:00:00Z',
      }),
      makeEvent({
        id: 'outside-7d',
        createdAt: '2026-02-01T12:00:00Z',
      }),
    ];

    expect(
      selectLiveModeEvents(events, '24h', NOW).map((event) => event.id)
    ).toEqual(['within-24h']);
    expect(
      selectLiveModeEvents(events, '7d', NOW).map((event) => event.id)
    ).toEqual(['within-7d', 'within-24h']);
  });

  it('caps non-live windows to deterministic recent event limits', () => {
    const dayEvents: ActivityEvent[] = Array.from({ length: 100 }, (_, index) =>
      makeEvent({
        id: `day-${index}`,
        actor: `agent-${index % 5}`,
        createdAt: new Date(
          NOW.getTime() - (100 - index) * 10 * 60 * 1000
        ).toISOString(),
      })
    );
    const weekEvents: ActivityEvent[] = Array.from(
      { length: 150 },
      (_, index) =>
        makeEvent({
          id: `week-${index}`,
          actor: `agent-${index % 5}`,
          createdAt: new Date(
            NOW.getTime() - (150 - index) * 60 * 60 * 1000
          ).toISOString(),
        })
    );

    const daySelection = selectLiveModeEvents(dayEvents, '24h', NOW);
    const weekSelection = selectLiveModeEvents(weekEvents, '7d', NOW);

    expect(daySelection).toHaveLength(72);
    expect(daySelection[0]?.id).toBe('day-28');
    expect(daySelection.at(-1)?.id).toBe('day-99');
    expect(weekSelection).toHaveLength(120);
    expect(weekSelection[0]?.id).toBe('week-30');
    expect(weekSelection.at(-1)?.id).toBe('week-149');
  });
});

describe('buildLiveModeScene', () => {
  it('builds deterministic node layout and cumulative frames', () => {
    const events: ActivityEvent[] = [
      makeEvent({
        id: 'evt-1',
        actor: 'hivemoot-builder',
        type: 'proposal',
        createdAt: '2026-02-11T10:00:00Z',
      }),
      makeEvent({
        id: 'evt-2',
        actor: 'hivemoot-worker',
        type: 'pull_request',
        createdAt: '2026-02-11T10:05:00Z',
      }),
      makeEvent({
        id: 'evt-3',
        actor: 'hivemoot-scout',
        type: 'comment',
        createdAt: '2026-02-11T10:10:00Z',
      }),
    ];

    const sceneA = buildLiveModeScene({
      events,
      agentLogins: ['hivemoot-worker', 'hivemoot-builder', 'hivemoot-scout'],
      window: '24h',
      now: NOW,
    });

    const sceneB = buildLiveModeScene({
      events,
      agentLogins: ['hivemoot-worker', 'hivemoot-builder', 'hivemoot-scout'],
      window: '24h',
      now: NOW,
    });

    expect(sceneA).toEqual(sceneB);
    expect(sceneA.frames).toHaveLength(3);
    expect(sceneA.frames[0].links).toHaveLength(0);
    expect(sceneA.frames[2].links).toHaveLength(2);
    expect(sceneA.frames[2].activeAgents).toEqual([
      'hivemoot-builder',
      'hivemoot-scout',
      'hivemoot-worker',
    ]);
  });

  it('does not create self-links for consecutive events by the same agent', () => {
    const events: ActivityEvent[] = [
      makeEvent({
        id: 'evt-1',
        actor: 'hivemoot-worker',
        createdAt: '2026-02-11T10:00:00Z',
      }),
      makeEvent({
        id: 'evt-2',
        actor: 'hivemoot-worker',
        createdAt: '2026-02-11T10:01:00Z',
      }),
      makeEvent({
        id: 'evt-3',
        actor: 'hivemoot-builder',
        createdAt: '2026-02-11T10:02:00Z',
      }),
    ];

    const scene = buildLiveModeScene({
      events,
      agentLogins: ['hivemoot-worker', 'hivemoot-builder'],
      window: '24h',
      now: NOW,
    });

    expect(scene.frames[1].links).toHaveLength(0);
    expect(scene.frames[2].links).toHaveLength(1);
    expect(scene.frames[2].links[0].id).toBe(
      'hivemoot-worker->hivemoot-builder'
    );
  });
});
