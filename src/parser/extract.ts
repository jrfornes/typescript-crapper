import ts from "typescript";

import type { AnalysisDiagnostic, ParsedFunction } from "../model.js";
import { cyclomaticComplexity } from "./complexity.js";
import { functionId, moduleNamespace } from "./namespace.js";
import { spanLines } from "./positions.js";
import {
  claimRouteName,
  collectRouteCandidates,
  routeLabel,
} from "./routes.js";
import { stablePropertyName } from "./stableName.js";

interface PendingEntry {
  startOffset: number;
  fn: ParsedFunction;
}

function isTopLevel(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isFunctionLike(current)) {
      return false;
    }
    current = current.parent;
  }
  return current !== undefined;
}

function hasExportDefault(node: ts.FunctionDeclaration): boolean {
  if (!node.modifiers) {
    return false;
  }
  let hasExport = false;
  let hasDefault = false;
  for (const mod of node.modifiers) {
    if (mod.kind === ts.SyntaxKind.ExportKeyword) hasExport = true;
    if (mod.kind === ts.SyntaxKind.DefaultKeyword) hasDefault = true;
  }
  return hasExport && hasDefault;
}

function classNamespaceChain(node: ts.Node): string[] {
  const names: string[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isClassDeclaration(current) && current.name) {
      names.unshift(current.name.text);
    }
    current = current.parent;
  }
  return names;
}

function moduleDeclarationPrefix(node: ts.Node): string[] {
  const parts: string[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isModuleDeclaration(current)) {
      const name = current.name;
      if (ts.isIdentifier(name)) {
        parts.unshift(name.text);
      } else if (ts.isStringLiteral(name)) {
        parts.unshift(name.text);
      }
    }
    current = current.parent;
  }
  return parts;
}

function lexicalNamespace(baseModule: string, node: ts.Node): string {
  const modParts = moduleDeclarationPrefix(node);
  const classParts = classNamespaceChain(node);
  const segments = [...modParts, ...classParts];
  if (segments.length === 0) {
    return baseModule;
  }
  return `${baseModule}.${segments.join(".")}`;
}

function objectNamespaceForMethod(
  baseModule: string,
  node: ts.MethodDeclaration,
  path: string,
  diagnostics: AnalysisDiagnostic[],
): string | undefined {
  const segments: string[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current.parent) && current.parent.initializer === current) {
      const name = stablePropertyName(current.parent.name, path, diagnostics);
      if (!name) {
        return undefined;
      }
      segments.unshift(name);
      current = current.parent.parent;
      continue;
    }
    if (ts.isVariableDeclaration(current.parent) && current.parent.initializer === current) {
      const ident = current.parent.name;
      if (!ts.isIdentifier(ident)) {
        return undefined;
      }
      segments.unshift(ident.text);
      const varStmt = current.parent.parent;
      if (!varStmt || !ts.isVariableStatement(varStmt) || !isTopLevel(varStmt)) {
        return undefined;
      }
      break;
    }
    current = current.parent;
  }
  if (segments.length === 0) {
    return undefined;
  }
  return `${baseModule}.${segments.join(".")}`;
}

function appendEntry(
  pending: PendingEntry[],
  node: ts.Node,
  sourceFile: ts.SourceFile,
  normalizedPath: string,
  fields: Omit<ParsedFunction, "id" | "path" | "startLine" | "endLine" | "startOffset" | "endOffset">,
): void {
  const span = spanLines(sourceFile, node);
  pending.push({
    startOffset: span.startOffset,
    fn: {
      ...fields,
      path: normalizedPath,
      ...span,
      id: functionId(normalizedPath, span.startOffset),
    },
  });
}

function complexityRootForVariable(decl: ts.VariableDeclaration): ts.Node | undefined {
  if (!decl.initializer) {
    return undefined;
  }
  if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
    return decl;
  }
  return undefined;
}

function complexityRootForProperty(prop: ts.PropertyDeclaration): ts.Node | undefined {
  if (!prop.initializer) {
    return undefined;
  }
  if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) {
    return prop;
  }
  return undefined;
}

