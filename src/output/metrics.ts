import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Entry } from "../model.js";
import { renderEdn } from "./edn.js";

export function metricsPath(root: string): string {
  return join(root, ".metrics", "crap.edn");
}

export async function writeMetricsAtomic(
  entries: readonly Entry[],
  root: string,
): Promise<string> {
  const path = metricsPath(root);
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.crap.edn.${process.pid}.tmp`);
  const body = renderEdn(entries);
  await writeFile(temp, body, "utf8");
  await rename(temp, path);
  return path;
}
