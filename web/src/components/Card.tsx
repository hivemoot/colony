import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export function Card({
  children,
  title,
  subtitle,
  className = '',
  headerAction,
}: CardProps): React.ReactElement {
  return (
    <section
      className={`bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600 shadow-sm ${className}`}
    >
      {(title || subtitle || headerAction) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            {title && (
              <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && (
            <div className="flex items-center gap-3">{headerAction}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
