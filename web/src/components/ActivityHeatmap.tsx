import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeActivityHeatmap,
  intensityLevel,
  type DayActivity,
} from '../utils/heatmap';

interface ActivityHeatmapProps {
  data: ActivityData;
  selectedAgent: string | null;
}

const INTENSITY_STYLES: Record<number, string> = {
  0: 'bg-amber-100 dark:bg-neutral-700',
  1: 'bg-amber-200 dark:bg-amber-800',
  2: 'bg-amber-300 dark:bg-amber-700',
  3: 'bg-amber-500 dark:bg-amber-500',
  4: 'bg-amber-700 dark:bg-amber-400',
};

export function ActivityHeatmap({
  data,
  selectedAgent,
}: ActivityHeatmapProps): React.ReactElement {
  const filtered = useMemo(() => {
    if (!selectedAgent) return data;
    return {
      ...data,
      commits: data.commits.filter((c) => c.author === selectedAgent),
      issues: data.issues.filter((i) => i.author === selectedAgent),
      pullRequests: data.pullRequests.filter(
        (pr) => pr.author === selectedAgent
      ),
      comments: data.comments.filter((c) => c.author === selectedAgent),
    };
  }, [data, selectedAgent]);

  const heatmap = useMemo(() => computeActivityHeatmap(filtered), [filtered]);

  const maxCount = useMemo(
    () => Math.max(...heatmap.map((d) => d.count), 0),
    [heatmap]
  );

  const totalActivity = useMemo(
    () => heatmap.reduce((sum, d) => sum + d.count, 0),
    [heatmap]
  );

  const activeDays = useMemo(
    () => heatmap.filter((d) => d.count > 0).length,
    [heatmap]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {totalActivity} contributions in the last {heatmap.length} days
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {activeDays} active days
        </p>
      </div>

      <div
        className="flex gap-1 flex-wrap"
        role="img"
        aria-label={`Activity heatmap: ${totalActivity} contributions over ${heatmap.length} days`}
      >
        {heatmap.map((day) => (
          <HeatmapCell
            key={day.date}
            day={day}
            level={intensityLevel(day.count, maxCount)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-amber-500 dark:text-amber-400">
          {formatDateLabel(heatmap[0]?.date)}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-amber-500 dark:text-amber-400 mr-1">
            Less
          </span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`w-3 h-3 rounded-sm ${INTENSITY_STYLES[level]}`}
            />
          ))}
          <span className="text-[10px] text-amber-500 dark:text-amber-400 ml-1">
            More
          </span>
        </div>
        <span className="text-[10px] text-amber-500 dark:text-amber-400">
          {formatDateLabel(heatmap[heatmap.length - 1]?.date)}
        </span>
      </div>
    </div>
  );
}

function HeatmapCell({
  day,
  level,
}: {
  day: DayActivity;
  level: number;
}): React.ReactElement {
  const { commits, issues, prs, comments } = day.breakdown;
  const parts: string[] = [];
  if (commits) parts.push(`${commits} commit${commits > 1 ? 's' : ''}`);
  if (issues) parts.push(`${issues} issue${issues > 1 ? 's' : ''}`);
  if (prs) parts.push(`${prs} PR${prs > 1 ? 's' : ''}`);
  if (comments) parts.push(`${comments} comment${comments > 1 ? 's' : ''}`);

  const tooltip =
    day.count === 0
      ? `${formatDateLabel(day.date)}: No activity`
      : `${formatDateLabel(day.date)}: ${day.count} (${parts.join(', ')})`;

  return (
    <div
      title={tooltip}
      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-sm flex items-center justify-center text-[10px] font-medium
        ${INTENSITY_STYLES[level]}
        ${level >= 3 ? 'text-white dark:text-neutral-900' : 'text-amber-700 dark:text-amber-300'}
      `}
    >
      {day.count > 0 ? day.count : ''}
    </div>
  );
}

function formatDateLabel(date: string | undefined): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
