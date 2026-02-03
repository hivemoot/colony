import { useState, useEffect } from 'react';
import type { ActivityData } from '../types/activity';

interface UseActivityDataResult {
  data: ActivityData | null;
  loading: boolean;
  error: string | null;
}

export function useActivityData(): UseActivityDataResult {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        // Use import.meta.env.BASE_URL for correct path in production
        const basePath = import.meta.env.BASE_URL || '/';
        const response = await fetch(`${basePath}data/activity.json`);

        if (!response.ok) {
          // Data file may not exist yet (development or first build)
          if (response.status === 404) {
            setData(null);
            return;
          }
          throw new Error(`Failed to fetch activity data: ${response.status}`);
        }

        const activityData: ActivityData = await response.json();
        setData(activityData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}
