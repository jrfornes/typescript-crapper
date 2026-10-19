# Coding-agent implementation guide

## Goal

Implement `typescript-crapper` as a TypeScript/Node CLI that analyzes
TypeScript source, combines cyclomatic complexity with LCOV coverage, and
writes CRAP metrics. The shipped product must not require Python.

`crapper-master/` is a read-only behavioral reference. Do not extend its
multi-language Python implementation.

## Start here

Read these documents in order:

1. `docs/v1-decisions.md` — authoritative product and metric decisions.
2. `docs/compiler-api-analysis-rules.md` — exact Compiler API extraction and
   complexity rules.
3. `docs/acceptance-test-matrix.md` — required automated behavior.
4. `docs/implementation-plans.md` — execute Plan A and its shared stages.
5. `docs/typescript-compatibility-spec.md` — inherited baseline.
6. `docs/crapper-master-architecture.md` — source-system context.

If these disagree, the earlier document wins. Do not silently choose a
different parser or reopen settled v1 decisions.

## Required implementation direction

- Language: TypeScript with strict type checking.
- Runtime: supported Node.js LTS releases.
- Parser: public TypeScript Compiler API from a pinned `typescript` package.
- Input extensions: `.ts`, `.tsx`, `.mts`, `.cts`.
- Coverage: LCOV.
- Compatibility output: `.metrics/crap.edn`.
- Metric version: `typescript-crapper-v1`.
- Final default: generate coverage; also support existing-coverage and
  complexity-only modes.
- No Python runtime, subprocess, or package dependency in the product.

## Work order

Implement vertical slices in this order:

1. Package/build/test setup.
2. Domain types, CRAP formula, rounding, sorting, EDN and console output.
3. Compiler API parser, namespaces, function extraction, complexity and route
   handlers.
4. LCOV parsing, merging, path matching and function percentages.
5. Discovery, Git selection and read-only CLI modes.
6. End-to-end golden project and differential checks.
7. Coverage generation for npm/Vitest/c8.
8. Packed-artifact and cross-platform verification.

Commit each independently working logical stage. Avoid scaffolding every file
before one path works end to end.

## Non-negotiable invariants

- CRAP is `CC² × (1 − coverage / 100)³ + CC`.
- Complexity starts at 1.
- Coverage `null` means it was not requested; missing function coverage in an
  active coverage run is 0%.
- Branch records inside a function range take precedence over line records.
- Threshold comparison is strict `>` after four-decimal metric rounding.
- Project-root-relative identity does not change with `--source-root`.
- Generated commands use argument arrays; only a user-provided custom command
  uses a shell.
- Never install coverage providers or mutate package manifests automatically.
- Never consume stale coverage after generation failure.
- Write final EDN atomically and only after fatal checks succeed.
- Keep parser diagnostics visible; `--strict` promotes them to failure.

## Testing rules

- Convert `docs/acceptance-test-matrix.md` rows into explicit tests.
- Prefer input/output tests for pure modules.
- Mock filesystem/process boundaries in unit tests.
- Use temporary directories for CLI integration tests.
- Test the packed npm artifact before considering a release complete.
- Assert command arrays, not rendered shell strings.
- Parse EDN with an independent reader in at least one test.
- Pin and review parser upgrades because syntax-tree changes can alter scores.

Do not update expected metrics merely to make a failing test pass. Determine
whether the implementation violates the metric rules or the metric version
must intentionally change.

## Behavioral source anchors

Use these only to understand inherited behavior:

| Concern | Reference |
| --- | --- |
| Formula and sorting | `crapper-master/src/crapper/crap.py` |
| Pipeline | `crapper-master/src/crapper/analyze.py` |
| Discovery and CLI | `crapper-master/src/crapper/discover.py`, `cli.py` |
| TypeScript tree-sitter rules | `crapper-master/src/crapper/languages/typescript.py` |
| Iterative complexity | `crapper-master/src/crapper/languages/treesitter.py` |
| LCOV and path matching | `crapper-master/src/crapper/coverage.py` |
| Coverage commands | `crapper-master/src/crapper/runners.py` |
| EDN and console | `crapper-master/src/crapper/metrics.py`, `report.py` |
| Characterization tests | `crapper-master/tests/test_typescript.py`, `test_coverage.py`, `test_edges.py`, `test_runners.py`, `test_cli.py`, `test_crap.py` |

The Python UML artifact is stale and references a missing language factory.
Do not reproduce that abstraction.

## Scope control

Version 1 does not include:

- JavaScript source analysis;
- other programming languages;
- semantic/type-checker-based Express resolution;
- `tsconfig` alias-based namespaces;
- mutation testing;
- historical identity across renames;
- JSON/SARIF/HTML output unless separately requested;
- automatic provider installation.

Keep extension points small, but do not build speculative plugin systems.

## Completion handoff

A completed implementation must report:

- supported Node and package-manager versions;
- commands run for type-check, tests, packaging, and smoke verification;
- acceptance rows intentionally deferred, if any;
- expected differences from `crapper-master`;
- metric-version changes, if any;
- coverage-generation and parse diagnostics demonstrated in tests.

