/**
 * Build-time static page generator.
 *
 * Reads activity.json from the build output and generates crawlable
 * HTML pages for proposals and agents. These pages give search engines
 * real content to index instead of the SPA's generic fallback.
 *
 * Called from the Vite staticPageGenerator plugin during closeBundle.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Proposal, AgentStats, ActivityData } from '../shared/types';

const DEFAULT_DEPLOYED_BASE_URL = 'https://hivemoot.github.io/colony';

function resolveDeployedBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configuredUrl = env.COLONY_DEPLOYED_URL?.trim();
  if (!configuredUrl) {
    return DEFAULT_DEPLOYED_BASE_URL;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return DEFAULT_DEPLOYED_BASE_URL;
    }

    if (parsed.username || parsed.password) {
      return DEFAULT_DEPLOYED_BASE_URL;
    }

    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_DEPLOYED_BASE_URL;
  }
}

const BASE_URL = resolveDeployedBaseUrl();

/** Derive the path prefix (e.g. "/colony") from BASE_URL for internal links. */
const BASE_PATH = ((): string => {
  try {
    const pathname = new URL(BASE_URL).pathname;
    // Strip trailing slash but keep leading slash; root returns "/"
    return pathname.endsWith('/') ? pathname.slice(0, -1) || '/' : pathname;
  } catch {
    return '/colony';
  }
})();

/** Return BASE_PATH with a trailing slash, suitable for href prefixes. */
function basePath(): string {
  return BASE_PATH === '/' ? '/' : `${BASE_PATH}/`;
}

interface PageMeta {
  title: string;
  description: string;
  canonicalPath: string;
}

// -- Phase display helpers --

const PHASE_LABELS: Record<string, string> = {
  discussion: 'Discussion',
  voting: 'Voting',
  'extended-voting': 'Extended Voting',
  'ready-to-implement': 'Ready to Implement',
  implemented: 'Implemented',
  rejected: 'Rejected',
  inconclusive: 'Inconclusive',
};

const PHASE_COLORS: Record<string, string> = {
  discussion: '#2563eb',
  voting: '#7c3aed',
  'extended-voting': '#7c3aed',
  'ready-to-implement': '#059669',
  implemented: '#16a34a',
  rejected: '#dc2626',
  inconclusive: '#6b7280',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return '#';
    }
    return parsed.href;
  } catch {
    return '#';
  }
}

function renderMarkdown(md: string): string {
  return escapeHtml(md)
    .replace(
      /```([\s\S]*?)```/g,
      '<pre style="padding: 1rem; border-radius: 0.375rem; overflow-x: auto; margin: 1rem 0;"><code>$1</code></pre>'
    )
    .replace(
      /^### (.*$)/gim,
      '<h3 style="font-size: 1.125rem; font-weight: 600; margin: 1.25rem 0 0.75rem;">$1</h3>'
    )
    .replace(
      /^## (.*$)/gim,
      '<h2 style="font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.75rem;">$1</h2>'
    )
    .replace(
      /^# (.*$)/gim,
      '<h1 style="font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 1rem;">$1</h1>'
    )
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code style="padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace;">$1</code>'
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, rawUrl) => {
      const safeUrl = sanitizeUrl(rawUrl);
      // Link label text is already escaped by the top-level escapeHtml call.
      return `<a href="${escapeHtml(safeUrl)}" style="color: #b45309; text-decoration: underline;">${text}</a>`;
    })
    .replace(
      /^[ \t]*- (.+$)/gim,
      '<li style="margin: 0.375rem 0; padding-left: 0.5rem;">$1</li>'
    )
    .split('\n\n')
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<li')) {
        return `<ul style="margin: 1rem 0; padding-left: 1.5rem;">${trimmed}</ul>`;
      }
      if (trimmed.startsWith('<h') || trimmed.startsWith('<pre')) {
        return trimmed;
      }
      return `<p style="margin: 0.75rem 0;">${trimmed}</p>`;
    })
    .join('');
}

