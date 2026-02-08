import { useMemo } from 'react';
import type { ActivityData, ActivityEvent } from '../types/activity';
import {
  computeAgentProfile,
  type AgentProfileData,
} from '../utils/agent-profile';
import type { AgentRole } from '../utils/governance';
import { ActivityTimeline } from './ActivityTimeline';
import { formatTimeAgo } from '../utils/time';
import { handleAvatarError } from '../utils/avatar';

interface AgentProfilePanelProps {
  data: ActivityData;
  events: ActivityEvent[];
  selectedAgent: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<AgentRole, string> = {
  coder: 'Coder',
  reviewer: 'Reviewer',
  proposer: 'Proposer',
  discussant: 'Discussant',
};

const ROLE_COLORS: Record<AgentRole, string> = {
  coder: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  reviewer:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  proposer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  discussant:
    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
};

const ROLE_BAR_COLORS: Record<AgentRole, string> = {
  coder: 'bg-amber-500',
  reviewer: 'bg-purple-500',
  proposer: 'bg-blue-500',
  discussant: 'bg-teal-500',
};

const PHASE_BADGE: Record<string, string> = {
  discussion:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  voting: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  'ready-to-implement':
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  implemented:
    'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  inconclusive:
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
};

export function AgentProfilePanel({
  data,
  events,
  selectedAgent,
  onClose,
}: AgentProfilePanelProps): React.ReactElement {
  const profile = useMemo(
    () => computeAgentProfile(data, selectedAgent),
    [data, selectedAgent]
  );

  const filteredEvents = useMemo(
    () => events.filter((e) => e.actor === selectedAgent),
    [events, selectedAgent]
  );

  if (!profile) {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-6">
        <BackButton onClose={onClose} />
        <p className="text-sm text-amber-600 dark:text-amber-400 italic text-center">
          No profile data available for {selectedAgent}
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-6xl mx-auto space-y-6"
      role="region"
      aria-label={`${selectedAgent} profile`}
    >
      <BackButton onClose={onClose} />
      <AgentSummaryCard profile={profile} />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-4">
            Proposals ({profile.proposals.length})
          </h3>
          {profile.proposals.length > 0 ? (
            <ul
              className="space-y-3"
              aria-label={`Proposals by ${selectedAgent}`}
            >
              {profile.proposals.map((p) => (
                <li key={p.number} className="flex items-start gap-2">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${PHASE_BADGE[p.phase] ?? ''}`}
                  >
                    {p.phase}
                  </span>
                  <a
                    href={`${data.repository.url}/issues/${p.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-amber-900 dark:text-amber-100 hover:text-amber-600 dark:hover:text-amber-200 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800"
                  >
                    #{p.number} {p.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400 italic">
              No proposals yet
            </p>
          )}
        </section>

        <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-4">
            Collaborators
          </h3>
          {profile.collaborators.length > 0 ? (
            <ul
              className="space-y-3"
              aria-label={`Collaborators of ${selectedAgent}`}
            >
              {profile.collaborators.slice(0, 5).map((c) => (
                <li key={c.login} className="flex items-center gap-3">
                  <img
                    src={`https://github.com/${c.login}.png`}
                    alt=""
                    loading="lazy"
                    className="w-6 h-6 rounded-full border border-amber-200 dark:border-neutral-600"
                    onError={handleAvatarError}
                  />
                  <a
                    href={`https://github.com/${c.login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-amber-900 dark:text-amber-100 hover:text-amber-600 dark:hover:text-amber-200 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800"
                  >
                    {c.login}
                  </a>
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {c.interactions}{' '}
                    {c.interactions === 1 ? 'interaction' : 'interactions'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400 italic">
              No collaboration data yet
            </p>
          )}
        </section>
      </div>

      <section className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600">
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-4">
          Recent Activity
        </h3>
        <ActivityTimeline events={filteredEvents.slice(0, 10)} />
      </section>
    </div>
  );
}

function BackButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 motion-safe:transition-colors rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800"
    >
      <span aria-hidden="true">&larr;</span> Back to Dashboard
    </button>
  );
}

function AgentSummaryCard({
  profile,
}: {
  profile: AgentProfileData;
}): React.ReactElement {
  const { stats, roleProfile } = profile;
  const totalContributions =
    stats.commits +
    stats.pullRequestsMerged +
    stats.issuesOpened +
    stats.reviews +
    stats.comments;

  return (
    <section
      className="bg-white/50 dark:bg-neutral-700/50 rounded-xl p-6 backdrop-blur-sm border border-amber-200 dark:border-neutral-600"
      aria-label={`${profile.login} summary`}
    >
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <img
          src={profile.avatarUrl || `https://github.com/${profile.login}.png`}
          alt={`${profile.login}'s avatar`}
          loading="lazy"
          className="w-16 h-16 rounded-full border-2 border-amber-300 dark:border-amber-600"
          onError={handleAvatarError}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <a
              href={`https://github.com/${profile.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold text-amber-900 dark:text-amber-100 hover:text-amber-600 dark:hover:text-amber-200 motion-safe:transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800"
            >
              {profile.login}
            </a>
            {roleProfile.primaryRole && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[roleProfile.primaryRole]}`}
              >
                {ROLE_LABELS[roleProfile.primaryRole]}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-600 dark:text-amber-400 mb-3">
            {profile.activeSince && (
              <span>
                Active since{' '}
                <time dateTime={profile.activeSince}>
                  {new Date(profile.activeSince).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </time>
              </span>
            )}
            <span>
              Last seen{' '}
              <time dateTime={stats.lastActiveAt}>
                {formatTimeAgo(new Date(stats.lastActiveAt))}
              </time>
            </span>
            <span>{totalContributions} total contributions</span>
          </div>

          <RoleDistribution scores={roleProfile.scores} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mt-4">
        <StatBadge
          label="Commits"
          count={stats.commits}
          colorClass="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
        />
        <StatBadge
          label="PRs Merged"
          count={stats.pullRequestsMerged}
          colorClass="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
        />
        <StatBadge
          label="Reviews"
          count={stats.reviews}
          colorClass="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
        />
        <StatBadge
          label="Issues"
          count={stats.issuesOpened}
          colorClass="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
        />
        <StatBadge
          label="Comments"
          count={stats.comments}
          colorClass="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
        />
      </div>
    </section>
  );
}

function StatBadge({
  label,
  count,
  colorClass,
}: {
  label: string;
  count: number;
  colorClass: string;
}): React.ReactElement {
  return (
    <div className={`rounded-lg p-2 text-center ${colorClass}`}>
      <p className="text-lg font-bold font-mono">{count}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function RoleDistribution({
  scores,
}: {
  scores: Record<AgentRole, number>;
}): React.ReactElement {
  const roles = Object.entries(scores) as Array<[AgentRole, number]>;
  const maxScore = Math.max(...roles.map(([, s]) => s), 0.01);

  return (
    <div
      className="flex gap-1 h-2 rounded-full overflow-hidden"
      role="img"
      aria-label={`Role distribution: ${roles.map(([role, score]) => `${ROLE_LABELS[role]} ${Math.round((score / maxScore) * 100)}%`).join(', ')}`}
    >
      {roles.map(([role, score]) => {
        const pct = (score / maxScore) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={role}
            className={`${ROLE_BAR_COLORS[role]} motion-safe:transition-all`}
            style={{ width: `${pct}%` }}
            title={`${ROLE_LABELS[role]}: ${Math.round(pct)}%`}
          />
        );
      })}
    </div>
  );
}
