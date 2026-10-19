import ts from "typescript";

const ROUTE_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "all",
  "use",
]);

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function callCallee(call: ts.CallExpression): ts.Node | undefined {
  return call.expression;
}

function propertyNameFromCallee(callee: ts.Node | undefined): string | undefined {
  if (!callee || !ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  return callee.name.text;
}

export function routeMethod(call: ts.CallExpression): string | undefined {
  const name = propertyNameFromCallee(callCallee(call));
  if (!name) {
    return undefined;
  }
  const lowered = name.toLowerCase();
  return ROUTE_METHODS.has(lowered) ? lowered : undefined;
}

function literalPathFromExpression(expr: ts.Expression): string | undefined {
  const unwrapped = unwrapExpression(expr);
  if (ts.isStringLiteral(unwrapped)) {
    return unwrapped.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text;
  }
  if (ts.isTemplateExpression(unwrapped)) {
    const text = unwrapped.getText();
    if (text.startsWith("`") && text.endsWith("`")) {
      return text.slice(1, -1);
    }
    return text;
  }
  return undefined;
}

function stringArgument(call: ts.CallExpression): string | undefined {
  for (const arg of call.arguments) {
    const path = literalPathFromExpression(arg);
    if (path !== undefined) {
      return path;
    }
  }
  return undefined;
}

function pathFromRouteChain(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (!ts.isCallExpression(current)) {
      return undefined;
    }
    const callee = callCallee(current);
    if (propertyNameFromCallee(callee) === "route") {
      return stringArgument(current);
    }
    current = callee;
  }
  return undefined;
}

export function inlineCallbacks(call: ts.CallExpression): ts.Expression[] {
  const found: ts.Expression[] = [];
  for (const arg of call.arguments) {
    const expr = unwrapExpression(arg);
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      found.push(expr);
    }
  }
  return found;
}

export interface RouteCandidate {
  callback: ts.Expression;
  method: string;
  path: string | undefined;
  startOffset: number;
}

export function collectRouteCandidates(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): RouteCandidate[] {
  const method = routeMethod(call);
  if (!method) {
    return [];
  }
  const callbacks = inlineCallbacks(call);
  if (callbacks.length === 0) {
    return [];
  }
  let routePath = stringArgument(call);
  if (!routePath) {
    routePath = pathFromRouteChain(callCallee(call) ?? call);
  }
  return callbacks.map((callback) => ({
    callback,
    method,
    path: routePath,
    startOffset: callback.getStart(sourceFile, false),
  }));
}

export function routeLabel(method: string, path: string | undefined): string {
  const label = method.toUpperCase();
  if (path) {
    return `${label} ${path}`;
  }
  return label;
}

export function claimRouteName(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let number = 2;
  while (used.has(`${base}#${number}`)) {
    number += 1;
  }
  const chosen = `${base}#${number}`;
  used.add(chosen);
  return chosen;
}

export function isRouteCallbackNode(
  node: ts.Node,
  routeCallbacks: ReadonlySet<ts.Node>,
): boolean {
  return routeCallbacks.has(node);
}
