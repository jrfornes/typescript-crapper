import { accessSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

export interface RunResult {
  exitCode: number;
  command: string[];
}

export function showCommand(command: string[]): string {
  return command.map((part) => (/\s|[\\"$`]/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function nearestPackageJson(start: string, stop: string): string | undefined {
  let current = resolve(start);
  const stopResolved = resolve(stop);
  while (true) {
    const candidate = join(current, "package.json");
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      // continue
    }
    if (current === stopResolved) {
      return undefined;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function readPackageJson(dir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await readFile(join(dir, "package.json"), "utf8");
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function detectPackageManager(root: string): "npm" | "pnpm" | "yarn" | "bun" {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

export function pmExec(pm: string, args: string[]): string[] {
  if (pm === "npm") {
    return ["npm", "run", ...args];
  }
  if (pm === "pnpm") {
    return ["pnpm", ...args];
  }
  if (pm === "yarn") {
    return ["yarn", ...args];
  }
  return ["bun", "run", ...args];
}

export interface CoveragePlan {
  command: string[];
  packageDir: string;
  guidance?: string;
}

export async function planCoverageCommand(
  sourceFile: string,
  projectRoot: string,
): Promise<CoveragePlan | { error: string; guidance?: string }> {
  const root = resolve(projectRoot);
  const pkgPath = nearestPackageJson(dirname(resolve(sourceFile)), root);
  if (!pkgPath) {
    return { error: "no_package", guidance: "No package.json found for selected sources." };
  }
  const packageDir = dirname(pkgPath);
  const pkg = await readPackageJson(packageDir);
  if (!pkg) {
    return { error: "no_package" };
  }
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const pm = detectPackageManager(packageDir);
  if (scripts.coverage) {
    return { command: pmExec(pm, ["coverage"]), packageDir };
  }
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  if (deps.vitest) {
    if (!deps["@vitest/coverage-v8"] && !deps["@vitest/coverage-istanbul"]) {
      return {
        error: "missing_provider",
        guidance:
          "Install a Vitest coverage provider, for example: npm install -D @vitest/coverage-v8",
      };
    }
    return {
      command: [
        ...(pm === "npm" ? ["npx", "vitest", "run", "--coverage"] : [pm, "exec", "vitest", "run", "--coverage"]),
      ],
      packageDir,
    };
  }
  if (scripts.test) {
    return {
      command: [
        "npx",
        "c8",
        "--reporter=lcov",
        "--reports-dir",
        join(packageDir, "coverage"),
        pm,
        "test",
      ],
      packageDir,
    };
  }
  return { error: "no_test_script", guidance: "Add a test or coverage script to package.json." };
}

export function runCommand(command: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", () => resolvePromise({ exitCode: 127, command }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, command }));
  });
}

export function runShellCommand(command: string, cwd: string): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", () => resolvePromise({ exitCode: 127, command: [command] }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, command: [command] }));
  });
}
