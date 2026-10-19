# TypeScript implementation plans

This document provides two executable plans for building
`typescript-crapper`:

- **Plan A — TypeScript Compiler API:** recommended when the goal is the best
  TypeScript analysis and long-term maintainability.
- **Plan B — tree-sitter:** recommended when reproducing
  `crapper-master` metrics is the primary requirement.

Both plans produce a TypeScript CLI with no Python runtime. They share the
same scoring, LCOV, discovery, output, and verification layers.

## Decision summary

| Requirement | Plan A: Compiler API | Plan B: tree-sitter |
| --- | --- | --- |
| Modern TypeScript coverage | Best | Good, grammar-dependent |
| Exact `crapper-master` parity | Requires translation fixtures | Best |
| Malformed-file recovery | Moderate | Best |
| Node packaging | Simpler | Native/WASM considerations |
| Semantic information | Available if needed | Syntax only |
| Parser memory/startup | Higher | Usually lower |
| Recommended for this project | **Yes** | Only for strict compatibility |

The parser should be replaceable behind one small interface. Do not build a
general plugin system: the target has one language family.

## Shared product contract

Before implementation, record these choices in the README and tests:

1. Analyze `.ts`, `.tsx`, `.mts`, and `.cts`.
2. Decide whether `.js`, `.jsx`, `.mjs`, and `.cjs` are supported by default,
   opt-in, or rejected.
3. Keep the established CRAP formula:

   ```text
   CRAP = CC² × (1 − coverage / 100)³ + CC
   ```

4. Keep LCOV as the coverage interchange format.
5. Keep `.metrics/crap.edn` for uml-viewer compatibility.
6. Treat `null` coverage as “coverage not requested” and 0% as “coverage was
   requested but this function was not covered.”
7. Version metric-rule changes that can alter CI thresholds.

Recommended v1 choices:

- TypeScript extensions only by default.
- Existing LCOV and complexity-only modes before automatic test execution.
- Improved function detection with a metric version named in machine-readable
  output or diagnostics.
- Coverage-generation failure is nonzero in CI, with an explicit compatibility
  option if 0% fallback is needed.

## Shared architecture

```text
src/
  cli.ts                    CLI entry and orchestration
  options.ts                argument model and validation
  model.ts                  ParsedFunction, Entry, diagnostics
  discover.ts               source selection and Git changes
  analyze.ts                source → functions → coverage → entries
  scoring.ts                CRAP formula, rounding, sorting
  parser/
    index.ts                parser interface and implementation
    complexity.ts           decision rules
    namespace.ts            path-derived identities
    routes.ts               optional route-handler extraction
  coverage/
    lcov.ts                 LCOV parser
    matching.ts             source/report path association
    load.ts                 report discovery and merge
    run.ts                  optional coverage generation
  output/
    console.ts              human-readable report
    edn.ts                  uml-viewer compatibility snapshot
test/
  fixtures/
  unit/
  integration/
```

Core interfaces:

```ts
export interface ParsedFunction {
  id: string;
  name: string;
  namespace: string;
  path: string;
  complexity: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface Entry extends ParsedFunction {
  coverage: number | null;
  crap: number | null;
}

export interface SourceAnalyzer {
  analyze(source: string, path: string, root: string): AnalysisResult;
}

export interface AnalysisResult {
  functions: ParsedFunction[];
  diagnostics: AnalysisDiagnostic[];
}
```

`id` should be an internal identity such as normalized path plus source start.
EDN should continue emitting only the compatibility fields.

## Shared staged foundation

The following stages apply to both parser plans.

### Stage 0 — Characterization corpus

Create fixtures before writing the new analyzer.

Tasks:

- Port TypeScript examples from `crapper-master/tests/test_typescript.py`.
- Port namespace and unsupported-declaration cases from `test_edges.py`.
- Port LCOV branch, line, missing-file, and path ambiguity cases.
- Port CLI threshold, output, and file-discovery cases.
- Add fixtures for generators, class fields, decorators, object methods,
  getters/setters, logical assignments, JSX, and malformed source.
