import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeGovernanceMetrics,
  type AgentRole,
  type AgentRoleProfile,
  type GovernanceMetrics,
  type ProposalPipelineCounts,
} from '../utils/governance';
import { handleAvatarError } from '../utils/avatar';

interface GovernanceAnalyticsProps {
  data: ActivityData;
}

export function GovernanceAnalytics({
  data,
}: GovernanceAnalyticsProps): React.ReactElement {
  const metrics = useMemo(() => computeGovernanceMetrics(data), [data]);

  return (
    <div className="space-y-6">
      <SummaryCards metrics={metrics} />
      <ProposalPipeline pipeline={metrics.pipeline} />
      {metrics.agentRoles.length > 0 && (
        <AgentRoles roles={metrics.agentRoles} />
      )}
      {metrics.topProposers.length > 0 && (
        <TopProposers
          proposers={metrics.topProposers}
          total={metrics.totalProposals}
        />
      )}
    </div>
  );
}

function SummaryCards({
  metrics,
}: {
  metrics: GovernanceMetrics;
}): React.ReactElement {
  const successDisplay =
    metrics.successRate !== null
      ? `${Math.round(metrics.successRate * 100)}%`
      : '—';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        label="Total Proposals"
        value={String(metrics.totalProposals)}
      />
      <StatCard label="Success Rate" value={successDisplay} />
      <StatCard label="Active Now" value={String(metrics.activeProposals)} />
      <StatCard
        label="Avg Discussion"
        value={`${metrics.avgComments.toFixed(1)} comments`}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-3 text-center border border-amber-100 dark:border-neutral-700">
      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
        {value}
      </p>
    </div>
  );
}

const PHASE_COLORS: Record<
  keyof Omit<ProposalPipelineCounts, 'total'>,
  { bg: string; label: string }
> = {
  discussion: {
    bg: 'bg-amber-400 dark:bg-amber-500',
    label: 'Discussion',
  },
  voting: {
    bg: 'bg-blue-400 dark:bg-blue-500',
    label: 'Voting',
  },
  readyToImplement: {
    bg: 'bg-green-400 dark:bg-green-500',
    label: 'Ready',
  },
  implemented: {
    bg: 'bg-neutral-400 dark:bg-neutral-500',
    label: 'Implemented',
  },
  rejected: {
    bg: 'bg-red-400 dark:bg-red-500',
    label: 'Rejected',
  },
  inconclusive: {
    bg: 'bg-orange-300 dark:bg-orange-500',
    label: 'Inconclusive',
  },
};

function ProposalPipeline({
  pipeline,
}: {
  pipeline: ProposalPipelineCounts;
}): React.ReactElement {
  const total = pipeline.total;

  if (total === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No proposal data to visualize
      </p>
    );
  }

  const segments = (
    Object.keys(PHASE_COLORS) as Array<keyof typeof PHASE_COLORS>
  )
    .filter((key) => pipeline[key] > 0)
    .map((key) => ({
      key,
      count: pipeline[key],
      pct: (pipeline[key] / total) * 100,
      ...PHASE_COLORS[key],
    }));

  return (
    <div>
      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
        Proposal Pipeline
      </h4>
      <div
        className="flex h-6 rounded-full overflow-hidden border border-amber-200 dark:border-neutral-600"
        role="img"
        aria-label={`Proposal pipeline: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')}`}
      >
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.bg} motion-safe:transition-all`}
            style={{ width: `${seg.pct}%` }}
            title={`${seg.label}: ${seg.count} (${Math.round(seg.pct)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${seg.bg}`}
            />
            <span className="text-amber-700 dark:text-amber-300">
              {seg.label}
            </span>
            <span className="text-amber-500 dark:text-amber-500 font-mono">
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLE_CONFIG: Record<AgentRole, { color: string; label: string }> = {
  coder: { color: 'bg-amber-400 dark:bg-amber-500', label: 'Coder' },
  reviewer: { color: 'bg-purple-400 dark:bg-purple-500', label: 'Reviewer' },
  proposer: { color: 'bg-blue-400 dark:bg-blue-500', label: 'Proposer' },
  discussant: { color: 'bg-teal-400 dark:bg-teal-500', label: 'Discussant' },
};

function AgentRoles({
  roles,
}: {
  roles: AgentRoleProfile[];
}): React.ReactElement {
  return (
    <div>
      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
        Agent Specializations
      </h4>
      <div className="space-y-2">
        {roles.map((agent) => (
          <AgentRoleBar key={agent.login} agent={agent} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {(Object.keys(ROLE_CONFIG) as AgentRole[]).map((role) => (
          <div key={role} className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${ROLE_CONFIG[role].color}`}
            />
            <span className="text-amber-700 dark:text-amber-300">
              {ROLE_CONFIG[role].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentRoleBar({
  agent,
}: {
  agent: AgentRoleProfile;
}): React.ReactElement {
  const totalScore = Object.values(agent.scores).reduce((a, b) => a + b, 0);
  const roleLabel = agent.primaryRole
    ? ROLE_CONFIG[agent.primaryRole].label
    : 'Inactive';

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-36 min-w-0 shrink-0">
        <img
          src={agent.avatarUrl ?? `https://github.com/${agent.login}.png`}
          alt=""
          loading="lazy"
          className="w-5 h-5 rounded-full border border-amber-200 dark:border-neutral-600"
          onError={handleAvatarError}
        />
        <span className="text-xs text-amber-900 dark:text-amber-100 truncate">
          {agent.login}
        </span>
      </div>
      <div
        className="flex-1 flex h-4 rounded-full overflow-hidden border border-amber-100 dark:border-neutral-700"
        role="img"
        aria-label={`${agent.login}: primary role is ${roleLabel}`}
      >
        {totalScore > 0 &&
          (Object.keys(ROLE_CONFIG) as AgentRole[])
            .filter((role) => agent.scores[role] > 0)
            .map((role) => (
              <div
                key={role}
                className={`${ROLE_CONFIG[role].color} motion-safe:transition-all`}
                style={{
                  width: `${(agent.scores[role] / totalScore) * 100}%`,
                }}
                title={`${ROLE_CONFIG[role].label}: ${Math.round(agent.scores[role] * 100)}%`}
              />
            ))}
      </div>
      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 w-20 text-right shrink-0">
        {roleLabel}
      </span>
    </div>
  );
}

function TopProposers({
  proposers,
  total,
}: {
  proposers: Array<{ login: string; count: number }>;
  total: number;
}): React.ReactElement {
  const maxCount = proposers[0]?.count ?? 1;

  return (
    <div>
      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
        Top Proposers
      </h4>
      <div className="space-y-1.5">
        {proposers.map((p) => (
          <div key={p.login} className="flex items-center gap-3">
            <span className="text-xs text-amber-900 dark:text-amber-100 w-36 min-w-0 shrink-0 truncate">
              {p.login}
            </span>
            <div className="flex-1 h-4 bg-amber-50 dark:bg-neutral-800 rounded-full overflow-hidden border border-amber-100 dark:border-neutral-700">
              <div
                className="h-full bg-amber-400 dark:bg-amber-500 rounded-full motion-safe:transition-all"
                style={{ width: `${(p.count / maxCount) * 100}%` }}
                role="img"
                aria-label={`${p.login}: ${p.count} of ${total} proposals`}
              />
            </div>
            <span className="text-xs font-mono text-amber-700 dark:text-amber-300 w-8 text-right shrink-0">
              {p.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
