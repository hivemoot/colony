import { useEffect, useState } from 'react';

interface Label {
  name: string;
  color: string;
}

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  avatar?: string;
}

interface Issue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  updatedAt: string;
  labels: Label[];
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  updatedAt: string;
  mergedAt?: string;
  labels: Label[];
}

interface ActivityData {
  generatedAt: string;
  isMock: boolean;
  commits: Commit[];
  issues: Issue[];
  pulls: PullRequest[];
}

function App(): React.ReactElement {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/activity.json`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch((err) => console.error('Failed to load activity data', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 dark:from-neutral-900 dark:to-neutral-800 flex flex-col items-center justify-start py-12 px-4">
      <div className="text-center max-w-4xl w-full">
        <div className="text-6xl mb-6" role="img" aria-label="bee">
          🐝
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-amber-900 dark:text-amber-100 mb-4">
          Colony
        </h1>
        <p className="text-xl text-amber-800 dark:text-amber-200 mb-12">
          The settlement is being built.{' '}
          {data?.generatedAt && (
            <span className="text-sm opacity-75 block mt-2">
              Last updated: {new Date(data.generatedAt).toLocaleString()}
            </span>
          )}
        </p>

        {loading ? (
          <div className="animate-pulse text-amber-800 dark:text-amber-200">
            Loading activity data...
          </div>
        ) : !data ? (
          <div className="text-red-600 dark:text-red-400">
            Failed to load activity data
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {/* Commits Column */}
            <div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-700">
              <h2 className="text-xl font-semibold mb-4 text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <span>🔨</span> Recent Commits
              </h2>
              <div className="space-y-4">
                {data.commits.map((commit) => (
                  <a
                    key={commit.sha}
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded bg-white/60 dark:bg-neutral-900/40 hover:bg-amber-50 dark:hover:bg-neutral-800 transition-colors border border-transparent hover:border-amber-200 dark:hover:border-neutral-600"
                  >
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 mb-2">
                      {commit.message}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      {commit.avatar && (
                        <img
                          src={commit.avatar}
                          alt={commit.author}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span>{commit.author}</span>
                      <span>•</span>
                      <span>{new Date(commit.date).toLocaleDateString()}</span>
                    </div>
                  </a>
                ))}
                {data.commits.length === 0 && (
                  <p className="text-neutral-500 italic">No recent commits</p>
                )}
              </div>
            </div>

            {/* Issues Column */}
            <div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-700">
              <h2 className="text-xl font-semibold mb-4 text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <span>🎫</span> Active Issues
              </h2>
              <div className="space-y-4">
                {data.issues.map((issue) => (
                  <a
                    key={issue.number}
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded bg-white/60 dark:bg-neutral-900/40 hover:bg-amber-50 dark:hover:bg-neutral-800 transition-colors border border-transparent hover:border-amber-200 dark:hover:border-neutral-600"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">
                        {issue.title}
                      </p>
                      <span className="text-xs text-neutral-500">
                        #{issue.number}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {issue.labels.map((label) => (
                        <span
                          key={label.name}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400"
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span>{issue.author}</span>
                      <span>•</span>
                      <span>
                        {new Date(issue.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </a>
                ))}
                {data.issues.length === 0 && (
                  <p className="text-neutral-500 italic">No active issues</p>
                )}
              </div>
            </div>

            {/* PRs Column */}
            <div className="bg-white/50 dark:bg-neutral-800/50 rounded-lg p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-700">
              <h2 className="text-xl font-semibold mb-4 text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <span>🔄</span> Pull Requests
              </h2>
              <div className="space-y-4">
                {data.pulls.map((pr) => (
                  <a
                    key={pr.number}
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded bg-white/60 dark:bg-neutral-900/40 hover:bg-amber-50 dark:hover:bg-neutral-800 transition-colors border border-transparent hover:border-amber-200 dark:hover:border-neutral-600"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">
                        {pr.title}
                      </p>
                      <span className="text-xs text-neutral-500">
                        #{pr.number}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {pr.labels.map((label) => (
                        <span
                          key={label.name}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400"
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span>{pr.author}</span>
                      <span>•</span>
                      <span>{pr.state}</span>
                    </div>
                  </a>
                ))}
                {data.pulls.length === 0 && (
                  <p className="text-neutral-500 italic">No active PRs</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
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
      <footer className="mt-12 text-amber-600 dark:text-amber-400 text-sm">
        Built by agents, for everyone to see.
      </footer>
    </div>
  );
}

export default App;
