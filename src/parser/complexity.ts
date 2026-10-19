import ts from "typescript";

function isDecision(node: ts.Node): boolean {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  ) {
    return true;
  }
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (
      kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      kind === ts.SyntaxKind.BarBarToken ||
      kind === ts.SyntaxKind.QuestionQuestionToken ||
      kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      kind === ts.SyntaxKind.BarBarEqualsToken ||
      kind === ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
      return true;
    }
  }
  if (ts.isPropertyAccessChain(node) && node.questionDotToken !== undefined) {
    return true;
  }
  if (ts.isElementAccessChain(node) && node.questionDotToken !== undefined) {
    return true;
  }
  if (ts.isCallChain(node) && node.questionDotToken !== undefined) {
    return true;
  }
  return false;
}

function shouldSkipSubtree(node: ts.Node, root: ts.Node): boolean {
  if (node === root) {
    return false;
  }
  if (
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  ) {
    return true;
  }
  return false;
}

export function cyclomaticComplexity(
  root: ts.Node,
  skipNodes: ReadonlySet<ts.Node> = new Set(),
): number {
  let complexity = 1;
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node !== root && skipNodes.has(node)) {
      continue;
    }
    if (shouldSkipSubtree(node, root)) {
      continue;
    }
    if (node !== root && isDecision(node)) {
      complexity += 1;
    }
    node.forEachChild((child) => {
      stack.push(child);
    });
  }
  return complexity;
}
