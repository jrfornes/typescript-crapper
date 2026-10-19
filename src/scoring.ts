import type { Entry, ParsedFunction } from "./model.js";

/** CRAP = CC² × (1 − coverage/100)³ + CC */
export function crapScore(
  complexity: number,
  coveragePct: number | null,
): number | null {
  if (coveragePct === null) {
    return null;
  }
  const cc = complexity;
  const uncovered = 1.0 - coveragePct / 100.0;
  return cc * cc * uncovered * uncovered * uncovered + cc;
}

export function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return Math.round(value * 10_000) / 10_000;
}

export function makeEntry(
  fn: ParsedFunction,
  coverage: number | null,
): Entry {
  const roundedCoverage = roundMetric(coverage);
  return {
    ...fn,
    coverage: roundedCoverage,
    crap: roundMetric(crapScore(fn.complexity, roundedCoverage)),
  };
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const key = (entry: Entry): [number, number, string, string, string] => {
      if (entry.crap === null) {
        return [1, -entry.complexity, entry.namespace, entry.name, entry.path];
      }
      return [0, -entry.crap, entry.namespace, entry.name, entry.path];
    };
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

export function worstCrap(entries: Entry[]): number | null {
  let worst: number | null = null;
  for (const entry of entries) {
    if (entry.crap === null) continue;
    if (worst === null || entry.crap > worst) {
      worst = entry.crap;
    }
  }
  return worst;
}

export function thresholdExceeded(
  entries: Entry[],
  threshold: number,
): boolean {
  const worst = worstCrap(entries);
  if (worst === null) {
    return false;
  }
  const roundedThreshold = roundMetric(threshold);
  if (roundedThreshold === null) {
    return false;
  }
  return worst > roundedThreshold;
}
