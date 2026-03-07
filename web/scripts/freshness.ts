export interface FreshnessEvaluation {
  ok: boolean;
  details: string;
}

export function evaluateGeneratedAtFreshness(
  generatedAt: unknown,
  options?: {
    nowMs?: number;
    maxAgeHours?: number;
  }
): FreshnessEvaluation {
  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeHours = options?.maxAgeHours ?? 18;

  if (typeof generatedAt !== 'string') {
    return {
      ok: false,
      details: 'Missing generatedAt in deployed activity.json',
    };
  }

  const timestamp = new Date(generatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return {
      ok: false,
      details: 'Invalid timestamp in deployed activity.json',
    };
  }

  const ageMs = nowMs - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageMs < 0) {
    return {
      ok: false,
      details: `generatedAt is in the future (${Math.round(Math.abs(ageHours))}h ahead)`,
    };
  }

  return {
    ok: ageHours <= maxAgeHours,
    details: `Deployed data is ${Math.round(ageHours)}h old`,
  };
}
