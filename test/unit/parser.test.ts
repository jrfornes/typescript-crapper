import { describe, expect, it } from "vitest";

import { analyzeSource, moduleNamespace } from "../../src/parser/index.js";

const ROOT = "/proj";

describe("NS namespace rows", () => {
  it("NS-01", () =>
    expect(moduleNamespace("/repo/src/demo/box.ts", "/repo")).toBe("demo.box"));
  it("NS-02", () =>
    expect(moduleNamespace("/repo/demo/box.ts", "/repo")).toBe("demo.box"));
  it("NS-03", () =>
    expect(moduleNamespace("/repo/packages/web/src/app.ts", "/repo")).toBe(
      "packages.web.src.app",
    ));
  it("NS-04", () => {
    const ns = moduleNamespace("/repo/packages/web/src/app.ts", "/repo");
    expect(ns).toBe("packages.web.src.app");
  });
});

describe("inherited typescript fixtures", () => {
  it("function, class method, arrow, outer", () => {
    const source = `
export function choose(x: number): number {
  if (x > 0 && x < 10) return 1;
  for (let i = 0; i < x; i++) {
    if (i === 2) return i;
  }
  try {
    return x;
  } catch (e) {
    return 0;
  }
  return x > 0 ? 1 : 0;
}

export class Box {
  open(flag?: boolean): number {
    return flag ? 1 : 0;
  }
}

const arrow = (n: number) => (n > 0 ? n : 0);

function outer() {
  function inner(n: number) {
    if (n) return 1;
    return 0;
  }
  return inner(1);
}
`;
    const { functions } = analyzeSource(source, "src/demo/box.ts", ROOT);
    expect(functions.map((fn) => [fn.namespace, fn.name, fn.complexity])).toEqual([
      ["demo.box", "choose", 7],
      ["demo.box.Box", "open", 2],
      ["demo.box", "arrow", 2],
      ["demo.box", "outer", 2],
    ]);
  });

  it("CC nullish and optional chains", () => {
    const source = `
export function choose(a, b, c) {
  return a ?? b?.c ?? c?.() ?? c?.[0];
}
export function text() {
  return "a ?? b?.c";
}
`;
    const { functions } = analyzeSource(source, "src/demo/box.ts", ROOT);
    expect(functions.map((fn) => [fn.name, fn.complexity])).toEqual([
      ["choose", 7],
      ["text", 1],
    ]);
  });

  it("ROUTE express handlers", () => {
    const source = `
export function mount(app) {
  const extra = [1].map((n) => (n ? 1 : 0));
  app.get("/users", (req, res) => {
    if (req.query.q) return 1;
    return 0;
  });
  app.post("/users", function (req, res) {
    return req.body ?? {};
  });
  app.use((req, res, next) => next());
  app.route("/items").get((req, res) => res.send(1)).post((req, res) => res.send(2));
  return extra;
}
app.get("/health", async (req, res) => res.send(req.query.ok ?? "no"));
app.get("/users", (req, res, next) => next(), (req, res) => res.send(req.id ?? 0));
app.delete(\`/users/\${id}\`, ((req, res) => res.send(1)));
`;
    const { functions } = analyzeSource(source, "src/demo/routes.ts", ROOT);
    expect(functions.map((fn) => [fn.name, fn.complexity])).toEqual([
      ["mount", 2],
      ["GET /users", 2],
      ["POST /users", 2],
      ["USE", 1],
      ["GET /items", 1],
      ["POST /items", 1],
      ["GET /health", 2],
      ["GET /users#2", 1],
      ["GET /users#3", 2],
      ["DELETE /users/${id}", 1],
    ]);
  });

  it("NS-05 namespace API", () => {
    const source = `namespace API { export function run() {} }`;
    const { functions } = analyzeSource(source, "src/app.ts", "/repo");
    expect(functions[0]?.namespace).toBe("app.API");
  });

  it("CC-03 loops in one function", () => {
    const source = `
export function loops() {
  for (;;) {}
  for (const x in obj) {}
  for (const x of obj) {}
  while (true) {}
  do {} while (true);
}
`;
    const { functions } = analyzeSource(source, "src/loops.ts", ROOT);
    expect(functions[0]?.complexity).toBe(6);
  });

  it("CC-18 deep optional chain", () => {
    const terms = Array.from({ length: 1200 }, (_, i) => `a${i}?.b`).join(" ?? ");
    const source = `export function deep() { return ${terms}; }`;
    const { functions } = analyzeSource(source, "src/deep.ts", ROOT);
    expect(functions[0]?.complexity).toBeGreaterThan(100);
  });
});
