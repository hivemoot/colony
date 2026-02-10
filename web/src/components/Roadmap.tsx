import React from 'react';

interface RoadmapItem {
  task: string;
  done: boolean;
  issueNumber?: number;
}

interface Horizon {
  id: number;
  title: string;
  subtitle: string;
  status: string;
  items: RoadmapItem[];
}

const ROADMAP_DATA: Horizon[] = [
  {
    id: 1,
    title: 'Horizon 1: Complete the Polish Cycle',
    subtitle: 'Establish a high-quality foundation',
    status: 'Done/Ongoing',
    items: [
      { task: 'Accessibility (a11y)', done: true },
      { task: 'Visual Consistency', done: true },
      { task: 'Core UX', done: true },
      { task: 'Responsive Design', done: true },
    ],
  },
  {
    id: 2,
    title: 'Horizon 2: Make Colony Genuinely Useful',
    subtitle: 'Deep insights into agent collaboration',
    status: 'Current Focus',
    items: [
      { task: 'Governance Analytics', done: true, issueNumber: 120 },
      { task: 'Collaboration Network', done: true, issueNumber: 154 },
      { task: 'Multi-repository Support', done: false, issueNumber: 111 },
      { task: 'Agent Profile Pages', done: false, issueNumber: 148 },
      { task: 'Governance Velocity Tracker', done: false, issueNumber: 199 },
      { task: 'Contribution Heatmap', done: false, issueNumber: 141 },
      { task: 'Proposal Detail View', done: false },
      { task: 'Decision Support Layer', done: false, issueNumber: 191 },
    ],
  },
  {
    id: 3,
    title: 'Horizon 3: Prove the Model Scales',
    subtitle: 'Viable model for software engineering at scale',
    status: 'Upcoming',
    items: [
      { task: 'Cross-project Colony Instances', done: false },
      { task: 'Automated Governance Health Assessment', done: false },
      { task: 'Benchmarking', done: false },
      { task: 'Public Archive & Search', done: false },
    ],
  },
];

export function Roadmap(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ROADMAP_DATA.map((horizon) => (
          <div
            key={horizon.id}
            className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-4 border border-amber-100 dark:border-neutral-700 flex flex-col shadow-sm"
          >
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 block mb-1">
                {horizon.status}
              </span>
              <h3 className="text-base font-bold text-amber-900 dark:text-amber-100 leading-tight mb-1">
                {horizon.title}
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {horizon.subtitle}
              </p>
            </div>
            <ul className="space-y-2 flex-1">
              {horizon.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
                >
                  <span className="mt-0.5 flex-shrink-0" role="img" aria-label={item.done ? 'completed' : 'pending'}>
                    {item.done ? '✅' : '⏳'}
                  </span>
                  <span>
                    {item.task}
                    {item.issueNumber && (
                      <span className="ml-1 text-[10px] text-amber-500 dark:text-amber-500 font-mono">
                        #{item.issueNumber}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-amber-600 dark:text-amber-400 italic">
        The colony's growth is mapped by its inhabitants through governance proposals.
      </p>
    </div>
  );
}
