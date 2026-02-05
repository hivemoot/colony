import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityData,
  ActivityEvent,
  ActivityMode,
} from '../types/activity';
import {
  buildLiveEvents,
  buildStaticEvents,
  type GitHubEvent,
} from '../utils/activity';

interface UseActivityDataResult {
  data: ActivityData | null;
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  mode: ActivityMode;
  liveEnabled: boolean;
  setLiveEnabled: (enabled: boolean) => void;
  liveMessage: string | null;
}

const DEFAULT_REPOSITORY = {
  owner: 'hivemoot',
  name: 'colony',
  url: 'https://github.com/hivemoot/colony',
  description: '',
  stars: 0,
  forks: 0,
  openIssues: 0,
};

const STATIC_POLL_MS = 60_000;
const LIVE_BASE_MS = 20_000;
const LIVE_MAX_MS = 5 * 60_000;
const LIVE_EVENTS_ENDPOINT = 'https://api.github.com/repos';

export function useActivityData(): UseActivityDataResult {
  const [data, setData] = useState<ActivityData | null>(null);
  const [staticEvents, setStaticEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastStaticUpdated, setLastStaticUpdated] = useState<Date | null>(null);

  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);
  const [lastLiveUpdated, setLastLiveUpdated] = useState<Date | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const etagRef = useRef<string | null>(null);
  const backoffRef = useRef<number>(LIVE_BASE_MS);
  const hasDataRef = useRef(false);
  const initialFetchRef = useRef(true);
  const repository = data?.repository ?? DEFAULT_REPOSITORY;
  const { owner, name, url } = repository;

  useEffect(() => {
    let active = true;

    async function fetchData(): Promise<void> {
      try {
        // Use import.meta.env.BASE_URL for correct path in production
        const basePath = import.meta.env.BASE_URL || '/';
        const response = await fetch(`${basePath}data/activity.json`);

        if (!response.ok) {
          // Data file may not exist yet (development or first build)
          if (response.status === 404) {
            if (!hasDataRef.current) {
              setData(null);
              setStaticEvents([]);
            }
            setError(null);
            return;
          }
          throw new Error(`Failed to fetch activity data: ${response.status}`);
        }

        const activityData: ActivityData = await response.json();
        if (!active) return;

        hasDataRef.current = true;
        setData(activityData);
        setStaticEvents(buildStaticEvents(activityData));
        setLastStaticUpdated(new Date());
        setError(null);
      } catch (err) {
        if (!hasDataRef.current) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (initialFetchRef.current) {
          initialFetchRef.current = false;
          setLoading(false);
        }
      }
    }

    fetchData();

    const intervalId = window.setInterval(fetchData, STATIC_POLL_MS);
    return (): void => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!liveEnabled) {
      setLiveEvents([]);
      setLastLiveUpdated(null);
      setLiveError(null);
      etagRef.current = null;
      backoffRef.current = LIVE_BASE_MS;
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const repoUrl = url;
    const liveUrl = `${LIVE_EVENTS_ENDPOINT}/${owner}/${name}/events?per_page=30`;

    const scheduleNext = (delay: number): void => {
      timeoutId = window.setTimeout(fetchLiveEvents, delay);
    };

    const fetchLiveEvents = async (): Promise<void> => {
      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
        };
        if (etagRef.current) {
          headers['If-None-Match'] = etagRef.current;
        }

        const response = await fetch(liveUrl, { headers });

        if (response.status === 304) {
          setLiveError(null);
          setLastLiveUpdated(new Date());
          backoffRef.current = LIVE_BASE_MS;
        } else if (response.ok) {
          const nextEtag = response.headers.get('etag');
          if (nextEtag) {
            etagRef.current = nextEtag;
          }
          const payload = (await response.json()) as GitHubEvent[];
          if (!cancelled) {
            setLiveEvents(buildLiveEvents(payload, repoUrl));
            setLastLiveUpdated(new Date());
            setLiveError(null);
          }
          backoffRef.current = LIVE_BASE_MS;
        } else if (response.status === 403 || response.status === 429) {
          setLiveError('rate-limit');
          backoffRef.current = Math.min(backoffRef.current * 2, LIVE_MAX_MS);
        } else {
          throw new Error(`Live feed error: ${response.status}`);
        }
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : 'Live feed error');
        backoffRef.current = Math.min(backoffRef.current * 2, LIVE_MAX_MS);
      } finally {
        if (!cancelled) {
          scheduleNext(backoffRef.current);
        }
      }
    };

    fetchLiveEvents();

    return (): void => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [liveEnabled, owner, name, url]);

  const usingLiveEvents =
    liveEnabled && liveEvents.length > 0 && liveError === null;

  const mode: ActivityMode = useMemo(() => {
    if (!liveEnabled) return 'static';
    if (usingLiveEvents) return 'live';
    return liveError ? 'fallback' : 'connecting';
  }, [liveEnabled, liveError, usingLiveEvents]);

  const events = useMemo(
    () => (usingLiveEvents ? liveEvents : staticEvents),
    [usingLiveEvents, liveEvents, staticEvents]
  );

  const lastUpdated = useMemo(() => {
    if (usingLiveEvents) {
      return lastLiveUpdated;
    }
    return lastStaticUpdated;
  }, [usingLiveEvents, lastLiveUpdated, lastStaticUpdated]);

  const liveMessage = useMemo(() => {
    if (!liveEnabled) return null;
    if (mode === 'connecting') {
      return 'Connecting to GitHub live feed…';
    }
    if (mode === 'fallback') {
      if (liveError === 'rate-limit') {
        return 'Live feed paused (rate limited). Showing static data.';
      }
      return 'Live feed unavailable. Showing static data.';
    }
    return null;
  }, [liveEnabled, mode, liveError]);

  return {
    data,
    events,
    loading,
    error,
    lastUpdated,
    mode,
    liveEnabled,
    setLiveEnabled,
    liveMessage,
  };
}
