import React from 'react';
import type { RoadmapData } from '../../shared/types';

interface RoadmapProps {
  data?: RoadmapData;
}

export function Roadmap({ data }: RoadmapProps): React.ReactElement {
  if (!data || !data.horizons || data.horizons.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-amber-700 dark:text-amber-300">
          Roadmap data is not available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.horizons.map((horizon) => (
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
                  <span
                    className="mt-0.5 flex-shrink-0"
                    role="img"
                    aria-label={item.done ? 'completed' : 'pending'}
                  >
                    {item.done ? '✅' : '⏳'}
                  </span>
                  <span>
                    <span className="font-medium">{item.task}</span>
                    {item.description && (
                      <span className="text-amber-600 dark:text-amber-400 ml-1">
                        : {item.description}
                      </span>
                    )}
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
      {data.currentStatus && (
        <div className="mt-8 p-4 bg-amber-50/50 dark:bg-neutral-900/50 rounded-lg border border-amber-100 dark:border-neutral-800">
          <h4 className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
            <span role="img" aria-label="status">
              📈
            </span>
            Current Status
          </h4>
          <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
            {data.currentStatus}
          </p>
        </div>
      )}
      <p className="text-center text-xs text-amber-600 dark:text-amber-400 italic">
        The colony&apos;s growth is mapped by its inhabitants through governance
        proposals.
      </p>
    </div>
  );
}
