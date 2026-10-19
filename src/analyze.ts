import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AnalysisDiagnostic, Entry } from "./model.js";
import { defaultAnalyzer } from "./parser/index.js";
import { functionId } from "./parser/namespace.js";
import { makeEntry, sortEntries } from "./scoring.js";
import type { CoverageBundle } from "./coverage/bundle.js";
import { normalizeSelectedPath } from "./discover.js";

export interface AnalyzeOptions {
  projectRoot: string;
  files: string[];
  bundle: CoverageBundle | null;
  strict: boolean;
}

export interface AnalyzeOutput {
  entries: Entry[];
  diagnostics: AnalysisDiagnostic[];
}

function coverageForFunction(
  bundle: CoverageBundle | null,
  fnPath: string,
  fn: Parameters<typeof makeEntry>[0],
  diagnostics: AnalysisDiagnostic[],
): number | null {
  if (bundle === null) {
    return null;
  }
  const found = bundle.percentFor({ ...fn, path: fnPath });
  if (found === undefined) {
    diagnostics.push({
      severity: "warning",
      code: "MISSING_FUNCTION_COVERAGE",
      message: `No coverage data for ${fn.namespace}/${fn.name}`,
      path: fnPath,
    });
    return 0;
  }
  return found;
}

export async function analyzeFiles(options: AnalyzeOptions): Promise<AnalyzeOutput> {
  const root = resolve(options.projectRoot);
  const diagnostics: AnalysisDiagnostic[] = [];
  const entries: Entry[] = [];

  if (options.bundle) {
    options.bundle.bindSources(
      options.files.map((f) => normalizeSelectedPath(f, root)),
    );
    diagnostics.push(...options.bundle.diagnostics);
  }

  for (const file of options.files) {
    const abs = resolve(file);
    let relativePath: string;
    try {
      relativePath = normalizeSelectedPath(abs, root);
    } catch {
      relativePath = abs;
    }
    let source: string;
    try {
      source = await readFile(abs, "utf8");
    } catch {
      diagnostics.push({
        severity: "warning",
        code: "READ_ERROR",
        message: `Could not read ${relativePath}`,
        path: relativePath,
      });
      continue;
    }
    const result = defaultAnalyzer.analyze(source, abs, root);
    diagnostics.push(...result.diagnostics);
    for (const fn of result.functions) {
      const fnWithPath = {
        ...fn,
        path: relativePath,
        id: functionId(relativePath, fn.startOffset),
      };
      const coverage = coverageForFunction(
        options.bundle,
        relativePath,
        fnWithPath,
        diagnostics,
      );
      entries.push(makeEntry(fnWithPath, coverage));
    }
  }

  return { entries: sortEntries(entries), diagnostics };
}
