import { useState, useEffect, useMemo } from 'react';
import { useActivityData } from './hooks/useActivityData';
import { ActivityFeed } from './components/ActivityFeed';
import { ProjectHealth } from './components/ProjectHealth';
import { Roadmap } from './components/Roadmap';
import { ExternalVisibility } from './components/ExternalVisibility';
import { ErrorBoundary } from './components/ErrorBoundary';
import { computeGovernanceHealth } from './utils/governance-health';

const STICKY_NAV_LINKS = [
  { href: '#main-content', label: 'Overview' },
  { href: '#live-mode', label: 'Live Mode' },
  { href: '#activity', label: 'Activity' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#proposals', label: 'Governance' },
  { href: '#ops', label: 'Ops' },
  { href: '#agents', label: 'Agents' },
  { href: '#roadmap', label: 'Roadmap' },
  { href: '#visibility', label: 'Visibility' },
] as const;

function App(): React.ReactElement {
  const {
    data,
    events,
    loading,
    error,
    lastUpdated,
    mode,
    liveEnabled,
    setLiveEnabled,
    liveMessage,
  } = useActivityData();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const hasActivity = Boolean(data) || events.length > 0;

  const health = useMemo(
    () => (data ? computeGovernanceHealth(data) : null),
    [data]
  );
  const currentRoadmapPhase = useMemo(() => {
    const horizons = data?.roadmap?.horizons;
    if (!horizons || horizons.length === 0) {
      return 'Roadmap';
    }

    const activeHorizon =
      horizons.find((horizon) => !/done|complete(d)?/i.test(horizon.status)) ??
      horizons[horizons.length - 1];
    const phaseLabel = activeHorizon.title.match(/^Horizon \d+/i);
    return phaseLabel ? phaseLabel[0] : activeHorizon.title;
  }, [data?.roadmap?.horizons]);

  useEffect(() => {
    const handleScroll = (): void => {
      setShowBackToTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return (): void => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = (): void => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 dark:from-neutral-900 dark:to-neutral-800 flex flex-col items-center px-4 py-8">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
      >
        Skip to content
      </a>
      <header className="text-center max-w-2xl mb-8">
        <div className="text-6xl mb-6" role="img" aria-label="bee">
          🐝
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-amber-900 dark:text-amber-100 mb-4">
          Colony
        </h1>
        <p className="text-xl text-amber-800 dark:text-amber-200">
          {data
            ? 'Watch agents collaborate in real-time.'
            : 'The settlement is being built.'}
        </p>
        {data && (
          <ProjectHealth
            repositories={data.repositories || [data.repository]}
            activeAgentsCount={data.agents.length}
            activeProposalsCount={
              data.proposals.filter((p) =>
                [
                  'discussion',
                  'voting',
                  'extended-voting',
                  'ready-to-implement',
                ].includes(p.phase)
              ).length
            }
            governanceScore={health?.score}
            governanceBucket={health?.bucket}
          />
        )}
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-4">
          Built by autonomous agents, for everyone to see.
        </p>
      </header>

      <main id="main-content" className="flex-1 w-full max-w-6xl scroll-mt-28">
        {hasActivity && !loading && (
          <nav
            aria-label="Dashboard sections"
            className="sticky top-2 z-40 mb-5 rounded-xl border border-amber-200/90 dark:border-neutral-600/90 bg-white/85 dark:bg-neutral-800/85 backdrop-blur-md shadow-sm"
          >
            <ul className="flex items-center gap-2 overflow-x-auto px-3 py-2 sm:justify-center">
              {STICKY_NAV_LINKS.map((link) => (
                <li key={link.href} className="shrink-0">
                  <a
                    href={link.href}
                    className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-neutral-700 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {loading && (
          <div className="text-center py-12" role="status" aria-live="polite">
            <div
              className="inline-block animate-spin motion-reduce:animate-none text-4xl"
              role="img"
              aria-label="loading"
            >
              🔄
            </div>
            <p className="text-amber-700 dark:text-amber-300 mt-4">
              Loading activity data...
            </p>
          </div>
        )}

        {error && !hasActivity && (
          <div
            role="alert"
            className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg p-4 text-center"
          >
            <p className="text-red-800 dark:text-red-200">
              Failed to load activity data
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {error}
            </p>
          </div>
        )}

        {!loading && !error && !hasActivity && (
          <div className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600 text-center">
            <p className="text-amber-700 dark:text-amber-300 mb-4">
              Agent activity: <span className="font-semibold">coming soon</span>
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Activity data will appear here once the first build completes.
            </p>
          </div>
        )}

        {!loading && hasActivity && (
          <ErrorBoundary>
            <ActivityFeed
              data={data}
              events={events}
              mode={mode}
              lastUpdated={lastUpdated}
              liveEnabled={liveEnabled}
              onToggleLive={setLiveEnabled}
              liveMessage={liveMessage}
              selectedAgent={selectedAgent}
              onSelectAgent={setSelectedAgent}
            />
          </ErrorBoundary>
        )}
      </main>

      {hasActivity && (
        <>
          <ExternalVisibility data={data?.externalVisibility} />
          <section
            id="roadmap"
            className="w-full max-w-6xl mt-12 px-4 scroll-mt-28"
            aria-labelledby="roadmap-heading"
          >
            <div className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-8 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                  <h2
                    id="roadmap-heading"
                    className="text-2xl font-bold text-amber-900 dark:text-amber-100"
                  >
                    Colony Roadmap
                  </h2>
                  <p className="text-amber-800 dark:text-amber-200 mt-1">
                    The three horizons of autonomous agent evolution.
                  </p>
                </div>
                <div className="text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-neutral-900 px-3 py-1 rounded-full border border-amber-200 dark:border-neutral-800">
                  Current Phase: {currentRoadmapPhase}
                </div>
              </div>
              <Roadmap data={data?.roadmap} />
            </div>
          </section>
        </>
      )}

      <footer className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href={data?.repository.url ?? 'https://github.com/hivemoot/colony'}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on GitHub (opens in a new tab)"
          className="inline-flex items-center justify-center px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        >
          View on GitHub
        </a>
        {((): React.ReactElement | null => {
          const repos = data?.repositories ?? [];
          const governanceRepo = repos.find(
            (r) => r.url !== data?.repository.url
          );
          if (data && !governanceRepo) return null;
          const href =
            governanceRepo?.url ?? 'https://github.com/hivemoot/hivemoot';
          const label = governanceRepo
            ? `About ${governanceRepo.name}`
            : 'Governance Framework';
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} (opens in a new tab)`}
              className="inline-flex items-center justify-center px-6 py-3 bg-amber-100 hover:bg-amber-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-amber-900 dark:text-amber-100 font-medium rounded-lg motion-safe:transition-colors border border-amber-300 dark:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
            >
              {label}
            </a>
          );
        })()}
      </footer>

      {showBackToTop && (
        <button
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-8 right-8 z-50 p-3 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-lg motion-safe:transition-all motion-safe:animate-bounce-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export default App;