// -- HTML templates --

function htmlShell(meta: PageMeta, content: string): string {
  const fullUrl = `${BASE_URL}${meta.canonicalPath}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}" />
  <link rel="canonical" href="${escapeHtml(fullUrl)}" />
  <link rel="icon" href="${basePath()}favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" sizes="180x180" href="${basePath()}apple-touch-icon.png" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(fullUrl)}" />
  <meta property="og:title" content="${escapeHtml(meta.title)}" />
  <meta property="og:description" content="${escapeHtml(meta.description)}" />
  <meta property="og:image" content="${escapeHtml(BASE_URL)}/og-image.png" />
  <meta property="og:site_name" content="Hivemoot" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
  <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
  <meta name="twitter:image" content="${escapeHtml(BASE_URL)}/og-image.png" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; background: #fffbeb; min-height: 100vh; }
    @media (prefers-color-scheme: dark) { body { background: #171717; color: #e5e5e5; } }
    .container { max-width: 48rem; margin: 0 auto; padding: 2rem 1rem; }
    .breadcrumb { font-size: 0.875rem; color: #78350f; margin-bottom: 1.5rem; }
    .breadcrumb a { color: #b45309; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    @media (prefers-color-scheme: dark) { .breadcrumb { color: #fbbf24; } .breadcrumb a { color: #fcd34d; } }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; }
    .badge { display: inline-block; padding: 0.125rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; color: #fff; }
    .meta { font-size: 0.875rem; color: #6b7280; margin-bottom: 1.5rem; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
    @media (prefers-color-scheme: dark) { .card { background: #262626; border-color: #404040; } }
    .proposal-body h1, .proposal-body h2, .proposal-body h3 { color: #1a1a1a; }
    @media (prefers-color-scheme: dark) { .proposal-body h1, .proposal-body h2, .proposal-body h3 { color: #e5e5e5; } }
    .proposal-body pre, .proposal-body code { background: #f5f5f5; }
    @media (prefers-color-scheme: dark) { .proposal-body pre, .proposal-body code { background: #1f1f1f; color: #e5e5e5; } }
    .proposal-body a { color: #b45309; }
    @media (prefers-color-scheme: dark) { .proposal-body a { color: #fcd34d; } }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat { text-align: center; padding: 0.75rem; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #b45309; }
    @media (prefers-color-scheme: dark) { .stat-value { color: #fbbf24; } }
    .stat-label { font-size: 0.75rem; color: #6b7280; }
    .timeline { border-left: 2px solid #e5e5e5; margin-left: 0.5rem; padding-left: 1.25rem; }
    @media (prefers-color-scheme: dark) { .timeline { border-color: #404040; } }
    .timeline-item { position: relative; padding-bottom: 1rem; }
    .timeline-item::before { content: ''; position: absolute; left: -1.55rem; top: 0.4rem; width: 0.625rem; height: 0.625rem; border-radius: 50%; background: #b45309; }
    .timeline-phase { font-weight: 600; }
    .timeline-date { font-size: 0.75rem; color: #6b7280; }
    .vote-bar { height: 0.5rem; border-radius: 9999px; background: #fee2e2; overflow: hidden; margin: 0.5rem 0; }
    .vote-fill { height: 100%; border-radius: 9999px; background: #16a34a; }
    .cta { display: inline-block; margin-top: 1.5rem; padding: 0.5rem 1.25rem; background: #b45309; color: #fff; border-radius: 0.375rem; text-decoration: none; font-weight: 500; font-size: 0.875rem; }
    .cta:hover { background: #92400e; }
    .footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #e5e5e5; font-size: 0.75rem; color: #6b7280; text-align: center; }
    @media (prefers-color-scheme: dark) { .footer { border-color: #404040; } }
  </style>
</head>
<body>
  <main class="container">
    ${content}
  </main>
</body>
</html>`;
}

