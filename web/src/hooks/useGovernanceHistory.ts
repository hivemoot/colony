import { useState, useEffect } from 'react';
import {
  parseGovernanceHistoryArtifact,
  type GovernanceSnapshot,
} from '../../shared/governance-snapshot.ts';

const BASE_URL = import.meta.env.BASE_URL ?? '/';

export interface UseGovernanceHistoryResult {
  history: GovernanceSnapshot[];
  loading: boolean;
}

/**
 * Load governance history from the static data directory.
 * Returns an empty array if the file doesn't exist yet (first deploy
 * before any snapshots have been captured).
 */
export function useGovernanceHistory(): UseGovernanceHistoryResult {
  const [history, setHistory] = useState<GovernanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch(`${BASE_URL}data/governance-history.json`);
        if (!res.ok) {
          // File doesn't exist yet — this is expected on first deploy
          setHistory([]);
          return;
        }
        const data: unknown = await res.json();
        const artifact = parseGovernanceHistoryArtifact(data);
        if (!cancelled) {
          setHistory(artifact?.snapshots ?? []);
        }
      } catch {
        // Fetch failed — show empty history
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return (): void => {
      cancelled = true;
    };
  }, []);

  return { history, loading };
}
