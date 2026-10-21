# `typescript-crapper` implementation blueprint

## Goal

Build a Node.js CLI written in TypeScript that computes CRAP scores for
TypeScript code without requiring Python. Preserve the useful behavioral
contract of the legacy Python crapper, while making deviations explicit and tested.

This is an implementation plan, not a claim about current code.

## Product boundary

The smallest coherent first version:

- discovers TypeScript-family source files;
- parses functions and computes cyclomatic complexity;
- reads existing LCOV;
- can optionally generate LCOV for npm packages;
- prints a sorted report;
- writes `.metrics/crap.edn`;
- enforces an optional CRAP threshold.

No language plugin abstraction is needed until another language is actually
planned. Internal boundaries should follow concerns, not languages.

## Proposed package structure

```text
package.json
tsconfig.json
src/
  cli.ts
  options.ts
  discover.ts
  analyze.ts
  model.ts
  scoring.ts
  parser/
    index.ts
    complexity.ts
    namespaces.ts
    routes.ts
  coverage/
    lcov.ts
    matching.ts
    load.ts
    run.ts
  output/
    report.ts
    edn.ts
test/
  fixtures/
  cli.test.ts
  discover.test.ts
  parser.test.ts
  routes.test.ts
  lcov.test.ts
  matching.test.ts
  scoring.test.ts
  coverage-runner.test.ts
  output.test.ts
```

### Dependency direction

```text
cli
 ├─ discover
 ├─ coverage/run → coverage/load → lcov + matching
 ├─ analyze → parser + scoring
 └─ output

model is dependency-free and shared by all layers.
```

Keep subprocess execution and filesystem access behind injectable functions so
tests do not run npm, Git, or coverage tools.

## Core types

```ts
export interface ParsedFunction {
  id: string;
  name: string;
  namespace: string;
  complexity: number;
  startLine: number;
  endLine: number;
  path: string;
  startOffset: number;
  endOffset: number;
}

export interface Entry extends ParsedFunction {
  coverage: number | null;
  crap: number | null;
}

export interface FileCoverage {
  lines: Map<number, boolean>;
  branches: Map<number, { covered: number; total: number }>;
}
```

Use `null` only for “coverage was not requested.” A missing LCOV match in
coverage mode should resolve to `0`, preserving the source contract.

## Parser choice

The original uses tree-sitter and its exact node kinds define the current
metric. There are two viable approaches:

### Tree-sitter

Pros:

- closest behavioral parity;
- error-tolerant parsing;
- byte spans are native;
- TS, TSX, and JS grammar behavior is already understood.

Costs:

- grammar/WASM or native packaging complexity;
- node APIs differ among Node bindings;
- optional-chain node shapes must be locked to parser versions.

### TypeScript compiler API

Pros:

- native ecosystem dependency;
- semantic syntax kinds and straightforward traversal;
- easier support for modern TypeScript constructs.

Costs:

- complexity values can drift from the established tree-sitter contract;
- JavaScript/JSX and malformed-source behavior need deliberate handling;
- byte spans require UTF-8 conversion because compiler offsets are UTF-16.

Version 1 uses the TypeScript Compiler API, as decided in
`v1-decisions.md`. Build the golden fixture suite first, document every
intentional score change, and pin the `typescript` dependency. Tree-sitter
remains a documented alternative only for a future strict-parity implementation.

## Pure computation layer

Implement and test these before CLI or subprocess work:

1. `crapScore(complexity, coverage)`.
2. Four-decimal metric rounding.
3. Stable result ordering.
4. Namespace derivation.
5. AST function extraction and decision counting.
6. Route handler extraction and parent-subtree exclusion.
7. LCOV parsing.
8. Unambiguous path matching.
9. Branch-first function coverage.
10. EDN and console rendering.

These functions should accept strings/data and return values without touching
the filesystem.

## CLI and filesystem layer

Preserve initial flags unless product decisions say otherwise:

```text
--root
--source-root / -s
--changed
--no-coverage
--use-existing-coverage
--coverage-command
--threshold
```

Use a maintained argument parser, but assert exact validation and exit
semantics in integration tests. Avoid letting parser defaults accidentally
change help/error streams.

Use `fs.realpath`, `path.relative`, and normalized `/` representation at the
model boundary. Keep native paths for process working directories. Walk
iteratively and prune excluded directories before reading their children.

For `--changed`, execute Git with an argument array and parse NUL-delimited
porcelain output. Do not parse human-formatted status.

