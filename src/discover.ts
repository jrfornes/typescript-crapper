import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

export const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".venv",
  "venv",
  "node_modules",
  "vendor",
  "target",
  "dist",
  "build",
  "out",
  "coverage",
  ".metrics",
  "testdata",
  "__pycache__",
  ".clj-kondo",
]);

export const TEST_DIRS = new Set(["test", "tests", "spec", "specs", "__tests__"]);

const JS_TEST_SUFFIXES = [
  ".test.ts",
  ".spec.ts",
  ".test.tsx",
  ".spec.tsx",
  ".test.mts",
  ".spec.mts",
  ".test.cts",
  ".spec.cts",
];

export function isTypeScriptSource(path: string): boolean {
  if (path.endsWith(".d.ts")) {
    return false;
  }
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  return TS_EXTENSIONS.has(path.slice(dot));
}

export function isTestFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() ?? normalized;
  if (JS_TEST_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    return true;
  }
  const parts = normalized.split("/");
  return parts.some((part) => TEST_DIRS.has(part));
}

async function walkRoot(root: string, explicitTarget: boolean): Promise<string[]> {
  const abs = resolve(root);
  const st = await stat(abs).catch(() => undefined);
  if (!st) {
    return [];
  }
  if (st.isFile()) {
    if (!isTypeScriptSource(abs)) {
      return [];
    }
    if (!explicitTarget && isTestFile(abs)) {
      return [];
    }
    return [abs];
  }
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      const stChild = await stat(full).catch(() => undefined);
      if (!stChild) {
        continue;
      }
      if (stChild.isDirectory()) {
        if (SKIP_DIRS.has(name) || TEST_DIRS.has(name)) {
          continue;
        }
        await walk(full);
      } else if (isTypeScriptSource(full)) {
        if (explicitTarget || !isTestFile(full)) {
          found.push(full);
        }
      }
    }
  }
  await walk(abs);
  return found;
}

export function normalizeSelectedPath(path: string, projectRoot: string): string {
  const rel = relative(projectRoot, resolve(path));
  return rel.split(sep).join("/");
}

export async function iterSourceFiles(
  roots: string[],
  projectRoot: string,
  explicitRoots: boolean,
): Promise<string[]> {
  const files = new Set<string>();
  for (const root of roots) {
    for (const file of await walkRoot(root, explicitRoots)) {
      files.add(resolve(file));
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

export function filterBySubstrings(files: string[], filters: string[]): string[] {
  if (filters.length === 0) {
    return files;
  }
  return files.filter((file) =>
    filters.some((filter) => file.includes(filter)),
  );
}

export async function gitChangedFiles(projectRoot: string): Promise<string[]> {
  const root = resolve(projectRoot);
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain", "-z", "--untracked-files=all"],
      { cwd: root, maxBuffer: 10 * 1024 * 1024 },
    );
    const found: string[] = [];
    const entries = stdout.split("\0").filter(Boolean);
    for (const entry of entries) {
      if (entry.length < 4) {
        continue;
      }
      const status = entry.slice(0, 2);
      if (status.includes("D")) {
        continue;
      }
      const rawPath = entry.slice(3);
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop()! : rawPath;
      const abs = resolve(root, path);
      if (!isTypeScriptSource(abs) || isTestFile(abs)) {
        continue;
      }
      found.push(abs);
    }
    return [...new Set(found)].sort((a, b) => a.localeCompare(b));
  } catch {
    throw new Error("GIT_STATUS_FAILED");
  }
}

export async function resolveSelectedFiles(options: {
  projectRoot: string;
  sourceRoots: string[];
  positionals: string[];
  changed: boolean;
}): Promise<string[]> {
  const root = resolve(options.projectRoot);
  if (options.changed) {
    return gitChangedFiles(root);
  }
  if (options.positionals.length === 0) {
    const walkRoots =
      options.sourceRoots.length > 0
        ? options.sourceRoots.map((r) => resolve(root, r))
        : [root];
    return iterSourceFiles(walkRoots, root, false);
  }
  const files = new Set<string>();
  for (const positional of options.positionals) {
    const candidate = resolve(root, positional);
    const st = await stat(candidate).catch(() => undefined);
    if (st?.isFile()) {
      if (isTypeScriptSource(candidate)) {
        files.add(candidate);
      }
      continue;
    }
    if (st?.isDirectory()) {
      for (const f of await iterSourceFiles([candidate], root, true)) {
        files.add(f);
      }
      continue;
    }
    const all = await iterSourceFiles(
      options.sourceRoots.length > 0
        ? options.sourceRoots.map((r) => resolve(root, r))
        : [root],
      root,
      false,
    );
    for (const f of filterBySubstrings(all, [positional])) {
      files.add(f);
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}
