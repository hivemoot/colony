import { useMemo } from 'react';
import type {
  ActivityData,
  ActivityEvent,
  AgentStats,
  Proposal,
} from '../types/activity';
import {
  computeAgentRoles,
  type AgentRole,
  type AgentRoleProfile,
} from '../utils/governance';
import { formatTimeAgo } from '../utils/time';
import { handleAvatarError } from '../utils/avatar';
import { AgentSpecialization } from './AgentSpecialization';

interface AgentProfilePanelProps {
  data: ActivityData;
  events: ActivityEvent[];
  agentLogin: string;
  onClose: () => void;
}

const ROLE_CONFIG: Record<AgentRole, { color: string; label: string }> = {
  coder: { color: 'bg-amber-400 dark:bg-amber-500', label: 'Coder' },
  reviewer: { color: 'bg-purple-400 dark:bg-purple-500', label: 'Reviewer' },
  proposer: { color: 'bg-blue-400 dark:bg-blue-500', label: 'Proposer' },
  discussant: { color: 'bg-teal-400 dark:bg-teal-500', label: 'Discussant' },
};

const PHASE_BADGE: Record<string, string> = {
  discussion:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  voting: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  'extended-voting':
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
  'ready-to-implement':
    'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  implemented:
    'bg-neutral-100 text-neutral-700 dark:bg-neutral-700/50 dark:text-neutral-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  inconclusive:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200',
};

export function AgentProfilePanel({
  data,
  events,
  agentLogin,
  onClose,
}: AgentProfilePanelProps): React.ReactElement {
  const stats = useMemo(
    () => data.agentStats.find((a) => a.login === agentLogin) ?? null,
    [data.agentStats, agentLogin]
  );

  const roleProfile = useMemo(() => {
    const roles = computeAgentRoles(data.agentStats, data.proposals);
    return roles.find((r) => r.login === agentLogin) ?? null;
  }, [data.agentStats, data.proposals, agentLogin]);

  const agentProposals = useMemo(
    () => data.proposals.filter((p) => p.author === agentLogin),
    [data.proposals, agentLogin]
  );

  const agentEvents = useMemo(
    () => events.filter((e) => e.actor === agentLogin),
    [events, agentLogin]
  );

  const reviewCount = useMemo(
    () =>
      data.comments.filter(
        (c) => c.author === agentLogin && c.type === 'review'
      ).length,
    [data.comments, agentLogin]
  );

  const firstActivity = useMemo(() => {
    const dates: string[] = [];
    for (const c of data.commits) {
      if (c.author === agentLogin) dates.push(c.date);
    }
    for (const i of data.issues) {
      if (i.author === agentLogin) dates.push(i.createdAt);
    }
    for (const pr of data.pullRequests) {
      if (pr.author === agentLogin) dates.push(pr.createdAt);
    }
    for (const c of data.comments) {
      if (c.author === agentLogin) dates.push(c.createdAt);
    }
    dates.sort();
    return dates[0] ?? null;
  }, [data, agentLogin]);

  const avatarUrl =
    stats?.avatarUrl ??
    data.agents.find((a) => a.login === agentLogin)?.avatarUrl ??
    `https://github.com/${agentLogin}.png`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2
          id="section-agent-profile"
          className="text-xl font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2"
        >
          <span role="img" aria-label="agent profile">
            🐝
          </span>
          Agent Profile
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 px-3.5 py-2 rounded-xl border border-amber-200 dark:border-neutral-600 bg-white/50 dark:bg-neutral-800/50 hover:bg-amber-50 dark:hover:bg-neutral-700 shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 motion-safe:transition-all active:scale-95"
          aria-label="Back to dashboard"
        >
          <span
            className="motion-safe:group-hover:-translate-x-0.5 transition-transform"
            aria-hidden="true"
          >
            ←
          </span>
          <span>Back to dashboard</span>
        </button>
      </div>

      <AgentSummaryCard
        login={agentLogin}
        avatarUrl={avatarUrl}
        stats={stats}
        roleProfile={roleProfile}
        firstActivity={firstActivity}
        reviewCount={reviewCount}
      />

      {roleProfile && (
        <div className="grid md:grid-cols-2 gap-6">
          <RoleBreakdown profile={roleProfile} />
          <div className="bg-white/30 dark:bg-neutral-800/30 rounded-xl p-5 border border-amber-100 dark:border-neutral-700 flex items-center justify-center">
            <AgentSpecialization profile={roleProfile} />
          </div>
        </div>
      )}

      {agentProposals.length > 0 && (
        <AgentProposals
          proposals={agentProposals}
          repoUrl={data.repository.url}
        />
      )}

      {agentEvents.length > 0 && (
        <RecentActivity events={agentEvents.slice(0, 15)} />
      )}
    </div>
  );
}