## Coverage runner

Start with “read existing LCOV” as the reliable core. Add generation as a
separate adapter:

```ts
interface ProcessRunner {
  run(command: string, args: string[], cwd: string): Promise<number>;
  runShell(command: string, cwd: string): Promise<number>;
}
```

Internally generated commands must use argument arrays. Only the explicitly
user-authored `--coverage-command` should invoke a shell.

Package discovery should return the nearest `package.json` for each selected
source and deduplicate package roots. Each package run needs its own output
directory. Decide whether package-manager detection is in v1; the inherited
implementation assumes npm and should not silently run npm in pnpm/Yarn/Bun
workspaces.

Prefer not to mutate dependency state automatically. The inherited Vitest
provider installation carefully restores manifests but still changes
`node_modules`. A safer native design can:

- report a clear missing-provider error;
- optionally support an explicit `--install-coverage-provider`;
- or run a transient package-manager command only after the user opts in.

Whichever policy is chosen must be reflected in exit behavior and docs.

## Output strategy

Keep EDN rendering dependency-free; the required subset is only a map, vector,
keyword keys, strings, numbers, and `nil`. Escape backslashes and quotes.

Write metrics atomically:

1. create `.metrics`;
2. write a temporary file in the same directory;
3. rename it to `crap.edn`.

This improves on the source implementation while preserving the resulting
file. Include JSON output later only if a consumer requires it; it should not
replace EDN compatibility by accident.

## Verification strategy

### Golden characterization

Port source snippets and expected entries from:

- `test/unit/parser.test.ts` (ported fixtures);
- TypeScript and path cases in `test_edges.py`;
- LCOV cases in `test_coverage.py`;
- TypeScript command cases in `test_runners.py`;
- CLI, score, output, and threshold cases in `test_cli.py` and `test_crap.py`.

Store expected parsed entries as data:

```ts
expect(parseFunctions(source, "src/demo/box.ts", root)).toEqual([
  {
    namespace: "demo.box",
    name: "choose",
    complexity: 7,
    // ranges...
  },
]);
```

Avoid snapshots for formulas and path matching; explicit assertions make
behavioral changes visible.

### Test layers

| Layer | Scope |
| --- | --- |
| Unit | score, paths, AST nodes, LCOV, formatting |
| Fixture | complete source files and complete LCOV reports |
| Integration | temp project, CLI streams/files/status |
| Runner | injected process results and captured command arrays |
| End-to-end | tiny real Vitest project, run sparingly |

Test on Linux, macOS, and Windows because path normalization, executable
resolution, shell invocation, and rename semantics differ.

### Differential harness

Optionally, with an external checkout of the legacy Python tool, create a temporary corpus, run both tools
with `--use-existing-coverage`, and compare normalized EDN entries. This is the
fastest way to detect unintended parser/range/coverage drift. Exclude intended
improvements with named allow-list fixtures rather than broad tolerances.

## Suggested delivery sequence

1. **Contract harness**: fixture corpus and expected normalized results.
2. **Score/output core**: model, formula, sort, report, EDN.
3. **Parser core**: namespaces, entries, complexity, route callbacks.
4. **LCOV core**: parse, match, range coverage, report loading.
5. **Read-only CLI**: discovery plus `--use-existing-coverage` and
   `--no-coverage`.
6. **Git and policy**: `--changed`, filtering, threshold.
7. **Coverage generation**: package discovery, Vitest, generic test runner,
   custom command.
8. **Hardening**: malformed files, workspaces, Windows, atomic output, large
   trees, process interruption.

Each stage should produce a usable vertical slice rather than scaffolding all
modules before behavior exists.

## Definition of compatibility

For the same selected source set and LCOV input, the new tool is compatible
when it produces the same:

- entry set and source order before scoring;
- namespace/name identities;
- complexity values;
- inclusive line ranges;
- coverage percentages;
- four-decimal CRAP values;
- report sort order;
- EDN values;
- threshold status.

Console spacing, warning wording, and help wording can be considered separately
unless scripts already consume them.

## Nonfunctional requirements

- No Python runtime or Python subprocess.
- Deterministic output independent of filesystem enumeration order.
- No shell for generated commands.
- No unrequested package manifest changes.
- Clear behavior on parse errors and malformed LCOV.
- Bounded memory for ordinary repositories and iterative AST walking where
  deep generated trees are possible.
- Pinned parser behavior with automated dependency-update verification.

