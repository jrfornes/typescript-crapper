import { describe, expect, it } from "vitest";

import {
  crapScore,
  makeEntry,
  roundMetric,
  sortEntries,
  thresholdExceeded,
} from "../../src/scoring.js";
import type { ParsedFunction } from "../../src/model.js";

function fn(overrides: Partial<ParsedFunction> = {}): ParsedFunction {
  return {
    id: "demo.ts:0",
    name: "score",
    namespace: "demo.core",
    path: "src/demo.ts",
    complexity: 1,
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: 1,
    ...overrides,
  };
}

describe("SCORE acceptance rows", () => {
  it("SCORE-01", () => expect(crapScore(1, 100)).toBe(1));
  it("SCORE-02", () => expect(crapScore(2, 0)).toBe(6));
  it("SCORE-03", () => expect(crapScore(5, 0)).toBe(30));
  it("SCORE-04", () => expect(crapScore(5, 100)).toBe(5));
  it("SCORE-05", () => expect(crapScore(8, 45)).toBeCloseTo(18.648, 3));
  it("SCORE-06", () => expect(crapScore(3, null)).toBeNull());
  it("SCORE-07", () => expect(roundMetric(2.555559)).toBe(2.5556));
  it("SCORE-08", () =>
    expect(thresholdExceeded([makeEntry(fn({ complexity: 2 }), 50)], 2.5)).toBe(false));
  it("SCORE-09", () =>
    expect(thresholdExceeded([makeEntry(fn({ complexity: 2 }), 50)], 2.49)).toBe(true));
});

describe("OUT sorting rows", () => {
  it("OUT-01/03/04", () => {
    const sorted = sortEntries([
      makeEntry(fn({ name: "missing", complexity: 8 }), null),
      makeEntry(fn({ name: "mid", complexity: 2 }), 100),
      makeEntry(fn({ name: "worst", complexity: 5 }), 0),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["worst", "mid", "missing"]);
  });
});