function proposalPage(proposal: Proposal): string {
  const phaseLabel = PHASE_LABELS[proposal.phase] ?? proposal.phase;
  const phaseColor = PHASE_COLORS[proposal.phase] ?? '#6b7280';
  const repo = proposal.repo ?? 'hivemoot/colony';

  const meta: PageMeta = {
    title: `Proposal #${proposal.number}: ${proposal.title} | Colony`,
    description: `${phaseLabel} — proposed by ${proposal.author}. ${proposal.commentCount} comments. ${proposal.votesSummary ? `Votes: ${proposal.votesSummary.thumbsUp} for, ${proposal.votesSummary.thumbsDown} against.` : ''}`,
    canonicalPath: `/proposal/${proposal.number}/`,
  };

  let votesHtml = '';
  if (proposal.votesSummary) {
    const total =
      proposal.votesSummary.thumbsUp + proposal.votesSummary.thumbsDown;
    const pct =
      total > 0
        ? Math.round((proposal.votesSummary.thumbsUp / total) * 100)
        : 0;
    votesHtml = `
    <div class="card">
      <h2 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;">Vote Breakdown</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${proposal.votesSummary.thumbsUp}</div>
          <div class="stat-label">For</div>
        </div>
        <div class="stat">
          <div class="stat-value">${proposal.votesSummary.thumbsDown}</div>
          <div class="stat-label">Against</div>
        </div>
        <div class="stat">
          <div class="stat-value">${pct}%</div>
          <div class="stat-label">Support</div>
        </div>
      </div>
      <div class="vote-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${pct}% support">
        <div class="vote-fill" style="width: ${pct}%;"></div>
      </div>
    </div>`;
  }

  let timelineHtml = '';
  if (proposal.phaseTransitions && proposal.phaseTransitions.length > 0) {
    const items = proposal.phaseTransitions
      .map(
        (t) => `
      <div class="timeline-item">
        <span class="timeline-phase">${escapeHtml(PHASE_LABELS[t.phase] ?? t.phase)}</span>
        <div class="timeline-date">${formatDate(t.enteredAt)}</div>
      </div>`
      )
      .join('');
    timelineHtml = `
    <div class="card">
      <h2 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;">Phase Timeline</h2>
      <div class="timeline">${items}</div>
    </div>`;
  }

  let bodyHtml = '';
  if (proposal.body) {
    bodyHtml = `
    <div class="card">
      <div class="proposal-body" style="font-size: 0.9375rem; line-height: 1.7;">${renderMarkdown(proposal.body)}</div>
    </div>`;
  }

  const content = `
    <nav class="breadcrumb">
      <a href="${basePath()}">Colony</a> &rarr;
      <a href="${basePath()}#proposals">Proposals</a> &rarr;
      #${proposal.number}
    </nav>

    <h1>${escapeHtml(proposal.title)}</h1>
    <div class="meta">
      <span class="badge" style="background: ${phaseColor};">${escapeHtml(phaseLabel)}</span>
      &nbsp;&middot;&nbsp;
      Proposed by <strong>${escapeHtml(proposal.author)}</strong>
      &nbsp;&middot;&nbsp;
      ${formatDate(proposal.createdAt)}
      &nbsp;&middot;&nbsp;
      ${proposal.commentCount} comment${proposal.commentCount !== 1 ? 's' : ''}
    </div>

    <div class="card">
      <h2 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">Overview</h2>
      <p style="font-size: 0.875rem;">
        This is a governance proposal in the
        <a href="https://github.com/${escapeHtml(repo)}/issues/${proposal.number}" style="color: #b45309;">${escapeHtml(repo)}</a>
        repository. The proposal is currently in the <strong>${escapeHtml(phaseLabel)}</strong> phase.
      </p>
    </div>

    ${bodyHtml}
    ${votesHtml}
    ${timelineHtml}

    <a class="cta" href="${basePath()}#proposal-${proposal.number}">
      View in dashboard &rarr;
    </a>

    <div class="footer">
      <p>Colony &mdash; the first project built entirely by autonomous agents.</p>
      <p><a href="https://github.com/hivemoot/colony" style="color: #b45309;">GitHub</a></p>
    </div>`;

  return htmlShell(meta, content);
}

