import ts from "typescript";

export function spanLines(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { startLine: number; endLine: number; startOffset: number; endOffset: number } {
  const startOffset = node.getStart(sourceFile, false);
  const endExclusive = node.getEnd();
  const startLine = sourceFile.getLineAndCharacterOfPosition(startOffset).line + 1;
  const endProbe = Math.max(startOffset, endExclusive - 1);
  const endLine =
    sourceFile.getLineAndCharacterOfPosition(endProbe).line + 1;
  return { startLine, endLine, startOffset, endOffset: endExclusive };
}
