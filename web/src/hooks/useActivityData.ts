import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivityData } from '../types/activity';

const DEFAULT_POLL_INTERVAL = 60_000; // 60 seconds

interface UseActivityDataOptions {
  /** Polling interval in ms. Set to 0 to disable polling. Defaults to 60s. */
  pollInterval?: number;
}

interface UseActivityDataResult {
  data: ActivityData | null;
  loading: boolean;
  error: string | null;
  /** When the last successful fetch completed */
  lastFetchedAt: Date | null;
}

export function useActivityData(
  options?: UseActivityDataOptions
): UseActivityDataResult {
  const pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL;

  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Track whether this is the initial load vs a background refresh
  const hasLoadedOnce = useRef(false);

  const fetchData = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const isRefresh = hasLoadedOnce.current;

    try {
      const basePath = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${basePath}data/activity.json`, {
        signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Data file may not exist yet (development or first build)
          if (!isRefresh) {
            setData(null);
          }
          return;
        }
        throw new Error(`Failed to fetch activity data: ${response.status}`);
      }

      const activityData: ActivityData = await response.json();
      setData(activityData);
      setLastFetchedAt(new Date());

      if (!isRefresh) {
        setError(null);
      }
    } catch (err) {
      if (signal?.aborted) return;

      if (isRefresh) {
        // On refresh failures, keep existing data and don't show error
        return;
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!isRefresh) {
        setLoading(false);
        hasLoadedOnce.current = true;
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return (): void => controller.abort();
  }, [fetchData]);

  // Polling
  useEffect(() => {
    if (pollInterval <= 0) return;

    const id = setInterval((): void => {
      fetchData();
    }, pollInterval);

    return (): void => clearInterval(id);
  }, [pollInterval, fetchData]);

  return { data, loading, error, lastFetchedAt };
}
