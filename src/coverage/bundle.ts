import type { AnalysisDiagnostic, ParsedFunction } from "../model.js";
import { roundMetric } from "../scoring.js";
import type { FileCoverage } from "./lcov.js";
import { branchPercent, percentForRange } from "./lcov.js";
import { candidatesForSource, selectLcovKey } from "./matching.js";

export class CoverageBundle {
  readonly lcov: Map<string, FileCoverage>;
  sourceParts: Array<[...string[]]> = [];
  readonly diagnostics: AnalysisDiagnostic[] = [];

  constructor(lcov: Map<string, FileCoverage>) {
    this.lcov = lcov;
  }

  bindSources(paths: string[]): void {
    const found: Array<[...string[]]> = [];
    const seen = new Set<string>();
    for (const source of paths) {
      for (const candidate of candidatesForSource(source)) {
        const parts = candidate.split("/").filter(Boolean) as [...string[]];
        const key = parts.join("/");
        if (parts.length > 0 && !seen.has(key)) {
          seen.add(key);
          found.push(parts);
        }
      }
    }
    this.sourceParts = found;
  }

  lookupRecord(sourcePath: string): FileCoverage | undefined {
    if (this.lcov.size === 0) {
      return undefined;
    }
    const key = selectLcovKey([...this.lcov.keys()], sourcePath, this.sourceParts);
    if (key === undefined) {
      const forward = selectLcovKey([...this.lcov.keys()], sourcePath, this.sourceParts);
      if (forward === undefined && this.lcov.size > 0) {
        // ambiguous or missing — caller handles
      }
      return undefined;
    }
    return this.lcov.get(key) ?? this.lcov.get(key);
  }

  percentFor(fn: ParsedFunction): number | undefined {
    const keys = [...this.lcov.keys()];
    const key = selectLcovKey(keys, fn.path, this.sourceParts);
    if (key === undefined) {
      const matches = keys.filter((k) =>
        candidatesForSource(fn.path).some((c) => k.endsWith(c) || c.endsWith(k)),
      );
      if (matches.length > 1) {
        this.diagnostics.push({
          severity: "warning",
          code: "AMBIGUOUS_LCOV_PATH",
          message: `Ambiguous LCOV path for ${fn.path}`,
          path: fn.path,
        });
      }
      return undefined;
    }
    const record = this.lcov.get(key);
    if (!record) {
      return undefined;
    }
    const branched = branchPercent(record, fn.startLine, fn.endLine);
    if (branched !== null) {
      return roundMetric(branched) ?? undefined;
    }
    const linePct = percentForRange(record.lines, fn.startLine, fn.endLine);
    if (linePct === null) {
      return undefined;
    }
    return roundMetric(linePct) ?? undefined;
  }
}
