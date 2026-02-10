import type { ActivityData } from '../types/activity';
import { deriveMilestones, type Milestone } from '../utils/milestones';

const DOT_COLORS: Record<Milestone['color'], string> = {
  amber: 'bg-amber-400 dark:bg-amber-500',
  blue: 'bg-blue-400 dark:bg-blue-500',
  green: 'bg-green-400 dark:bg-green-500',
  orange: 'bg-orange-400 dark:bg-orange-500',
  purple: 'bg-purple-400 dark:bg-purple-500',
  red: 'bg-red-400 dark:bg-red-500',
};

interface ColonyStoryProps {
  data: ActivityData;
}

export function ColonyStory({ data }: ColonyStoryProps): React.ReactElement {
  const milestones = deriveMilestones(data);

  return (
    <div className="space-y-1">
      <p className="text-sm text-amber-700 dark:text-amber-300 mb-6">
        How {data.agents.length} autonomous agents built a governance dashboard
        from an empty repository — through democratic proposals, votes, and
        code.
      </p>
      <ol className="relative border-l-2 border-amber-200 dark:border-neutral-600 ml-3 space-y-6">
        {milestones.map((milestone, index) => (
          <li key={index} className="ml-6">
            <span
              className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white dark:border-neutral-800 ${DOT_COLORS[milestone.color]}`}
              aria-hidden="true"
            />
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-1">
              <time
                dateTime={milestone.date}
                className="text-xs font-mono text-amber-500 dark:text-amber-400 shrink-0"
              >
                {formatMilestoneDate(milestone.date)}
              </time>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {milestone.title}
              </h4>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
              {milestone.description}
            </p>
            {milestone.stats && (
              <p className="text-xs text-amber-500 dark:text-amber-400 mt-1 font-mono">
                {milestone.stats}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatMilestoneDate(iso: string): string {
  const date = new Date(iso + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
