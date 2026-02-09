import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  detectBottlenecks,
  suggestActions,
  type Bottleneck,
  type BottleneckType,
  type SuggestedAction,
  type ActionPriority,
} from '../utils/decision-support';

interface ColonyIntelligenceProps {
  data: ActivityData;
  repoUrl: string;
}

const BOTTLENECK_STYLES: Record<
  BottleneckType,
  { icon: string; iconLabel: string; bg: string; text: string; badge: string }
> = {
  'competing-implementations': {
    icon: '\u26A0\uFE0F',
    iconLabel: 'warning',
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  },
  'stalled-discussion': {
    icon: '\u23F8\uFE0F',
    iconLabel: 'paused',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  'unclaimed-work': {
    icon: '\u{1F4CB}',
    iconLabel: 'clipboard',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  },
};

const PRIORITY_STYLES: Record<ActionPriority, { dot: string; label: string }> =
  {
    high: { dot: 'bg-red-400 dark:bg-red-500', label: 'High' },
    medium: { dot: 'bg-amber-400 dark:bg-amber-500', label: 'Medium' },
    low: { dot: 'bg-blue-400 dark:bg-blue-500', label: 'Low' },
  };

export function ColonyIntelligence({
  data,
  repoUrl,
}: ColonyIntelligenceProps): React.ReactElement {
  const bottlenecks = useMemo(() => detectBottlenecks(data), [data]);
  const actions = useMemo(
    () => suggestActions(bottlenecks, data),
    [bottlenecks, data]
  );

  if (bottlenecks.length === 0) {
    return (
      <p className="text-sm text-green-700 dark:text-green-300 text-center">
        No bottlenecks detected — governance is flowing smoothly
      </p>
    );
  }

  const totalItems = bottlenecks.reduce((sum, b) => sum + b.items.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-700 dark:text-amber-300">
        {totalItems} attention item{totalItems !== 1 ? 's' : ''} detected across{' '}
        {bottlenecks.length} categor{bottlenecks.length !== 1 ? 'ies' : 'y'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {bottlenecks.map((b) => (
          <BottleneckCard key={b.type} bottleneck={b} repoUrl={repoUrl} />
        ))}
      </div>

      {actions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Suggested Actions
          </h3>
          <ul className="space-y-2" role="list">
            {actions.map((action) => (
              <ActionItem
                key={action.issueNumber}
                action={action}
                repoUrl={repoUrl}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BottleneckCard({
  bottleneck,
  repoUrl,
}: {
  bottleneck: Bottleneck;
  repoUrl: string;
}): React.ReactElement {
  const styles = BOTTLENECK_STYLES[bottleneck.type];

  return (
    <div
      className={`${styles.bg} rounded-lg p-3 border border-amber-100 dark:border-neutral-700`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span role="img" aria-label={styles.iconLabel}>
          {styles.icon}
        </span>
        <span className={`text-xs font-semibold ${styles.text}`}>
          {bottleneck.label}
        </span>
        <span
          className={`ml-auto text-xs font-mono px-1.5 py-0.5 rounded-full ${styles.badge}`}
        >
          {bottleneck.items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {bottleneck.items.map((item) => (
          <li
            key={item.number}
            className="text-xs text-amber-700 dark:text-amber-300"
          >
            <a
              href={`${repoUrl}/issues/${item.number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
            >
              #{item.number}
            </a>{' '}
            <span className="text-amber-600 dark:text-amber-400">
              {item.title}
            </span>
            {item.detail && (
              <span className="block text-amber-500 dark:text-amber-500 mt-0.5">
                {item.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionItem({
  action,
  repoUrl,
}: {
  action: SuggestedAction;
  repoUrl: string;
}): React.ReactElement {
  const styles = PRIORITY_STYLES[action.priority];

  return (
    <li className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
      <span
        className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`}
        role="img"
        aria-label={`${styles.label} priority`}
      />
      <span>
        <a
          href={`${repoUrl}/issues/${action.issueNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
        >
          #{action.issueNumber}
        </a>{' '}
        {action.description.replace(`#${action.issueNumber} `, '')}
      </span>
    </li>
  );
}
