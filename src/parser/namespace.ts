import { relative, resolve, sep } from "node:path";

const TS_EXTENSIONS = [".tsx", ".mts", ".cts", ".ts"];

/** File module namespace relative to project root (not source-root). */
export function moduleNamespace(filePath: string, root: string): string {
  const absRoot = resolve(root);
  const absFile = resolve(absRoot, filePath);
  let rel = relative(absRoot, absFile).split(sep).join("/");
  if (rel.startsWith("./")) {
    rel = rel.slice(2);
  }
  if (rel.startsWith("src/")) {
    rel = rel.slice(4);
  }
  for (const ext of TS_EXTENSIONS) {
    if (rel.endsWith(ext)) {
      rel = rel.slice(0, -ext.length);
      break;
    }
  }
  return rel.replace(/\//g, ".");
}

export function functionId(normalizedPath: string, startOffset: number): string {
  return `${normalizedPath}:${startOffset}`;
}
