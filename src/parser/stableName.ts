import ts from "typescript";

import type { AnalysisDiagnostic } from "../model.js";

export function stablePropertyName(
  name: ts.PropertyName,
  path: string,
  diagnostics: AnalysisDiagnostic[],
  line?: number,
): string | undefined {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const expr = name.expression;
    if (ts.isStringLiteral(expr) || ts.isNumericLiteral(expr)) {
      return expr.text;
    }
    diagnostics.push({
      severity: "warning",
      code: "DYNAMIC_MEMBER_NAME",
      message: "Skipped entry with dynamic computed property name",
      path,
      startLine: line,
    });
    return undefined;
  }
  return undefined;
}
