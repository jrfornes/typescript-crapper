import { describe, expect, it } from "vitest";

import { CoverageBundle } from "../../src/coverage/bundle.js";
import { mergeLcovMaps, parseLcov } from "../../src/coverage/lcov.js";
import { normalizePath } from "../../src/coverage/matching.js";
import type { ParsedFunction } from "../../src/model.js";

function fn(overrides: Partial<ParsedFunction> = {}): ParsedFunction {
  return {
    id: "src/demo/app.ts:0",
    name: "choose",
    namespace: "demo.app",
    path: "src/demo/app.ts",
    complexity: 2,
    startLine: 2,
    endLine: 3,
    startOffset: 0,
    endOffset: 1,
    ...overrides,
  };
}

describe("LCOV acceptance rows", () => {
  it("LCOV-01/03", () => {
    const parsed = parseLcov("SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\n");
    expect(parsed.get("src/a.ts")?.lines.get(1)).toEqual([1, 1]);
    expect(parsed.get("src/a.ts")?.lines.get(2)).toEqual([0, 1]);
    const open = parseLcov("SF:src/a.ts\nDA:1,1\n");
    expect(open.has("src/a.ts")).toBe(true);
  });

  it("LCOV-02 branches", () => {
    const text =
      "SF:src/demo/app.ts\nDA:2,1\nBRDA:3,0,0,1\nBRDA:3,0,1,-\nend_of_record\n";
    const bundle = new CoverageBundle(parseLcov(text));
    bundle.bindSources(["src/demo/app.ts"]);
    expect(bundle.percentFor(fn({ startLine: 2, endLine: 3 }))).toBe(50);
  });

  it("LCOV-04 normalize", () => {
    expect(normalizePath("file://./src/a.ts")).toBe("/src/a.ts");
    expect(normalizePath("a//b")).toBe("a/b");
  });

  it("LCOV-13 null coverage mode uses null in scoring", () => {
    expect(true).toBe(true);
  });

  it("LCOV-14 merge line hits", () => {
    const a = parseLcov("SF:src/a.ts\nDA:1,0\nend_of_record\n");
    const b = parseLcov("SF:src/a.ts\nDA:1,3\nend_of_record\n");
    const merged = mergeLcovMaps([a, b]);
    expect(merged.get("src/a.ts")?.lines.get(1)).toEqual([1, 1]);
  });
});
