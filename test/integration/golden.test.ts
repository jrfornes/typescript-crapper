import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

import { parseEdnDocument } from "../helpers/parseEdn.js";

function runCli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "dist/cli.js"), ...args], {
      cwd,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

describe("golden project CLI-11 section", () => {
  it("runs end-to-end coverage workflows", async () => {
    const root = await mkdtemp(join(tmpdir(), "crapper-golden-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "coverage"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "golden", version: "1.0.0" }),
    );
    await writeFile(
      join(root, "src/choose.ts"),
      `export function choose(ok: boolean): number {
  if (ok) return 1;
  return 0;
}
`,
    );
    await writeFile(
      join(root, "src/clean.ts"),
      "export const clean = (): number => 1;\n",
    );
    await writeFile(
      join(root, "coverage/lcov.info"),
      `TN:
SF:src/choose.ts
DA:1,1
DA:2,1
DA:3,1
BRDA:2,0,0,1
BRDA:2,0,1,0
end_of_record
SF:src/clean.ts
DA:1,1
end_of_record
`,
    );

    const base = await runCli(["--root", root, "--use-existing-coverage"], root);
    expect(base.code).toBe(0);
    const edn = parseEdnDocument(await import("node:fs/promises").then((fs) => fs.readFile(join(root, ".metrics/crap.edn"), "utf8")));
    const entries = (edn.entries as Array<Record<string, unknown>>).map((row) => ({
      namespace: row.namespace,
      name: row.name,
      complexity: row.complexity,
      coverage: row.coverage,
      crap: row.crap,
    }));
    expect(entries).toEqual([
      { namespace: "choose", name: "choose", complexity: 2, coverage: 50, crap: 2.5 },
      { namespace: "clean", name: "clean", complexity: 1, coverage: 100, crap: 1 },
    ]);

    const eq = await runCli(
      ["--root", root, "--use-existing-coverage", "--threshold", "2.5"],
      root,
    );
    expect(eq.code).toBe(0);

    const fail = await runCli(
      ["--root", root, "--use-existing-coverage", "--threshold", "2.49"],
      root,
    );
    expect(fail.code).toBe(2);

    const noCov = await runCli(["--root", root, "--no-coverage"], root);
    expect(noCov.code).toBe(0);
    const noEdn = parseEdnDocument(
      await import("node:fs/promises").then((fs) => fs.readFile(join(root, ".metrics/crap.edn"), "utf8")),
    );
    for (const row of noEdn.entries as Array<Record<string, unknown>>) {
      expect(row.coverage).toBeNull();
      expect(row.crap).toBeNull();
    }

    const single = await runCli(["--root", root, "--no-coverage", "src/choose.ts"], root);
    expect(single.stdout).toContain("choose");
    expect(single.stdout).not.toContain("clean");
  });
});