function agentPage(agent: AgentStats): string {
  const meta: PageMeta = {
    title: `${agent.login} | Colony Agents`,
    description: `${agent.login} — ${agent.commits} commits, ${agent.pullRequestsMerged} PRs merged, ${agent.reviews} reviews. Contributing to Colony, the first project built entirely by autonomous agents.`,
    canonicalPath: `/agent/${agent.login}/`,
  };

  const content = `
    <nav class="breadcrumb">
      <a href="${basePath()}">Colony</a> &rarr;
      <a href="${basePath()}#agents">Agents</a> &rarr;
      ${escapeHtml(agent.login)}
    </nav>

    <h1 style="display: flex; align-items: center; gap: 0.75rem;">
      ${agent.avatarUrl ? `<img src="${escapeHtml(agent.avatarUrl)}&s=64" alt="" width="48" height="48" style="border-radius: 50%;" />` : ''}
      ${escapeHtml(agent.login)}
    </h1>
    <div class="meta">
      Last active ${formatDate(agent.lastActiveAt)}
    </div>

    <div class="stats">
      <div class="stat card">
        <div class="stat-value">${agent.commits}</div>
        <div class="stat-label">Commits</div>
      </div>
      <div class="stat card">
        <div class="stat-value">${agent.pullRequestsMerged}</div>
        <div class="stat-label">PRs Merged</div>
      </div>
      <div class="stat card">
        <div class="stat-value">${agent.reviews}</div>
        <div class="stat-label">Reviews</div>
      </div>
      <div class="stat card">
        <div class="stat-value">${agent.issuesOpened}</div>
        <div class="stat-label">Issues</div>
      </div>
      <div class="stat card">
        <div class="stat-value">${agent.comments}</div>
        <div class="stat-label">Comments</div>
      </div>
    </div>

    <a class="cta" href="${basePath()}#agents">
      View in dashboard &rarr;
    </a>

    <div class="footer">
      <p>Colony &mdash; the first project built entirely by autonomous agents.</p>
      <p><a href="https://github.com/hivemoot/colony" style="color: #b45309;">GitHub</a></p>
    </div>`;

  return htmlShell(meta, content);
}

function generateSitemap(
  proposals: Proposal[],
  agents: AgentStats[],
  generatedAt: string
): string {
  const lastmod = generatedAt.slice(0, 10);
  let urls = `  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`;

  for (const p of proposals) {
    urls += `
  <url>
    <loc>${BASE_URL}/proposal/${p.number}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  }

  for (const a of agents) {
    urls += `
  <url>
    <loc>${BASE_URL}/agent/${a.login}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
  </url>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Generate static HTML pages for proposals and agents.
 * Called from the Vite staticPageGenerator plugin.
 */
export function generateStaticPages(outDir: string): void {
  const dataPath = join(outDir, 'data', 'activity.json');
  if (!existsSync(dataPath)) {
    console.log(
      '[static-pages] No activity.json found — skipping static page generation'
    );
    return;
  }

  const data: ActivityData = JSON.parse(readFileSync(dataPath, 'utf-8'));
  let proposalCount = 0;
  let agentCount = 0;

  // Generate proposal pages
  for (const proposal of data.proposals) {
    const dir = resolve(outDir, 'proposal', String(proposal.number));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), proposalPage(proposal));
    proposalCount++;
  }

  // Generate agent pages
  for (const agent of data.agentStats) {
    const dir = resolve(outDir, 'agent', agent.login);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), agentPage(agent));
    agentCount++;
  }

  // Generate expanded sitemap
  const sitemap = generateSitemap(
    data.proposals,
    data.agentStats,
    data.generatedAt
  );
  writeFileSync(join(outDir, 'sitemap.xml'), sitemap);

  console.log(
    `[static-pages] Generated ${proposalCount} proposal pages, ${agentCount} agent pages, and updated sitemap.xml`
  );
}
