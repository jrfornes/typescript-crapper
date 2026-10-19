import { normalizePath } from "./matching.js";

export type LineHits = Map<number, [number, number]>;

export interface BranchIdentity {
  line: number;
  block: string;
  branch: string;
}

export interface FileCoverage {
  lines: LineHits;
  /** branch identity → covered */
  branches: Map<string, boolean>;
  /** aggregated branch counts per line for percent_for */
  branchLines: Map<number, [number, number]>;
}

export function emptyFileCoverage(): FileCoverage {
  return {
    lines: new Map(),
    branches: new Map(),
    branchLines: new Map(),
  };
}

function branchKey(id: BranchIdentity): string {
  return `${id.line},${id.block},${id.branch}`;
}

function branchHit(taken: string): boolean {
  if (taken === "-") {
    return false;
  }
  const n = Number.parseInt(taken, 10);
  return !Number.isNaN(n) && n > 0;
}

function addBranchLine(record: FileCoverage, line: number, covered: boolean): void {
  const prev = record.branchLines.get(line) ?? [0, 0];
  record.branchLines.set(line, [
    prev[0] + (covered ? 1 : 0),
    prev[1] + 1,
  ]);
}

export function parseLcov(text: string): Map<string, FileCoverage> {
  const out = new Map<string, FileCoverage>();
  let currentFile: string | null = null;
  let current = emptyFileCoverage();

  const store = (): void => {
    if (currentFile !== null) {
      out.set(currentFile, current);
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      store();
      currentFile = line.slice(3);
      current = emptyFileCoverage();
    } else if (line === "end_of_record") {
      store();
      currentFile = null;
      current = emptyFileCoverage();
    } else if (currentFile !== null) {
      const da = /^DA:(\d+),(\d+)$/.exec(line);
      if (da) {
        const ln = Number.parseInt(da[1]!, 10);
        const hits = Number.parseInt(da[2]!, 10);
        current.lines.set(ln, [hits > 0 ? 1 : 0, 1]);
        continue;
      }
      const brda = /^BRDA:(\d+),([^,]*),([^,]*),(-|\d+)$/.exec(line);
      if (brda) {
        const id: BranchIdentity = {
          line: Number.parseInt(brda[1]!, 10),
          block: brda[2]!,
          branch: brda[3]!,
        };
        const hit = branchHit(brda[4]!);
        const key = branchKey(id);
        const prev = current.branches.get(key);
        current.branches.set(key, prev === true || hit);
        addBranchLine(current, id.line, hit);
      }
    }
  }
  store();
  return out;
}

export function mergeFileCoverage(into: FileCoverage, from: FileCoverage): void {
  for (const [line, hits] of from.lines) {
    const prev = into.lines.get(line);
    if (!prev) {
      into.lines.set(line, hits);
    } else {
      into.lines.set(line, [(prev[0] > 0 || hits[0] > 0 ? 1 : 0), 1]);
    }
  }
  for (const [key, hit] of from.branches) {
    const prev = into.branches.get(key);
    into.branches.set(key, prev === true || hit);
  }
  for (const [line, counts] of from.branchLines) {
    const prev = into.branchLines.get(line) ?? [0, 0];
    into.branchLines.set(line, [prev[0] + counts[0], prev[1] + counts[1]]);
  }
}

export function mergeLcovMaps(
  maps: Iterable<Map<string, FileCoverage>>,
): Map<string, FileCoverage> {
  const merged = new Map<string, FileCoverage>();
  for (const map of maps) {
    for (const [path, record] of map) {
      const norm = normalizePath(path);
      const existing = merged.get(norm);
      if (!existing) {
        merged.set(norm, {
          lines: new Map(record.lines),
          branches: new Map(record.branches),
          branchLines: new Map(record.branchLines),
        });
      } else {
        mergeFileCoverage(existing, record);
      }
    }
  }
  return merged;
}

export function coveragePercent(covered: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (100 * covered) / total;
}

export function percentForRange(
  lines: LineHits | undefined,
  start: number,
  end: number,
): number | null {
  if (!lines) {
    return null;
  }
  let covered = 0;
  let total = 0;
  for (let line = start; line <= end; line++) {
    const entry = lines.get(line);
    if (!entry) {
      continue;
    }
    covered += entry[0];
    total += entry[1];
  }
  if (total === 0) {
    return 0;
  }
  return coveragePercent(covered, total);
}

export function branchPercent(
  record: FileCoverage,
  start: number,
  end: number,
): number | null {
  let covered = 0;
  let total = 0;
  for (let line = start; line <= end; line++) {
    const entry = record.branchLines.get(line);
    if (!entry) {
      continue;
    }
    covered += entry[0];
    total += entry[1];
  }
  if (total === 0) {
    return null;
  }
  return coveragePercent(covered, total);
}
