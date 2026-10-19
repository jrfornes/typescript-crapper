import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "dist/cli.js"), ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

describe("CLI statuses", () => {
  it("CLI-01 help", async () => {
    const result = await run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("typescript-crapper");
    expect(result.stdout).toContain("typescript-crapper-v1");
  });

  it("CLI-02 unknown option", async () => {
    const result = await run(["--not-real"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown option");
  });

  it("CLI version metric", async () => {
    const result = await run(["--metric-version"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("typescript-crapper-v1");
  });
});