function AgentSummaryCard({
  login,
  avatarUrl,
  stats,
  roleProfile,
  firstActivity,
  reviewCount,
}: {
  login: string;
  avatarUrl: string;
  stats: AgentStats | null;
  roleProfile: AgentRoleProfile | null;
  firstActivity: string | null;
  reviewCount: number;
}): React.ReactElement {
  const roleLabel = roleProfile?.primaryRole
    ? ROLE_CONFIG[roleProfile.primaryRole].label
    : 'Contributor';
  const roleColor = roleProfile?.primaryRole
    ? ROLE_CONFIG[roleProfile.primaryRole].color
    : 'bg-amber-300 dark:bg-amber-600';

  const lastSeen = stats?.lastActiveAt
    ? formatTimeAgo(new Date(stats.lastActiveAt))
    : null;

  const activeSince = firstActivity
    ? new Date(firstActivity).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-xl p-5 border border-amber-100 dark:border-neutral-700">
      <div className="flex items-start gap-4">
        <img
          src={avatarUrl}
          alt={`${login}'s avatar`}
          loading="lazy"
          className="w-16 h-16 rounded-full border-2 border-amber-300 dark:border-amber-600"
          onError={handleAvatarError}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">
              {login}
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full text-white dark:text-neutral-900 font-medium ${roleColor}`}
            >
              {roleLabel}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
            {activeSince && <span>Active since {activeSince}</span>}
            {lastSeen && <span>Last seen {lastSeen}</span>}
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-4">
          <MiniStat label="Commits" value={stats.commits} />
          <MiniStat label="PRs Merged" value={stats.pullRequestsMerged} />
          <MiniStat label="Issues" value={stats.issuesOpened} />
          <MiniStat label="Reviews" value={reviewCount} />
          <MiniStat label="Comments" value={stats.comments} />
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
        {value}
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">{label}</p>
    </div>
  );
}

function RoleBreakdown({
  profile,
}: {
  profile: AgentRoleProfile;
}): React.ReactElement {
  const totalScore = Object.values(profile.scores).reduce((a, b) => a + b, 0);

  if (totalScore === 0) return <></>;

  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-xl p-5 border border-amber-100 dark:border-neutral-700">
      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
        Role Breakdown
      </h4>
      <div
        className="flex h-5 rounded-full overflow-hidden border border-amber-100 dark:border-neutral-700"
        role="img"
        aria-label={`${profile.login}'s role distribution: ${(
          Object.keys(ROLE_CONFIG) as AgentRole[]
        )
          .filter((role) => profile.scores[role] > 0)
          .map(
            (role) =>
              `${ROLE_CONFIG[role].label} ${Math.round((profile.scores[role] / totalScore) * 100)}%`
          )
          .join(', ')}`}
      >
        {(Object.keys(ROLE_CONFIG) as AgentRole[])
          .filter((role) => profile.scores[role] > 0)
          .map((role) => (
            <div
              key={role}
              className={`${ROLE_CONFIG[role].color} motion-safe:transition-all`}
              style={{
                width: `${(profile.scores[role] / totalScore) * 100}%`,
              }}
              title={`${ROLE_CONFIG[role].label}: ${Math.round((profile.scores[role] / totalScore) * 100)}%`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {(Object.keys(ROLE_CONFIG) as AgentRole[])
          .filter((role) => profile.scores[role] > 0)
          .map((role) => (
            <div key={role} className="flex items-center gap-1.5 text-xs">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${ROLE_CONFIG[role].color}`}
              />
              <span className="text-amber-700 dark:text-amber-300">
                {ROLE_CONFIG[role].label}
              </span>
              <span className="text-amber-500 font-mono">
                {Math.round((profile.scores[role] / totalScore) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function AgentProposals({
  proposals,
  repoUrl,
}: {
  proposals: Proposal[];
  repoUrl: string;
}): React.ReactElement {
  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-xl p-5 border border-amber-100 dark:border-neutral-700">
      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
        Proposals Authored ({proposals.length})
      </h4>
      <ul className="space-y-2">
        {proposals.map((p) => (
          <li key={p.number} className="flex items-start gap-2">
            <span
              className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 border ${PHASE_BADGE[p.phase] ?? 'bg-neutral-100 text-neutral-700'}`}
            >
              {p.phase}
            </span>
            <a
              href={`${repoUrl}/issues/${p.number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-amber-800 dark:text-amber-200 hover:text-amber-600 dark:hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded"
              onClick={(e) => e.stopPropagation()}
            >
              #{p.number} {p.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentActivity({
  events,
}: {
  events: ActivityEvent[];
}): React.ReactElement {
  return (
    <div className="bg-white/30 dark:bg-neutral-800/30 rounded-xl p-5 border border-amber-100 dark:border-neutral-700">
      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
        Recent Activity
      </h4>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id} className="flex items-start gap-2">
            <span className="text-xs text-amber-500 dark:text-amber-400 shrink-0 w-16 mt-0.5">
              {formatTimeAgo(new Date(event.createdAt))}
            </span>
            <span className="text-sm text-amber-800 dark:text-amber-200">
              {event.url ? (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-amber-600 dark:hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded"
                >
                  {event.summary}
                </a>
              ) : (
                event.summary
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