export function extractFunctions(
  sourceFile: ts.SourceFile,
  normalizedPath: string,
  root: string,
  diagnostics: AnalysisDiagnostic[],
): { functions: ParsedFunction[]; routeSkip: Set<ts.Node> } {
  const baseModule = moduleNamespace(normalizedPath, root);
  const pending: PendingEntry[] = [];
  const routeSkip = new Set<ts.Node>();
  const routeCandidates: Array<{
    startOffset: number;
    callback: ts.Expression;
    method: string;
    path: string | undefined;
  }> = [];

  const collectRoutes = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      for (const candidate of collectRouteCandidates(node, sourceFile)) {
        routeCandidates.push(candidate);
        routeSkip.add(candidate.callback);
      }
    }
    node.forEachChild((child) => {
      collectRoutes(child);
    });
  };
  collectRoutes(sourceFile);

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.body) {
      if (!isTopLevel(node)) {
        // local function — complexity only
      } else if (node.name) {
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, node, sourceFile, normalizedPath, {
          name: node.name.text,
          namespace: ns,
          complexity: cyclomaticComplexity(node.body, routeSkip),
        });
      } else if (hasExportDefault(node)) {
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, node, sourceFile, normalizedPath, {
          name: "default",
          namespace: ns,
          complexity: cyclomaticComplexity(node.body, routeSkip),
        });
      }
    }

    if (ts.isMethodDeclaration(node) && node.body) {
      const name = stablePropertyName(node.name, normalizedPath, diagnostics);
      if (!name) {
        ts.forEachChild(node, visit);
        return;
      }
      if (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) {
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, node, sourceFile, normalizedPath, {
          name,
          namespace: ns,
          complexity: cyclomaticComplexity(node.body, routeSkip),
        });
      } else if (ts.isObjectLiteralExpression(node.parent)) {
        if (!isTopLevel(node)) {
          ts.forEachChild(node, visit);
          return;
        }
        const objNs = objectNamespaceForMethod(baseModule, node, normalizedPath, diagnostics);
        if (objNs) {
          appendEntry(pending, node, sourceFile, normalizedPath, {
            name,
            namespace: objNs,
            complexity: cyclomaticComplexity(node.body, routeSkip),
          });
        }
      }
    }

    if (ts.isConstructorDeclaration(node) && node.body) {
      const ns = lexicalNamespace(baseModule, node);
      appendEntry(pending, node, sourceFile, normalizedPath, {
        name: "constructor",
        namespace: ns,
        complexity: cyclomaticComplexity(node.body, routeSkip),
      });
    }

    if (ts.isGetAccessorDeclaration(node) && node.body) {
      const prop = stablePropertyName(node.name, normalizedPath, diagnostics);
      if (prop) {
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, node, sourceFile, normalizedPath, {
          name: `get ${prop}`,
          namespace: ns,
          complexity: cyclomaticComplexity(node.body, routeSkip),
        });
      }
    }

    if (ts.isSetAccessorDeclaration(node) && node.body) {
      const prop = stablePropertyName(node.name, normalizedPath, diagnostics);
      if (prop) {
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, node, sourceFile, normalizedPath, {
          name: `set ${prop}`,
          namespace: ns,
          complexity: cyclomaticComplexity(node.body, routeSkip),
        });
      }
    }

    if (ts.isVariableStatement(node) && isTopLevel(node)) {
      for (const decl of node.declarationList.declarations) {
        const rootNode = complexityRootForVariable(decl);
        if (!rootNode || !ts.isIdentifier(decl.name)) {
          continue;
        }
        const init = decl.initializer!;
        const ccNode = ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? init : init;
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, rootNode, sourceFile, normalizedPath, {
          name: decl.name.text,
          namespace: ns,
          complexity: cyclomaticComplexity(ccNode, routeSkip),
        });
      }
    }

    if (ts.isPropertyDeclaration(node) && node.initializer) {
      const rootNode = complexityRootForProperty(node);
      if (rootNode) {
        const propName = stablePropertyName(node.name, normalizedPath, diagnostics);
        if (propName) {
          const ns = lexicalNamespace(baseModule, node);
          const init = node.initializer;
          const ccNode =
            ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? init : init;
          appendEntry(pending, rootNode, sourceFile, normalizedPath, {
            name: propName,
            namespace: ns,
            complexity: cyclomaticComplexity(ccNode, routeSkip),
          });
        }
      }
    }

    if (ts.isExportAssignment(node) && !node.isExportEquals && isTopLevel(node)) {
      const expr = node.expression;
      if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        const ns = lexicalNamespace(baseModule, node);
        appendEntry(pending, node, sourceFile, normalizedPath, {
          name: "default",
          namespace: ns,
          complexity: cyclomaticComplexity(expr, routeSkip),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const usedRouteNames = new Set<string>();
  for (const route of routeCandidates.sort((a, b) => a.startOffset - b.startOffset)) {
    const label = claimRouteName(
      usedRouteNames,
      routeLabel(route.method, route.path),
    );
    appendEntry(pending, route.callback, sourceFile, normalizedPath, {
      name: label,
      namespace: baseModule,
      complexity: cyclomaticComplexity(route.callback, routeSkip),
    });
  }

  pending.sort((a, b) => a.startOffset - b.startOffset);
  const functions = pending.map((p) => p.fn);

  const seen = new Map<string, number>();
  for (const fn of functions) {
    const key = `${fn.namespace}\0${fn.name}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      const [ns, name] = key.split("\0");
      diagnostics.push({
        severity: "warning",
        code: "DUPLICATE_COMPATIBILITY_KEY",
        message: `Duplicate namespace/name: ${ns}/${name}`,
        path: normalizedPath,
      });
    }
  }

  return { functions, routeSkip };
}
