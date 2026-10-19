import ts from "typescript";

import type { AnalysisDiagnostic, AnalysisResult, SourceAnalyzer } from "../model.js";
import { extractFunctions } from "./extract.js";
import { scriptKindFor } from "./scriptKind.js";

function parseDiagnostics(
  sourceFile: ts.SourceFile,
  path: string,
): AnalysisDiagnostic[] {
  const parseDiagnostics =
    (
      sourceFile as ts.SourceFile & {
        parseDiagnostics?: readonly ts.Diagnostic[];
      }
    ).parseDiagnostics ?? [];
  return parseDiagnostics.map((d: ts.Diagnostic) => ({
    severity: "warning" as const,
    code: "TS_PARSE_ERROR",
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    path,
    startLine: d.start !== undefined ? sourceFile.getLineAndCharacterOfPosition(d.start).line + 1 : undefined,
    startColumn:
      d.start !== undefined
        ? sourceFile.getLineAndCharacterOfPosition(d.start).character + 1
        : undefined,
  }));
}

export class CompilerApiAnalyzer implements SourceAnalyzer {
  analyze(source: string, path: string, root: string): AnalysisResult {
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(path),
    );
    const diagnostics = parseDiagnostics(sourceFile, path);
    const { functions } = extractFunctions(sourceFile, path, root, diagnostics);
    return { functions, diagnostics };
  }
}

export const defaultAnalyzer = new CompilerApiAnalyzer();

export function analyzeSource(
  source: string,
  path: string,
  root: string,
): AnalysisResult {
  return defaultAnalyzer.analyze(source, path, root);
}

export { moduleNamespace } from "./namespace.js";