- Store expected entries explicitly rather than using opaque snapshots.
- Label each fixture as `compatibility`, `improvement`, or `policy`.

Completion criteria:

- Every inherited rule in `typescript-compatibility-spec.md` has a fixture.
- Every intentional change has a fixture demonstrating the old and new result.
- Expected function identities, ranges, complexity, coverage, and CRAP are
  reviewable as data.

### Stage 1 — Project and quality setup

Create the Node package and build pipeline.

Tasks:

- Configure strict TypeScript compilation.
- Build ESM or CJS consistently; do not mix module systems accidentally.
- Expose a `typescript-crapper` executable through `package.json#bin`.
- Add unit, integration, lint, format, and type-check scripts.
- Pin the parser dependency and lockfile.
- Configure CI for supported Node versions and Linux/macOS/Windows.
- Add fixture-based dependency update checks.

Completion criteria:

- A packaged tarball installs into a temporary project and prints help.
- Source maps point runtime failures back to TypeScript sources.
- Type-check, tests, and packaging run without Python.

### Stage 2 — Pure metric and output core

Implement code that does not touch the filesystem.

Tasks:

- Define immutable domain types.
- Implement CRAP scoring with percentage coverage.
- Round stored coverage and CRAP to four decimals.
- Implement deterministic sorting:
  scored entries by descending CRAP, then unscored entries by descending CC.
- Implement console formatting.
- Implement the small EDN subset directly, including string escaping and
  `nil`.

Completion criteria:

- Golden formula, rounding, equality-threshold, sorting, and EDN tests pass.
- Output is deterministic regardless of input enumeration order.
- EDN can be parsed by a real EDN reader in CI.

### Stage 3 — Discovery and selection

Implement source selection independently of AST analysis.

Tasks:

- Normalize internal paths to `/`.
- Walk source roots while pruning dependency, build, coverage, metrics, and
  test directories.
- Exclude declaration files unless support is deliberately added.
- Exclude test files during walking but include an explicitly named test file.
- Support path substring filters.
- Implement `--changed` using NUL-delimited Git porcelain output.
- Deduplicate resolved paths and sort deterministically.

Completion criteria:

- Selection precedence matches the documented CLI.
- Paths with spaces, Unicode, and Windows separators have fixtures.
- Repeated basenames and nested packages do not collapse.

### Stage 4 — LCOV and source matching

Tasks:

- Parse `SF`, `DA`, `BRDA`, and unterminated final records.
- Normalize URL-encoded, `file:`, absolute, relative, and Windows paths.
- Prefer exact matches and require suffix matches to be unambiguous.
- Bind the complete selected source set before suffix matching.
- Use branch coverage when a function range contains branch records;
  otherwise use recorded line coverage.
- Define report merge behavior. Prefer hit aggregation by source, line, and
  branch identity over the source tool's last-write-wins behavior.
- Emit diagnostics for unmatched source files, unmatched report files, and
  ambiguous paths.

Completion criteria:

- All inherited LCOV fixtures pass.
- Two files ending in the same suffix never receive each other's coverage.
- Sharded reports merge according to documented behavior.

### Stage 5 — Analysis pipeline

Tasks:

- Read selected files as UTF-8 with an explicit invalid-input policy.
- Invoke the parser implementation.
- Attach coverage by normalized path and inclusive line range.
- Convert unmatched coverage to 0% only when coverage mode is active.
- Produce entries, calculate CRAP, and sort.
- Aggregate diagnostics without losing successfully parsed files.

Completion criteria:

- Complexity-only and coverage modes are distinguishable.
- One malformed file cannot silently remove valid results from other files.
- Duplicate `(namespace, name)` compatibility keys produce a warning.

### Stage 6 — Read-only CLI

Initially support:

```text
--root
--source-root / -s
--changed
--no-coverage
--use-existing-coverage
--threshold
```

Tasks:

- Use a maintained argument parser but own validation and exit semantics.
- Keep stdout for the report and stderr for diagnostics.
- Write `.metrics/crap.edn` through a same-directory temporary file and rename.
- Make threshold comparison and rounding order explicit.
- Add a verbose/debug mode that explains parser and LCOV associations.

