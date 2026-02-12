import { useMemo, useState } from 'react';
import type { Proposal, PullRequest, Comment } from '../types/activity';
import { handleAvatarError, getGitHubAvatarUrl } from '../utils/avatar';
import { formatDuration, formatTimeAgo } from '../utils/time';
import { buildDecisionSnapshot } from '../utils/decision-explorer';

interface ProposalListProps {
  proposals: Proposal[];
  pullRequests?: PullRequest[];
  comments?: Comment[];
  repoUrl: string;
  filteredAgent?: string | null;
}

export function ProposalList({
  proposals,
  pullRequests = [],
  comments = [],
  repoUrl,
  filteredAgent,
}: ProposalListProps): React.ReactElement {
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    null
  );

  const selectedProposal = useMemo(
    () =>
      proposals.find((p) => getProposalIdentity(p) === selectedProposalId) ??
      null,
    [proposals, selectedProposalId]
  );

  const snapshot = useMemo(
    () =>
      selectedProposal
        ? buildDecisionSnapshot(selectedProposal, pullRequests)
        : null,
    [selectedProposal, pullRequests]
  );

  const proposalComments = useMemo(
    () =>
      selectedProposal
        ? comments
            .filter((c) => {
              const sameRepo =
                (c.repo ?? null) === (selectedProposal.repo ?? null);
              return (
                c.issueOrPrNumber === selectedProposal.number &&
                c.type === 'issue' &&
                sameRepo
              );
            })
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
            )
        : [],
    [selectedProposal, comments]
  );

  if (proposals.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        {filteredAgent
          ? `No proposals from ${filteredAgent}`
          : 'No active proposals'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {proposals.map((proposal) => {
          const proposalId = getProposalIdentity(proposal);
          const explorerId = getDecisionExplorerId(proposal);
          const isSelected = proposalId === selectedProposalId;
          const proposalRepoUrl = getRepositoryUrl(proposal.repo, repoUrl);

          return (
            <article
              key={proposalId}
              className={`bg-white/40 dark:bg-neutral-800/40 border rounded-lg motion-safe:transition-colors ${
                isSelected
                  ? 'border-amber-400 dark:border-amber-500'
                  : 'border-amber-200 dark:border-neutral-600'
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setSelectedProposalId(isSelected ? null : proposalId)
                }
                aria-expanded={isSelected}
                aria-controls={explorerId}
                className="w-full text-left p-4 hover:bg-white/60 dark:hover:bg-neutral-800/60 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
                    #{proposal.number}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <LifecycleDuration proposal={proposal} />
                    <PhaseBadge phase={proposal.phase} />
                  </div>
                </div>
                <h3
                  title={proposal.title}
                  className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-3 line-clamp-2"
                >
                  {proposal.title}
                </h3>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-amber-100/50 dark:border-neutral-700/50">
                  <div className="flex items-center gap-2">
                    <img
                      src={getGitHubAvatarUrl(proposal.author)}
                      alt=""
                      loading="lazy"
                      className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                      onError={handleAvatarError}
                    />
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      @{proposal.author}
                    </span>
                    <span
                      className="text-amber-600 dark:text-amber-400"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    <time
                      dateTime={proposal.createdAt}
                      className="text-xs text-amber-500 dark:text-amber-400"
                    >
                      {formatTimeAgo(new Date(proposal.createdAt))}
                    </time>
                  </div>
                  <div className="flex items-center gap-3">
                    {proposal.votesSummary && (
                      <div className="flex items-center gap-2 text-[11px] font-medium">
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                          <span role="img" aria-label="votes for">
                            👍
                          </span>{' '}
                          {proposal.votesSummary.thumbsUp}
                        </span>
                        <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
                          <span role="img" aria-label="votes against">
                            👎
                          </span>{' '}
                          {proposal.votesSummary.thumbsDown}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <span role="img" aria-label="comments">
                        💬
                      </span>{' '}
                      {proposal.commentCount}
                    </span>
                  </div>
                </div>
              </button>
              <div className="px-4 pb-3 flex items-center justify-between text-xs">
                <a
                  href={`${proposalRepoUrl}/issues/${proposal.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
                >
                  View issue
                </a>
                <span className="text-amber-600 dark:text-amber-400">
                  {isSelected
                    ? 'Hide decision explorer'
                    : 'Open decision explorer'}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {selectedProposal && snapshot && (
        <section
          id={getDecisionExplorerId(selectedProposal)}
          aria-label={`Decision explorer for proposal #${selectedProposal.number}`}
          className="bg-white/40 dark:bg-neutral-800/40 border border-amber-300 dark:border-neutral-600 rounded-lg p-4"
        >
          <div className="flex flex-wrap justify-between gap-2 mb-4">
            <h3 className="text-base font-semibold text-amber-900 dark:text-amber-100">
              Decision Explorer: #{selectedProposal.number}
            </h3>
            <PhaseBadge phase={selectedProposal.phase} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  Timeline
                </h4>
                <ol className="space-y-2">
                  {snapshot.timeline.map((item, index) => (
                    <li
                      key={`${item.phase}-${item.enteredAt}-${index}`}
                      className="text-sm border-l-2 border-amber-300 dark:border-neutral-500 pl-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-amber-900 dark:text-amber-100 capitalize">
                          {item.phase.replace(/-/g, ' ')}
                        </span>
                        <time
                          dateTime={item.enteredAt}
                          className="text-xs text-amber-600 dark:text-amber-400"
                        >
                          {formatTimeAgo(new Date(item.enteredAt))}
                        </time>
                        {item.durationToNext && (
                          <span className="text-xs font-mono text-amber-700 dark:text-amber-300">
                            ({item.durationToNext})
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Discussion
                  </h4>
                  <a
                    href={`${getRepositoryUrl(selectedProposal.repo, repoUrl)}/issues/${selectedProposal.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
                  >
                    View proposal thread
                  </a>
                </div>
                {proposalComments.length > 0 ? (
                  <ul className="space-y-4">
                    {proposalComments.map((comment) => {
                      const systemComment = isSystemComment(comment);
                      const commentKey = `${selectedProposalId ?? 'none'}:${comment.id}`;
                      const isExpanded = expandedCommentIds.has(commentKey);
                      const commentPreview = truncateCommentBody(
                        comment.body,
                        isExpanded
                      );
                      return (
                        <li key={comment.id} className="text-sm">
                          {systemComment ? (
                            <div className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 dark:border-neutral-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                              System
                            </div>
                          ) : null}
                          <div className="bg-amber-50/50 dark:bg-neutral-800/50 rounded-lg p-3 border border-amber-100/50 dark:border-neutral-700/50">
                            <div className="flex items-center gap-2 mb-2">
                              <img
                                src={getGitHubAvatarUrl(comment.author)}
                                alt=""
                                loading="lazy"
                                className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                                onError={handleAvatarError}
                              />
                              <span
                                className={`font-bold ${systemComment ? 'text-amber-700 dark:text-amber-300' : 'text-amber-900 dark:text-amber-100'}`}
                              >
                                @{comment.author}
                              </span>
                              <time
                                dateTime={comment.createdAt}
                                className="text-xs text-amber-500 dark:text-amber-400"
                              >
                                {formatTimeAgo(new Date(comment.createdAt))}
                              </time>
                              <span
                                className="text-amber-500 dark:text-amber-400"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <a
                                href={comment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
                              >
                                View on GitHub
                              </a>
                            </div>
                            <p className="text-amber-800 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                              {commentPreview}
                            </p>
                            {isCommentClampEligible(comment.body) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedCommentIds((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(commentKey)) {
                                      next.delete(commentKey);
                                    } else {
                                      next.add(commentKey);
                                    }
                                    return next;
                                  });
                                }}
                                className="mt-2 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                    No discussion recorded for this proposal yet.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  Vote Breakdown
                </h4>
                {snapshot.votes.total > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-green-700 dark:text-green-400 flex items-center gap-1">
                        👍 {snapshot.votes.thumbsUp}
                      </span>
                      <span className="text-red-700 dark:text-red-400 flex items-center gap-1">
                        👎 {snapshot.votes.thumbsDown}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-amber-100 dark:bg-neutral-700 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{
                          width: `${snapshot.votes.supportPct !== null ? Math.round(snapshot.votes.supportPct * 100) : 0}%`,
                        }}
                        role="progressbar"
                        aria-valuenow={
                          snapshot.votes.supportPct !== null
                            ? Math.round(snapshot.votes.supportPct * 100)
                            : 0
                        }
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Support percentage"
                      />
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                      Support:{' '}
                      {snapshot.votes.supportPct !== null
                        ? `${Math.round(snapshot.votes.supportPct * 100)}%`
                        : '—'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                    No recorded vote tally yet.
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  Implementation
                </h4>
                {snapshot.implementingPR ? (
                  <a
                    href={`${getRepositoryUrl(snapshot.implementingPR.repo ?? selectedProposal.repo, repoUrl)}/pull/${snapshot.implementingPR.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 hover:text-amber-950 dark:hover:text-amber-50 underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-800 rounded"
                  >
                    PR #{snapshot.implementingPR.number}
                    <span className="text-xs uppercase tracking-wide">
                      {snapshot.implementingPR.state}
                    </span>
                  </a>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                    No linked implementation PR found yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const COMMENT_PREVIEW_MAX_CHARS = 320;

function isCommentClampEligible(body: string): boolean {
  return body.length > COMMENT_PREVIEW_MAX_CHARS;
}

function truncateCommentBody(body: string, expanded: boolean): string {
  if (expanded || !isCommentClampEligible(body)) {
    return body;
  }

  return `${body.slice(0, COMMENT_PREVIEW_MAX_CHARS).trimEnd()}...`;
}

function isSystemComment(comment: Comment): boolean {
  return (
    comment.author === 'hivemoot' ||
    comment.body.trimStart().startsWith('<!-- hivemoot-metadata:')
  );
}

function getProposalIdentity(proposal: Proposal): string {
  return `${proposal.repo ?? 'local'}:${proposal.number}`;
}

function getRepositoryUrl(
  repo: string | null | undefined,
  fallbackRepoUrl: string
): string {
  return repo ? `https://github.com/${repo}` : fallbackRepoUrl;
}

function getDecisionExplorerId(proposal: Proposal): string {
  return `decision-explorer-${getProposalIdentity(proposal).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function LifecycleDuration({
  proposal,
}: {
  proposal: Proposal;
}): React.ReactElement | null {
  const transitions = proposal.phaseTransitions;
  if (!transitions || transitions.length < 2) return null;

  const first = transitions[0].enteredAt;
  const last = transitions[transitions.length - 1].enteredAt;
  const duration = formatDuration(first, last);

  if (!duration) return null;

  return (
    <span
      className="text-xs text-amber-600 dark:text-amber-400 font-mono"
      title={`Lifecycle: ${transitions.length} phases in ${duration}`}
    >
      <span role="img" aria-label="lifecycle duration">
        ⏱
      </span>{' '}
      {duration}
    </span>
  );
}

function PhaseBadge({
  phase,
}: {
  phase: Proposal['phase'];
}): React.ReactElement {
  const styles = {
    discussion:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    voting:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-200 dark:border-blue-800',
    'extended-voting':
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',
    'ready-to-implement':
      'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border-green-200 dark:border-green-800',
    implemented:
      'bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800',
    rejected:
      'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border-red-200 dark:border-red-800',
    inconclusive:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200 border-orange-200 dark:border-orange-800',
  };

  return (
    <span
      className={`text-xs uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${styles[phase]}`}
    >
      {phase.replace(/-/g, ' ')}
    </span>
  );
}
