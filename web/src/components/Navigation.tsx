import React from 'react';

interface NavigationProps {
  hasRoadmap?: boolean;
}

export function Navigation({ hasRoadmap = true }: NavigationProps): React.ReactElement {
  return (
    <nav className="sticky top-0 z-50 w-full bg-amber-50/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-amber-200 dark:border-neutral-700 py-2 mb-8">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="bee">
            ðŸ
          </span>
          <a
            href="#main-content"
            className="font-bold text-amber-900 dark:text-amber-100 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
          >
            Overview
          </a>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar py-1">
          <NavLink href="#proposals" label="Governance" />
          <NavLink href="#agents" label="Agents" />
          {hasRoadmap && <NavLink href="#roadmap" label="Roadmap" />}
          <NavLink href="#intelligence" label="Intelligence" />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, label }: { href: string; label: string }): React.ReactElement {
  return (
    <a
      href={href}
      className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded px-1"
    >
      {label}
    </a>
  );
}