Completion criteria:

- Temporary-project integration tests assert status, stdout, stderr, and EDN.
- Threshold equality passes and strict excess fails.
- Interrupted writes cannot leave a partial final metrics file.

### Stage 7 — Coverage generation

Add this only after read-only analysis is stable.

Tasks:

- Discover the nearest package manifest for each selected source.
- Detect the package manager from project policy/lockfiles.
- Support existing project coverage scripts without rewriting them.
- Add Vitest integration with explicit LCOV destination and selected includes.
- Decide separately whether Jest and generic c8 wrapping belong in v1.
- Execute generated commands as argument arrays.
- Reserve shell execution for the explicit user-provided coverage command.
- Constrain cleanup to tool-owned report directories under the project root.
- Never alter manifests or install providers without explicit consent.

Completion criteria:

- npm, pnpm, Yarn, or Bun support is claimed only when tested.
- Nested packages write isolated reports.
- Failed coverage has a documented status and cannot consume stale reports.
- Paths containing spaces or shell metacharacters remain single arguments.

### Stage 8 — Packaging and release

Tasks:

- Test the packed npm artifact, not only the repository checkout.
- Verify executable permissions and shebang behavior.
- Include licenses for parser/grammar dependencies.
- Publish a metric-rules document and compatibility notes.
- Add a changelog section for score-affecting changes.
- Optionally produce standalone binaries after npm distribution is stable.

Completion criteria:

- `npx typescript-crapper --help` works in a clean environment.
- An example project can run complexity-only and existing-LCOV workflows.
- Release verification compares fixture output with the documented metric
  version.

---

## Plan A — TypeScript Compiler API

This is the recommended plan for better TypeScript analysis.

### A1. Parser setup

Use the `typescript` package to create a `SourceFile`. Select `ScriptKind` from
the extension and use the latest supported language target. Collect parse
diagnostics and return them through `AnalysisResult`.

Do not construct a full `Program` initially. Cyclomatic complexity and source
entry extraction are syntactic, and parsing standalone files is faster and
does not require a valid project configuration.

Add an optional `Program`/`TypeChecker` mode later only for rules that truly
need symbols, such as resolving aliased Express APIs or stable computed names.

### A2. Function extraction policy

Implement visitors for:

- function declarations, including generators and async generators;
- methods, constructors, getters, and setters with stable names;
- top-level variable declarations initialized with arrows/functions;
- class properties initialized with arrows/functions;
- optionally object methods with a documented namespace convention;
- inline route callbacks if Express-compatible route reporting is retained.

Policy recommendations:

- Fold local nested functions and callbacks into their enclosing scored unit.
- Make recognized route callbacks independent entries and exclude their
  subtrees from the parent, preserving current behavior.
- Include class-field arrows as class members.
- Include static string-literal computed names; warn and skip dynamic names.
- Give getters and setters distinct internal IDs and optionally display names
  such as `get value` and `set value` to avoid collisions.

### A3. Complexity visitor

Count one base path and one per:

- `if`;
- iteration statement;
- `catch`;
- conditional expression;
- each `case` and, for compatibility, `default`;
- `&&`, `||`, and `??`;
- each optional property, element, or call chain according to a documented
  rule;
- logical assignment operators only if selected as an intentional improvement.

Implementation constraints:

- Traverse iteratively or ensure generated deep expressions cannot overflow.
- Skip nested class/interface/type bodies when scoring an outer function.
- Skip separately extracted route callbacks from their parent.
- Do not count tokens in types, strings, or comments.
- Centralize decision rules so metric changes are reviewable.

### A4. Source positions

The compiler API exposes UTF-16 offsets. Use:

- line/character APIs for LCOV line ranges;
- UTF-16 offsets for internal IDs only if IDs are explicitly documented as
  parser-specific;
- a conversion utility if compatibility requires UTF-8 byte spans.

Use the complete declaration/declarator span consistently. Add fixtures for
decorators, multiline signatures, trailing newlines, and non-ASCII text.

