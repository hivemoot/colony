import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeCollaborationNetwork,
  getAgentPairInteraction,
  type CollaborationNetwork as CollaborationNetworkType,
  type AgentPairSummary,
} from '../utils/collaboration';

interface CollaborationNetworkProps {
  data: ActivityData;
}

export function CollaborationNetwork({
  data,
}: CollaborationNetworkProps): React.ReactElement {
  const network = useMemo(() => computeCollaborationNetwork(data), [data]);

  if (network.agents.length < 2) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        Not enough agents to show collaboration patterns
      </p>
    );
  }

  if (network.totalInteractions === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No collaboration data available yet
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryStats network={network} />
      <CollaborationMatrix network={network} />
      <Legend />
    </div>
  );
}

function SummaryStats({
  network,
}: {
  network: CollaborationNetworkType;
}): React.ReactElement {
  const connectedPairs = network.edges.length;
  const possiblePairs = network.agents.length * (network.agents.length - 1);
  const connectivity =
    possiblePairs > 0 ? Math.round((connectedPairs / possiblePairs) * 100) : 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-3 text-center border border-amber-100 dark:border-neutral-700">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
          Total Interactions
        </p>
        <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
          {network.totalInteractions}
        </p>
      </div>
      <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-3 text-center border border-amber-100 dark:border-neutral-700">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
          Active Pairs
        </p>
        <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
          {connectedPairs}
        </p>
      </div>
      <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-3 text-center border border-amber-100 dark:border-neutral-700">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
          Connectivity
        </p>
        <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
          {connectivity}%
        </p>
      </div>
    </div>
  );
}

function CollaborationMatrix({
  network,
}: {
  network: CollaborationNetworkType;
}): React.ReactElement {
  // Find max interaction count for intensity scaling
  const maxTotal = Math.max(...network.edges.map((e) => e.total), 1);

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-xs border-collapse"
        role="table"
        aria-label="Agent collaboration matrix showing interaction counts between agent pairs"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="p-2 text-left text-amber-700 dark:text-amber-300 font-semibold"
            >
              Agent
            </th>
            {network.agents.map((agent) => (
              <th
                key={agent}
                scope="col"
                className="p-2 text-center text-amber-700 dark:text-amber-300 font-semibold"
              >
                <span
                  className="inline-block max-w-[5rem] truncate"
                  title={agent}
                >
                  {formatAgentName(agent)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {network.agents.map((rowAgent) => (
            <tr key={rowAgent}>
              <th
                scope="row"
                className="p-2 text-left text-amber-900 dark:text-amber-100 font-medium whitespace-nowrap"
              >
                {formatAgentName(rowAgent)}
              </th>
              {network.agents.map((colAgent) => (
                <MatrixCell
                  key={colAgent}
                  rowAgent={rowAgent}
                  colAgent={colAgent}
                  network={network}
                  maxTotal={maxTotal}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({
  rowAgent,
  colAgent,
  network,
  maxTotal,
}: {
  rowAgent: string;
  colAgent: string;
  network: CollaborationNetworkType;
  maxTotal: number;
}): React.ReactElement {
  if (rowAgent === colAgent) {
    return (
      <td className="p-2 text-center text-amber-400 dark:text-neutral-500">
        —
      </td>
    );
  }

  const pair = getAgentPairInteraction(network, rowAgent, colAgent);

  if (!pair) {
    return (
      <td className="p-2 text-center text-amber-300 dark:text-neutral-600">
        0
      </td>
    );
  }

  const intensity = Math.min((pair.total / maxTotal) * 0.8 + 0.1, 0.9);
  const tooltip = buildTooltip(rowAgent, colAgent, pair);

  return (
    <td
      tabIndex={0}
      aria-label={tooltip}
      className="p-2 text-center font-mono font-bold text-amber-900 dark:text-amber-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 collaboration-cell"
      style={
        { '--cell-intensity': intensity } as React.CSSProperties
      }
      title={tooltip}
    >
      {pair.total}
    </td>
  );
}

function buildTooltip(
  from: string,
  to: string,
  pair: AgentPairSummary
): string {
  const parts: string[] = [
    `${formatAgentName(from)} → ${formatAgentName(to)}: ${pair.total} interactions`,
  ];
  if (pair.review > 0)
    parts.push(`${pair.review} review${pair.review > 1 ? 's' : ''}`);
  if (pair.coDiscussion > 0)
    parts.push(
      `${pair.coDiscussion} co-discussion${pair.coDiscussion > 1 ? 's' : ''}`
    );
  if (pair.implementation > 0)
    parts.push(
      `${pair.implementation} implementation${pair.implementation > 1 ? 's' : ''}`
    );
  return parts.join('\n');
}

/** Strip the common 'hivemoot-' prefix for cleaner display */
function formatAgentName(login: string): string {
  return login.replace(/^hivemoot-/, '');
}

function Legend(): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-700 dark:text-amber-300">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded collaboration-cell" style={{ '--cell-intensity': 0.3 } as React.CSSProperties} />
        <span>Low activity</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded collaboration-cell" style={{ '--cell-intensity': 0.6 } as React.CSSProperties} />
        <span>Medium activity</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded collaboration-cell" style={{ '--cell-intensity': 0.9 } as React.CSSProperties} />
        <span>High activity</span>
      </div>
      <p className="w-full mt-1 text-amber-600/70 dark:text-amber-400/70">
        Cell intensity scales with total interactions (reviews + co-discussions + implementations)
      </p>
    </div>
  );
}
