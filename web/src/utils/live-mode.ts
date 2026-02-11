import type { ActivityEvent, ActivityEventType } from '../types/activity';

export type LiveModeWindow = 'live' | '24h' | '7d';

export interface LiveModeWindowOption {
  value: LiveModeWindow;
  label: string;
}

export const LIVE_MODE_WINDOW_OPTIONS: readonly LiveModeWindowOption[] = [
  { value: 'live', label: 'Live' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
] as const;

export interface LiveModeNodeLayout {
  login: string;
  angle: number;
  baseX: number;
  baseY: number;
}

export interface LiveModeNodeState extends LiveModeNodeLayout {
  x: number;
  y: number;
  activityCount: number;
  isActive: boolean;
  lastType: ActivityEventType | null;
}

export interface LiveModeLinkState {
  id: string;
  source: string;
  target: string;
  weight: number;
  type: ActivityEventType;
  isActive: boolean;
}

export interface LiveModeFrame {
  index: number;
  event: ActivityEvent;
  nodes: LiveModeNodeState[];
  links: LiveModeLinkState[];
  activeAgents: string[];
}

export interface LiveModeScene {
  window: LiveModeWindow;
  events: ActivityEvent[];
  frames: LiveModeFrame[];
  agentLogins: string[];
}

interface BuildLiveModeSceneParams {
  events: ActivityEvent[];
  agentLogins: string[];
  window: LiveModeWindow;
  now?: Date;
}

interface AgentActivityState {
  count: number;
  lastType: ActivityEventType | null;
}

interface LinkAccumulator {
  id: string;
  source: string;
  target: string;
  count: number;
  lastType: ActivityEventType;
  lastEventIndex: number;
}

const LIVE_WINDOW_HOURS = 2;
const LIVE_MAX_EVENTS = 12;
const DAY_MAX_EVENTS = 72;
const WEEK_MAX_EVENTS = 120;

export function buildLiveModeScene({
  events,
  agentLogins,
  window,
  now = new Date(),
}: BuildLiveModeSceneParams): LiveModeScene {
  const scopedEvents = selectLiveModeEvents(events, window, now);
  const allAgentLogins = collectAgentLogins(agentLogins, scopedEvents);
  const layout = buildNodeLayout(allAgentLogins);

  if (scopedEvents.length === 0 || layout.length === 0) {
    return {
      window,
      events: scopedEvents,
      frames: [],
      agentLogins: allAgentLogins,
    };
  }

  const activityByAgent = new Map<string, AgentActivityState>(
    allAgentLogins.map((login) => [login, { count: 0, lastType: null }])
  );
  const linksById = new Map<string, LinkAccumulator>();
  const frames: LiveModeFrame[] = [];
  let previousActor: string | null = null;

  scopedEvents.forEach((event, index) => {
    const actor = event.actor || 'unknown';
    const existing = activityByAgent.get(actor);
    if (existing) {
      existing.count += 1;
      existing.lastType = event.type;
    } else {
      activityByAgent.set(actor, { count: 1, lastType: event.type });
    }

    if (previousActor && previousActor !== actor) {
      const key = `${previousActor}->${actor}`;
      const link = linksById.get(key);
      if (link) {
        link.count += 1;
        link.lastType = event.type;
        link.lastEventIndex = index;
      } else {
        linksById.set(key, {
          id: key,
          source: previousActor,
          target: actor,
          count: 1,
          lastType: event.type,
          lastEventIndex: index,
        });
      }
    }
    previousActor = actor;

    const nodes = layout.map((node) => {
      const stats = activityByAgent.get(node.login) ?? {
        count: 0,
        lastType: null,
      };
      const isActive = node.login === actor;
      const pullToCenter = isActive ? 0.2 : 0;

      return {
        ...node,
        x: round2(node.baseX + (50 - node.baseX) * pullToCenter),
        y: round2(node.baseY + (50 - node.baseY) * pullToCenter),
        activityCount: stats.count,
        isActive,
        lastType: stats.lastType,
      };
    });

    const links = Array.from(linksById.values()).map((link) => ({
      id: link.id,
      source: link.source,
      target: link.target,
      weight: link.count,
      type: link.lastType,
      isActive: link.lastEventIndex === index,
    }));

    const activeAgents = Array.from(activityByAgent.entries())
      .filter(([, state]) => state.count > 0)
      .sort((a, b) => {
        if (b[1].count !== a[1].count) {
          return b[1].count - a[1].count;
        }
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map(([login]) => login);

    frames.push({
      index,
      event,
      nodes,
      links,
      activeAgents,
    });
  });

  return {
    window,
    events: scopedEvents,
    frames,
    agentLogins: allAgentLogins,
  };
}

export function selectLiveModeEvents(
  events: ActivityEvent[],
  window: LiveModeWindow,
  now = new Date()
): ActivityEvent[] {
  const sorted = [...events].sort((a, b) => {
    const diff = parseIsoMs(a.createdAt) - parseIsoMs(b.createdAt);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  if (sorted.length === 0) return [];

  if (window === 'live') {
    const liveThresholdMs = now.getTime() - LIVE_WINDOW_HOURS * 60 * 60 * 1000;
    const recent = sorted.filter(
      (event) => parseIsoMs(event.createdAt) >= liveThresholdMs
    );
    const pool = recent.length > 0 ? recent : sorted;
    return pool.slice(-LIVE_MAX_EVENTS);
  }

  const lookbackMs =
    window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const thresholdMs = now.getTime() - lookbackMs;
  const scoped = sorted.filter(
    (event) => parseIsoMs(event.createdAt) >= thresholdMs
  );
  const maxEvents = window === '24h' ? DAY_MAX_EVENTS : WEEK_MAX_EVENTS;

  if (scoped.length <= maxEvents) {
    return scoped;
  }

  return scoped.slice(-maxEvents);
}

function collectAgentLogins(
  agentLogins: string[],
  events: ActivityEvent[]
): string[] {
  const unique = new Set<string>();

  for (const login of agentLogins) {
    if (login) unique.add(login);
  }
  for (const event of events) {
    if (event.actor) unique.add(event.actor);
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

function buildNodeLayout(agentLogins: string[]): LiveModeNodeLayout[] {
  if (agentLogins.length === 0) return [];
  if (agentLogins.length === 1) {
    return [
      {
        login: agentLogins[0],
        angle: -Math.PI / 2,
        baseX: 50,
        baseY: 45,
      },
    ];
  }

  const centerX = 50;
  const centerY = 50;
  const radiusX = 36;
  const radiusY = 30;

  return agentLogins.map((login, index) => {
    const angle = (index / agentLogins.length) * Math.PI * 2 - Math.PI / 2;
    return {
      login,
      angle,
      baseX: round2(centerX + Math.cos(angle) * radiusX),
      baseY: round2(centerY + Math.sin(angle) * radiusY),
    };
  });
}

function parseIsoMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
