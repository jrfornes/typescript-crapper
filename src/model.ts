export const METRIC_VERSION = "typescript-crapper-v1";

export interface ParsedFunction {
  id: string;
  name: string;
  namespace: string;
  path: string;
  complexity: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface Entry extends ParsedFunction {
  coverage: number | null;
  crap: number | null;
}

export type DiagnosticSeverity = "warning" | "error";

export interface AnalysisDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path: string;
  startLine?: number;
  startColumn?: number;
}

export interface AnalysisResult {
  functions: ParsedFunction[];
  diagnostics: AnalysisDiagnostic[];
}

export interface SourceAnalyzer {
  analyze(source: string, path: string, root: string): AnalysisResult;
}
