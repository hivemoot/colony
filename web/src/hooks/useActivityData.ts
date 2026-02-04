import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActivityData, Commit, Issue, PullRequest, Agent } from '../types/activity';

export type FetchMode = 'static' | 'live';

interface UseActivityDataResult {
  data: ActivityData | null;
  loading: boolean;
  error: string | null;
  mode: FetchMode;
  setMode: (mode: FetchMode) => void;
  lastFetched: Date | null;
  isRateLimited: boolean;
  refresh: () => Promise<void>;
}

const POLLING_INTERVAL = 60000; // 60 seconds

export function useActivityData(): UseActivityDataResult {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<FetchMode>('static');
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const etagRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const repositoryRef = useRef<{ owner: string; name: string } | null>(null);

  const fetchStaticData = useCallback(async () => {
    try {
      const basePath = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${basePath}data/activity.json`, {
        cache: 'no-cache',
      });

      if (!response.ok) {
        if (response.status === 404) {
          setData(null);
          return;
        }
        throw new Error(`Failed to fetch activity data: ${response.status}`);
      }

      const activityData: ActivityData = await response.json();
      setData(activityData);
      repositoryRef.current = {
        owner: activityData.repository.owner,
        name: activityData.repository.name,
      };
      setLastFetched(new Date());
      setIsRateLimited(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLiveEvents = useCallback(async (owner: string, repo: string) => {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (etagRef.current) {
        headers['If-None-Match'] = etagRef.current;
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/events?per_page=30`,
        { headers }
      );

      if (response.status === 304) {
        setLastFetched(new Date());
        return; // Not modified
      }

      if (response.status === 403 || response.status === 429) {
        setIsRateLimited(true);
        await fetchStaticData();
        return;
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const etag = response.headers.get('ETag');
      if (etag) etagRef.current = etag;

      const events = await response.json();
      
      setData((prevData) => {
        if (!prevData) return prevData;
        return transformEventsToActivity(events, owner, repo, prevData);
      });
      
      setLastFetched(new Date());
      setIsRateLimited(false);
    } catch (err) {
      console.error('Failed to fetch live events:', err);
      await fetchStaticData();
    }
  }, [fetchStaticData]);

  const refresh = useCallback(async () => {
    if (mode === 'live' && repositoryRef.current) {
      await fetchLiveEvents(repositoryRef.current.owner, repositoryRef.current.name);
    } else {
      await fetchStaticData();
    }
  }, [mode, fetchStaticData, fetchLiveEvents]);

  useEffect(() => {
    refresh();

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(refresh, POLLING_INTERVAL);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [refresh]);

  return {
    data,
    loading,
    error,
    mode,
    setMode,
    lastFetched,
    isRateLimited,
    refresh,
  };
}

// Helper to transform GitHub events to our ActivityData structure
function transformEventsToActivity(
  events: any[],
  owner: string,
  repo: string,
  currentData: ActivityData | null
): ActivityData {
  const commits: Commit[] = [];
  const issues: Issue[] = [];
  const pullRequests: PullRequest[] = [];
  const agentsMap = new Map<string, Agent>();

  // Use current data as base if available
  if (currentData) {
    currentData.agents.forEach(a => agentsMap.set(a.login, a));
  }

  events.forEach((event: any) => {
    const actor = event.actor;
    if (actor) {
      agentsMap.set(actor.login, {
        login: actor.login,
        avatarUrl: actor.avatar_url,
      });
    }

    if (event.type === 'PushEvent') {
      event.payload.commits?.forEach((c: any) => {
        commits.push({
          sha: c.sha.slice(0, 7),
          message: c.message.split('\n')[0],
          author: actor.login,
          date: event.created_at,
        });
      });
    } else if (event.type === 'IssuesEvent') {
      const issue = event.payload.issue;
      issues.push({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labels: issue.labels.map((l: any) => l.name),
        createdAt: issue.created_at,
      });
    } else if (event.type === 'PullRequestEvent') {
      const pr = event.payload.pull_request;
      pullRequests.push({
        number: pr.number,
        title: pr.title,
        state: pr.merged_at ? 'merged' : pr.state,
        author: pr.user.login,
        createdAt: pr.created_at,
      });
    }
  });

  // Merge with existing data and deduplicate/sort
  const mergedCommits = deduplicateAndSort(
    [...commits, ...(currentData?.commits || [])],
    'sha',
    'date'
  ).slice(0, 20);

  const mergedIssues = deduplicateAndSort(
    [...issues, ...(currentData?.issues || [])],
    'number',
    'createdAt'
  ).slice(0, 20);

  const mergedPRs = deduplicateAndSort(
    [...pullRequests, ...(currentData?.pullRequests || [])],
    'number',
    'createdAt'
  ).slice(0, 20);

  return {
    generatedAt: currentData?.generatedAt || new Date().toISOString(),
    repository: {
      owner,
      name: repo,
      url: `https://github.com/${owner}/${repo}`,
    },
    agents: Array.from(agentsMap.values()),
    commits: mergedCommits,
    issues: mergedIssues,
    pullRequests: mergedPRs,
  };
}

function deduplicateAndSort<T>(items: T[], key: keyof T, dateKey: keyof T): T[] {
  const map = new Map();
  items.forEach(item => {
    if (!map.has(item[key])) {
      map.set(item[key], item);
    }
  });
  return Array.from(map.values()).sort((a, b) => 
    new Date(b[dateKey] as any).getTime() - new Date(a[dateKey] as any).getTime()
  );
}
