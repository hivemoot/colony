import { useState, useEffect } from 'react';
import type { GovernanceHealthMetrics } from '../../shared/governance-health-metrics.ts';

const BASE_URL = import.meta.env.BASE_URL ?? '/';

export interface UseGovernanceHealthMetricsResult {
  metrics: GovernanceHealthMetrics | null;
  loading: boolean;
}

/**
 * Load the precomputed governance-health-metrics.json artifact from the
 * static data directory. Returns null if the file doesn't exist yet (first
 * deploy before generate-data has run) or on any fetch/parse error.
 */
export function useGovernanceHealthMetrics(): UseGovernanceHealthMetricsResult {
  const [metrics, setMetrics] = useState<GovernanceHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch(
          `${BASE_URL}data/governance-health-metrics.json`
        );
        if (!res.ok) {
          // File not generated yet — expected on initial deploys
          if (!cancelled) setMetrics(null);
          return;
        }
        const raw: unknown = await res.json();
        if (!cancelled) {
          setMetrics(raw as GovernanceHealthMetrics);
        }
      } catch {
        if (!cancelled) setMetrics(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return (): void => {
      cancelled = true;
    };
  }, []);

  return { metrics, loading };
}
