import { parseEdnDocument } from "../helpers/parseEdn.js";
import { describe, expect, it } from "vitest";

import { makeEntry } from "../../src/scoring.js";
import { renderEdn } from "../../src/output/edn.js";
import type { ParsedFunction } from "../../src/model.js";

function fn(overrides: Partial<ParsedFunction> = {}): ParsedFunction {
  return {
    id: "demo.ts:0",
    name: "layout",
    namespace: "uml-viewer.layout",
    path: "src/demo.ts",
    complexity: 8,
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: 1,
    ...overrides,
  };
}

describe("OUT EDN rows", () => {
  it("OUT-05/06/07/09", () => {
    expect(renderEdn([])).toBe("{:entries []}\n");
    const text = renderEdn([
      makeEntry(fn(), 82),
      makeEntry(fn({ name: "na", complexity: 3 }), null),
    ]);
    expect(text).toContain(":coverage 82.0");
    expect(text).toContain(":coverage nil");
    expect(text).toContain(":crap nil");
  });

  it("OUT-08 escapes quotes", () => {
    const text = renderEdn([
      makeEntry(fn({ name: 'say "hi"', namespace: 'a\\b' }), 100),
    ]);
    const parsed = parseEdnDocument(text);
    const entries = parsed.entries as Array<Record<string, unknown>>;
    expect(entries[0]?.name).toBe('say "hi"');
  });

  it("independent EDN reader", () => {
    const text = renderEdn([makeEntry(fn({ name: "choose", namespace: "choose", complexity: 2 }), 50)]);
    const parsed = parseEdnDocument(text);
    const entries = parsed.entries as Array<Record<string, unknown>>;
    expect(entries[0]?.crap).toBe(2.5);
  });
});
