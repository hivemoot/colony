import { useMemo } from 'react';
import type { ActivityData } from '../types/activity';
import {
  computeGovernanceBalance,
  type GovernanceBalanceAssessment,
  type BalanceVerdict,
  type ConcentrationLevel,
  type ResponsivenessBucket,
  type AgentInfluence,
  type RoleCoverage,
} from '../utils/governance-balance';

interface GovernanceBalanceProps {
  data: ActivityData;
}

const VERDICT_STYLES: Record<
  BalanceVerdict,
  { bg: string; text: string; border: string }
> = {
  balanced: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-800 dark:text-green-200',
    border: 'border-green-200 dark:border-green-800',
  },
  'mostly-balanced': {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-200 dark:border-blue-800',
  },
  imbalanced: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-800 dark:text-red-200',
    border: 'border-red-200 dark:border-red-800',
  },
  'insufficient-data': {
    bg: 'bg-neutral-50 dark:bg-neutral-800/40',
    text: 'text-neutral-700 dark:text-neutral-300',
    border: 'border-neutral-200 dark:border-neutral-700',
  },
};

const CONCENTRATION_STYLES: Record<
  ConcentrationLevel,
  { badge: string; label: string }
> = {
  balanced: {
    badge:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    label: 'Balanced',
  },
  moderate: {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    label: 'Moderate',
  },
  concentrated: {
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    label: 'Concentrated',
  },
  oligarchy: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    label: 'Oligarchy Risk',
  },
};

const RESPONSIVENESS_STYLES: Record<
  ResponsivenessBucket,
  { badge: string; label: string }
> = {
  'highly-responsive': {
    badge:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    label: 'Highly Responsive',
  },
  responsive: {
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    label: 'Responsive',
  },
  slow: {
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    label: 'Slow',
  },
  concerning: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    label: 'Concerning',
  },
  'no-data': {
    badge:
      'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    label: 'No Data',
  },
};

const AGENT_COLORS = [
  'bg-amber-400 dark:bg-amber-500',
  'bg-blue-400 dark:bg-blue-500',
  'bg-emerald-400 dark:bg-emerald-500',
  'bg-purple-400 dark:bg-purple-500',
  'bg-rose-400 dark:bg-rose-500',
  'bg-cyan-400 dark:bg-cyan-500',
  'bg-orange-400 dark:bg-orange-500',
  'bg-indigo-400 dark:bg-indigo-500',
];

export function GovernanceBalance({
  data,
}: GovernanceBalanceProps): React.ReactElement {
  const assessment = useMemo(() => computeGovernanceBalance(data), [data]);

  return (
    <div className="space-y-4">
      <VerdictBanner assessment={assessment} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PowerConcentrationCard assessment={assessment} />
        <RoleDiversityCard assessment={assessment} />
        <ResponsivenessCard assessment={assessment} />
      </div>
    </div>
  );
}

function VerdictBanner({
  assessment,
}: {
  assessment: GovernanceBalanceAssessment;
}): React.ReactElement {
  const styles = VERDICT_STYLES[assessment.verdict];

  return (
    <div
      className={`rounded-lg p-4 border ${styles.bg} ${styles.border}`}
      role="status"
      aria-label={`Balance verdict: ${assessment.verdict}`}
    >
      <p className={`text-sm font-medium ${styles.text}`}>
        {assessment.verdictReason}
      </p>
    </div>
  );
}

function PowerConcentrationCard({
  assessment,
}: {
  assessment: GovernanceBalanceAssessment;
}): React.ReactElement {
  const { powerConcentration: power } = assessment;
  const meta = CONCENTRATION_STYLES[power.level];

  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-4 border border-amber-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          Power Concentration
        </h4>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}
        >
          {meta.label}
        </span>
      </div>

      {power.agents.length > 0 && <InfluenceBar agents={power.agents} />}

      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
        {power.reason}
      </p>
    </div>
  );
}

