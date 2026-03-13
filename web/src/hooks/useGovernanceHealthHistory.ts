import { useState, useEffect } from 'react';
import {
  parseGovernanceHealthHistory,
  type GovernanceHealthEntry,
} from '../../shared/governance-health-history.ts';

const BASE_URL = import.meta.env.BASE_URL ?? '/';

export interface UseGovernanceHealthHistoryResult {
  snapshots: GovernanceHealthEntry[];
  loading: boolean;
}

/**
 * Load CHAOSS-aligned governance health history from the static data directory.
 * Returns an empty array if the file doesn't exist yet (first deploy before
 * any data runs with PR #612's history-appending logic).
 */
export function useGovernanceHealthHistory(): UseGovernanceHealthHistoryResult {
  const [snapshots, setSnapshots] = useState<GovernanceHealthEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch(
          `${BASE_URL}data/governance-health-history.json`
        );
        if (!res.ok) {
          // File doesn't exist yet — expected on first deploy
          if (!cancelled) setSnapshots([]);
          return;
        }
        const data: unknown = await res.json();
        const history = parseGovernanceHealthHistory(data);
        if (!cancelled) {
          setSnapshots(history?.snapshots ?? []);
        }
      } catch {
        if (!cancelled) setSnapshots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return (): void => {
      cancelled = true;
    };
  }, []);

  return { snapshots, loading };
}
