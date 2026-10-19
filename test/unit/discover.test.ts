import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  isTestFile,
  isTypeScriptSource,
  iterSourceFiles,
  resolveSelectedFiles,
} from "../../src/discover.js";

describe("DISC discovery rows", () => {
  it("DISC-01/02/03", () => {
    expect(isTypeScriptSource("a.ts")).toBe(true);
    expect(isTypeScriptSource("a.tsx")).toBe(true);
    expect(isTypeScriptSource("a.d.ts")).toBe(false);
    expect(isTypeScriptSource("a.js")).toBe(false);
  });

  it("DISC-04/05/06/07/08", async () => {
    const root = await mkdtemp(join(tmpdir(), "crapper-disc-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "src/__tests__"), { recursive: true });
    await mkdir(join(root, "node_modules/pkg"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export const x = 1;\n");
    await writeFile(join(root, "src/app.test.ts"), "export const t = 1;\n");
    await writeFile(join(root, "src/__tests__/bad.ts"), "export const b = 1;\n");
    await writeFile(join(root, "node_modules/pkg/hidden.ts"), "export const h = 1;\n");

    const walked = await iterSourceFiles([root], root, false);
    expect(walked.some((p) => p.endsWith("src/app.ts"))).toBe(true);
    expect(walked.some((p) => p.endsWith("app.test.ts"))).toBe(false);
    expect(walked.some((p) => p.includes("__tests__"))).toBe(false);
    expect(walked.some((p) => p.includes("node_modules"))).toBe(false);

    const explicit = await resolveSelectedFiles({
      projectRoot: root,
      sourceRoots: [],
      positionals: ["src/app.test.ts"],
      changed: false,
    });
    expect(explicit.some((p) => p.endsWith("app.test.ts"))).toBe(true);
  });

  it("DISC-13 unicode path", async () => {
    const root = await mkdtemp(join(tmpdir(), "crapper-unicode-"));
    const dir = join(root, "src", "café");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "file.ts");
    await writeFile(file, "export function run() {}\n");
    const selected = await resolveSelectedFiles({
      projectRoot: root,
      sourceRoots: [],
      positionals: [],
      changed: false,
    });
    expect(selected.some((p) => p.includes("café"))).toBe(true);
  });

  it("test file naming", () => {
    expect(isTestFile("src/foo.test.ts")).toBe(true);
    expect(isTestFile("tests/foo.ts")).toBe(true);
  });
});
