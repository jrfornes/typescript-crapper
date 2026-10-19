import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { join } from "node:path";

import { mergeLcovMaps, parseLcov } from "./lcov.js";
import { CoverageBundle } from "./bundle.js";
import { normalizePath } from "./matching.js";

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function lcovPaths(root: string): Promise<string[]> {
  const patterns = [
    join(root, "target/coverage/**/lcov.info"),
    join(root, "coverage/**/lcov.info"),
  ];
  const paths: string[] = [];
  for (const pattern of patterns) {
    for await (const entry of glob(pattern)) {
      paths.push(entry);
    }
  }
  return paths;
}

export async function loadCoverageBundle(root: string): Promise<CoverageBundle> {
  const paths = await lcovPaths(root);
  const maps = [];
  for (const path of paths) {
    const text = await readText(path);
    if (text) {
      maps.push(parseLcov(text));
    }
  }
  const merged = mergeLcovMaps(maps);
  const normalized = new Map<string, import("./lcov.js").FileCoverage>();
  for (const [key, value] of merged) {
    normalized.set(normalizePath(key), value);
  }
  return new CoverageBundle(normalized);
}
