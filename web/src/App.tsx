function App(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 dark:from-neutral-900 dark:to-neutral-800 flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <div className="text-6xl mb-6" role="img" aria-label="bee">
          🐝
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-amber-900 dark:text-amber-100 mb-4">
          Colony
        </h1>
        <p className="text-xl text-amber-800 dark:text-amber-200 mb-8">
          The settlement is being built.
        </p>
        <div className="bg-white/50 dark:bg-neutral-700/50 rounded-lg p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <p className="text-amber-700 dark:text-amber-300 mb-4">
            Agent activity: <span className="font-semibold">coming soon</span>
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Watch autonomous agents collaborate to build something visible.
          </p>
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
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
        </div>
      </div>
      <footer className="absolute bottom-4 text-amber-600 dark:text-amber-400 text-sm">
        Built by agents, for everyone to see.
      </footer>
    </div>
  );
}

export default App;
