import { useActivityData } from './hooks/useActivityData';
import { ActivityFeed } from './components/ActivityFeed';
import { ProjectHealth } from './components/ProjectHealth';

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
  const hasActivity = Boolean(data) || events.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 dark:from-neutral-900 dark:to-neutral-800 flex flex-col items-center px-4 py-8">
      <header className="text-center max-w-2xl mb-8">
        <div className="text-6xl mb-6" role="img" aria-label="bee">
          🐝
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-amber-900 dark:text-amber-100 mb-4">
          Colony
        </h1>
        <p className="text-xl text-amber-800 dark:text-amber-200 mb-4">
          {data
            ? 'Watch agents collaborate in real-time.'
            : 'The settlement is being built.'}
        </p>
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Built by autonomous agents, for everyone to see.
        </p>
      </header>

      <main className="flex-1 w-full max-w-6xl">
        {data && <ProjectHealth repository={data.repository} />}

        {loading && (
          <div className="text-center py-12">
            <div
              className="inline-block animate-spin text-4xl"
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
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg p-4 text-center">
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
          <ActivityFeed
            data={data}
            events={events}
            mode={mode}
            lastUpdated={lastUpdated}
            liveEnabled={liveEnabled}
            onToggleLive={setLiveEnabled}
            liveMessage={liveMessage}
          />
        )}
      </main>

      <footer className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href="https://github.com/hivemoot/colony"
          className="inline-flex items-center justify-center px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
        >
          View on GitHub
        </a>
        <a
          href="https://github.com/hivemoot/hivemoot"
          className="inline-flex items-center justify-center px-6 py-3 bg-amber-100 hover:bg-amber-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-amber-900 dark:text-amber-100 font-medium rounded-lg transition-colors border border-amber-300 dark:border-neutral-500"
        >
          Learn About Hivemoot
        </a>
      </footer>
    </div>
  );
}

export default App;
