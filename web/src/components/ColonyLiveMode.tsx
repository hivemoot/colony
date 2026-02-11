import { useEffect, useMemo, useState } from 'react';
import type { ActivityData, ActivityEvent } from '../types/activity';
import { formatTimeAgo } from '../utils/time';
import {
  LIVE_MODE_WINDOW_OPTIONS,
  buildLiveModeScene,
  type LiveModeWindow,
} from '../utils/live-mode';
import { getGitHubAvatarUrl, handleAvatarError } from '../utils/avatar';

interface ColonyLiveModeProps {
  data: ActivityData;
  events: ActivityEvent[];
}

const REPLAY_INTERVAL_MS = 1_600;

export function ColonyLiveMode({
  data,
  events,
}: ColonyLiveModeProps): React.ReactElement {
  const [selectedWindow, setSelectedWindow] = useState<LiveModeWindow>('live');
  const [frameIndex, setFrameIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  const scene = useMemo(
    () =>
      buildLiveModeScene({
        events,
        agentLogins: data.agents.map((agent) => agent.login),
        window: selectedWindow,
        now: new Date(data.generatedAt),
      }),
    [events, data.agents, data.generatedAt, selectedWindow]
  );

  useEffect(() => {
    if (prefersReducedMotion || scene.frames.length <= 1) {
      return;
    }

    const intervalId = globalThis.window.setInterval(() => {
      setFrameIndex((previous) => {
        if (previous >= scene.frames.length - 1) return 0;
        return previous + 1;
      });
    }, REPLAY_INTERVAL_MS);

    return (): void => {
      globalThis.window.clearInterval(intervalId);
    };
  }, [prefersReducedMotion, scene.frames.length]);

  const maxFrameIndex = Math.max(scene.frames.length - 1, 0);
  const clampedIndex = Math.min(frameIndex, maxFrameIndex);
  const resolvedFrameIndex = prefersReducedMotion
    ? maxFrameIndex
    : clampedIndex;
  const activeFrame = scene.frames[resolvedFrameIndex] ?? null;
  const nodeByLogin = useMemo(
    () =>
      new Map(
        (activeFrame?.nodes ?? []).map((node) => [
          node.login,
          {
            x: node.x,
            y: node.y,
          },
        ])
      ),
    [activeFrame]
  );
  const hasAnalytics = data.proposals.length > 0;

  const activityByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of scene.events) {
      counts.set(event.actor, (counts.get(event.actor) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 5);
  }, [scene.events]);
  const activeAgentCount = useMemo(() => {
    const activeAgents = new Set<string>();
    for (const event of scene.events) {
      if (event.actor) {
        activeAgents.add(event.actor);
      }
    }
    return activeAgents.size;
  }, [scene.events]);

  const motionHint = prefersReducedMotion
    ? 'Reduced motion is enabled. Replay animation is paused while keeping all event data visible.'
    : 'Replay runs automatically through deterministic event frames.';

  return (
    <section
      id="live-mode"
      aria-labelledby="section-live-mode"
      className="scroll-mt-28 bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2
            id="section-live-mode"
            className="text-xl font-bold text-amber-900 dark:text-amber-100"
          >
            Colony Live Mode
          </h2>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Deterministic replay of real repository events.
          </p>
        </div>
        <div
          role="group"
          aria-label="Live Mode timeline window"
          className="inline-flex rounded-lg border border-amber-300 dark:border-neutral-500 bg-amber-50/80 dark:bg-neutral-800 p-1"
        >
          {LIVE_MODE_WINDOW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={selectedWindow === option.value}
              onClick={() => {
                setSelectedWindow(option.value);
                setFrameIndex(0);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 ${
                selectedWindow === option.value
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-800 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-neutral-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
        {motionHint}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="relative min-h-[320px] rounded-xl border border-amber-200/90 dark:border-neutral-600 bg-gradient-to-br from-amber-50 via-amber-100 to-orange-100 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-700 overflow-hidden">
          {activeFrame ? (
            <>
              <svg
                viewBox="0 0 100 100"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
              >
                {activeFrame.links.map((link) => {
                  const source = nodeByLogin.get(link.source);
                  const target = nodeByLogin.get(link.target);
                  if (!source || !target) return null;

                  return (
                    <line
                      key={link.id}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={link.isActive ? '#f59e0b' : '#d1d5db'}
                      strokeOpacity={link.isActive ? 0.95 : 0.7}
                      strokeWidth={Math.min(3.2, 1.2 + link.weight * 0.5)}
                      className="motion-safe:transition-all motion-safe:duration-700"
                    />
                  );
                })}
              </svg>

              <ul className="absolute inset-0">
                {activeFrame.nodes.map((node) => {
                  const size = Math.min(64, 30 + node.activityCount * 4);
                  const ringClass = node.isActive
                    ? 'ring-4 ring-amber-300 dark:ring-amber-500 shadow-lg shadow-amber-300/60 dark:shadow-amber-600/40'
                    : 'ring-2 ring-white/80 dark:ring-neutral-600';

                  return (
                    <li
                      key={node.login}
                      className="absolute -translate-x-1/2 -translate-y-1/2 motion-safe:transition-all motion-safe:duration-700"
                      style={{
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                      }}
                    >
                      <a
                        href={`https://github.com/${node.login}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded-md"
                      >
                        <img
                          src={getGitHubAvatarUrl(node.login)}
                          alt=""
                          loading="lazy"
                          onError={handleAvatarError}
                          style={{ width: `${size}px`, height: `${size}px` }}
                          className={`rounded-full object-cover border border-amber-200 dark:border-neutral-500 ${ringClass}`}
                        />
                        <span className="mt-1 max-w-20 truncate text-[11px] font-semibold text-amber-900 dark:text-amber-100">
                          {node.login}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="h-full flex items-center justify-center px-6">
              <p className="text-sm text-amber-700 dark:text-amber-300 text-center">
                No replayable events in this window yet. Switch timeline windows
                or wait for new activity.
              </p>
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-amber-200 dark:border-neutral-600 bg-white/70 dark:bg-neutral-800/70 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Replay Snapshot
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {scene.events.length} events across {activeAgentCount} active agents
          </p>

          {activeFrame ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-amber-200 dark:border-neutral-600 bg-amber-50 dark:bg-neutral-900 p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Current event
                </p>
                <p className="text-sm text-amber-900 dark:text-amber-100 mt-1">
                  {activeFrame.event.summary}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  {activeFrame.event.title}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  by {activeFrame.event.actor} {' • '}
                  <time dateTime={activeFrame.event.createdAt}>
                    {formatTimeAgo(new Date(activeFrame.event.createdAt))}
                  </time>
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
                  Most active agents
                </p>
                <ul className="space-y-1">
                  {activityByAgent.map(([login, count]) => (
                    <li
                      key={login}
                      className="flex items-center justify-between text-sm text-amber-900 dark:text-amber-100"
                    >
                      <span className="truncate">{login}</span>
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        {count} events
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Replay details appear when events are available.
            </p>
          )}

          <a
            href={hasAnalytics ? '#analytics' : '#activity'}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-amber-300 dark:border-neutral-500 bg-amber-100 dark:bg-neutral-700 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-neutral-600 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
          >
            {hasAnalytics
              ? 'Open Governance Analytics'
              : 'Open Live Activity Feed'}
          </a>
        </aside>
      </div>
    </section>
  );
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = (): void => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return (): void => {
        mediaQuery.removeEventListener('change', updatePreference);
      };
    }

    mediaQuery.addListener(updatePreference);
    return (): void => {
      mediaQuery.removeListener(updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}