### A5. Compiler-API-specific verification

- Compare every inherited fixture against `crapper-master`.
- Maintain an allow-list for intentional differences such as generators and
  class fields.
- Test new TypeScript syntax when upgrading `typescript`.
- Benchmark standalone `SourceFile` parsing on a representative repository.
- Verify memory is released between batches rather than retaining ASTs for the
  entire run.

### Plan A exit criteria

Plan A is ready when:

- all compatibility fixtures pass or have named intentional differences;
- generators and class-field arrows produce documented entries;
- parser diagnostics are visible;
- the analyzer handles a representative modern TS/TSX project;
- metric results are deterministic across supported Node versions.

---

## Plan B — tree-sitter compatibility implementation

Choose this plan when matching `crapper-master` is more important than
improving TypeScript coverage.

### B1. Runtime selection

Choose and benchmark one Node binding:

- native tree-sitter bindings for direct node APIs and performance; or
- a WASM binding for simpler cross-platform binary distribution.

Package pinned TypeScript, TSX, and any intentionally supported JavaScript
grammars. Do not download grammars dynamically during analysis.

### B2. Direct rule port

Port the following source behavior literally:

- grammar selection by extension;
- iterative descendant traversal;
- top-level function, method, and lexical-declaration extraction;
- path-derived namespaces;
- existing decision-node set;
- optional-chain wrapper/bare-token handling;
- nested class/interface subtree skipping;
- Express callback discovery, labeling, and parent exclusion;
- UTF-8 byte and 1-based inclusive line spans.

Keep function names and test cases aligned with the Python source during the
port so review can compare rules one by one.

### B3. Error handling improvement

Unlike `crapper-master`, inspect tree error/missing nodes:

- emit a warning with file and range;
- continue with recovered entries by default;
- support strict mode to fail on parse errors.

This improves observability without changing valid-source scores.

### B4. Compatibility verification

Build a differential runner:

1. Run both tools over the same fixture tree with existing LCOV.
2. Parse both EDN files.
3. Normalize ordering and numeric representation.
4. Compare identities, ranges from debug output, complexity, coverage, and
   CRAP.
5. Require an explicit allow-list entry for every difference.

Run the differential suite whenever grammar or binding versions change.

### B5. Deferred improvements

After parity, add missing constructs in a new metric version:

- generators;
- class-field arrows;
- object methods;
- static computed methods;
- logical assignments.

Do not mix these additions into the parity milestone because failures become
difficult to classify as port defects or intended changes.

### Plan B exit criteria

Plan B is ready when:

- valid-source fixture output matches `crapper-master`;
- malformed-source diagnostics are better without affecting recovered valid
  entries;
- native/WASM packaging works on all supported platforms;
- parser and grammar versions are pinned;
- differential tests gate dependency updates.

## Recommended execution

Use **Plan A** with the shared stages in this order:

1. Characterization corpus.
2. Pure scoring and output.
3. Compiler API parser and complexity rules.
4. LCOV parser and path matching.
5. Discovery and read-only CLI.
6. Differential testing against `crapper-master`.
7. Automatic coverage generation.
8. Packaging and release.

Keep a `SourceAnalyzer` interface and the compatibility fixtures. This retains
the option to add a tree-sitter analyzer later without designing the whole
application around multiple parsers today.

## Completion checklist

- [ ] Product extension and compatibility policies are documented.
- [ ] Metric rules and version are documented.
- [ ] Characterization fixtures cover inherited and improved behavior.
- [ ] Parser reports diagnostics and produces stable identities/ranges.
- [ ] CRAP calculation, rounding, sorting, and threshold are tested.
- [ ] LCOV branch/line behavior and ambiguous paths are tested.
- [ ] Discovery and Git selection are deterministic.
- [ ] EDN remains compatible and is written atomically.
- [ ] Generated subprocesses do not use a shell.
- [ ] Coverage failure and stale-report policies are explicit.
- [ ] Packed CLI works without Python in a clean project.
- [ ] Score-affecting dependency updates run fixture/differential checks.