function InfluenceBar({
  agents,
}: {
  agents: AgentInfluence[];
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div
        className="h-3 w-full rounded-full overflow-hidden flex"
        role="img"
        aria-label={`Influence distribution across ${agents.length} agents`}
      >
        {agents.map((agent, i) => (
          <div
            key={agent.login}
            className={`h-full ${AGENT_COLORS[i % AGENT_COLORS.length]}`}
            style={{ width: `${Math.max(agent.share * 100, 1)}%` }}
            title={`${agent.login}: ${Math.round(agent.share * 100)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {agents.slice(0, 5).map((agent, i) => (
          <span
            key={agent.login}
            className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${AGENT_COLORS[i % AGENT_COLORS.length]}`}
              aria-hidden="true"
            />
            {agent.login.replace(/^hivemoot-/, '')}
            <span className="font-mono">{Math.round(agent.share * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RoleDiversityCard({
  assessment,
}: {
  assessment: GovernanceBalanceAssessment;
}): React.ReactElement {
  const { roleDiversity: diversity } = assessment;

  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-4 border border-amber-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          Role Diversity
        </h4>
        <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
          {diversity.score}/100
        </span>
      </div>

      <RoleCoverageGrid coverage={diversity.coverage} />

      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
        {diversity.reason}
      </p>
    </div>
  );
}

function RoleCoverageGrid({
  coverage,
}: {
  coverage: RoleCoverage[];
}): React.ReactElement {
  return (
    <div className="grid grid-cols-4 gap-1 text-center">
      {/* Header row */}
      <div className="text-[9px] font-semibold text-amber-700 dark:text-amber-300" />
      <div className="text-[9px] font-semibold text-amber-700 dark:text-amber-300">
        Prop
      </div>
      <div className="text-[9px] font-semibold text-amber-700 dark:text-amber-300">
        Rev
      </div>
      <div className="text-[9px] font-semibold text-amber-700 dark:text-amber-300">
        Cmt
      </div>

      {coverage.map((rc) => (
        <RoleCoverageRow key={rc.role} rc={rc} />
      ))}
    </div>
  );
}

function RoleCoverageRow({ rc }: { rc: RoleCoverage }): React.ReactElement {
  return (
    <>
      <div className="text-[10px] font-medium text-amber-800 dark:text-amber-200 text-left capitalize">
        {rc.role}
      </div>
      <CoverageCell active={rc.proposing} label={`${rc.role} proposing`} />
      <CoverageCell active={rc.reviewing} label={`${rc.role} reviewing`} />
      <CoverageCell active={rc.commenting} label={`${rc.role} commenting`} />
    </>
  );
}

function CoverageCell({
  active,
  label,
}: {
  active: boolean;
  label: string;
}): React.ReactElement {
  return (
    <div
      className={`w-4 h-4 mx-auto rounded-sm ${
        active
          ? 'bg-green-400 dark:bg-green-500'
          : 'bg-neutral-200 dark:bg-neutral-700'
      }`}
      role="img"
      aria-label={`${label}: ${active ? 'active' : 'inactive'}`}
    />
  );
}

function ResponsivenessCard({
  assessment,
}: {
  assessment: GovernanceBalanceAssessment;
}): React.ReactElement {
  const { responsiveness } = assessment;
  const meta = RESPONSIVENESS_STYLES[responsiveness.bucket];

  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-lg p-4 border border-amber-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200">
          Responsiveness
        </h4>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}
        >
          {meta.label}
        </span>
      </div>

      {responsiveness.medianHours !== null && (
        <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-1">
          {responsiveness.medianHours}h
          <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-1">
            median
          </span>
        </p>
      )}

      <p className="text-xs text-amber-600 dark:text-amber-400">
        {responsiveness.reason}
      </p>

      {responsiveness.totalProposals > 0 && (
        <p className="mt-1 text-[10px] text-amber-500 dark:text-amber-500">
          {responsiveness.proposalsWithResponses} of{' '}
          {responsiveness.totalProposals} proposals had non-author responses
        </p>
      )}
    </div>
  );
}
