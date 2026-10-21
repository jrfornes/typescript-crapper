# Coding-agent implementation guide

## Goal

Implement and maintain `typescript-crapper` as a TypeScript/Node CLI that
analyzes TypeScript source, combines cyclomatic complexity with LCOV coverage,
and writes CRAP metrics. The shipped product must not require Python.

## Start here

Read these documents in order:

1. `docs/v1-decisions.md` — authoritative product and metric decisions.
2. `docs/compiler-api-analysis-rules.md` — exact Compiler API extraction and
   complexity rules.
3. `docs/acceptance-test-matrix.md` — required automated behavior.
4. `docs/implementation-plans.md` — execute Plan A and its shared stages.
5. `docs/typescript-compatibility-spec.md` — inherited baseline (historical).
6. `docs/crapper-master-architecture.md` — former Python pipeline (historical).

If these disagree, the earlier document wins. Do not silently choose a
different parser or reopen settled v1 decisions.

## Required implementation direction

- Language: TypeScript with strict type checking.
- Runtime: supported Node.js LTS releases.
- Parser: public TypeScript Compiler API from a pinned `typescript` package.
- Input extensions: `.ts`, `.tsx`, `.mts`, `.cts`.
- Coverage: LCOV (`coverage/**/lcov.info`, not HTML reports).
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
6. End-to-end golden project and fixture checks.
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

- Convert `docs/acceptance-test-matrix.md` rows into explicit tests under
  `test/`.
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

## In-repo source of truth

| Concern | Reference |
| --- | --- |
| Formula and sorting | `src/scoring.ts` |
| Pipeline | `src/analyze.ts`, `src/cli.ts` |
| Discovery and CLI | `src/discover.ts`, `src/options.ts` |
| Parser and complexity | `src/parser/` |
| LCOV and path matching | `src/coverage/` |
| Coverage commands | `src/coverage/run.ts` |
| EDN and console | `src/output/` |
| Automated behavior | `test/unit/`, `test/integration/` |

## Scope control

Version 1 does not include:

- JavaScript source analysis;
- other programming languages;
- semantic/type-checker-based Express resolution;
- `tsconfig` alias-based namespaces;
- mutation testing;
- historical identity across renames;
- JSON/SARIF/HTML coverage input;
- automatic provider installation.

Keep extension points small, but do not build speculative plugin systems.

## Completion handoff

A completed change should report:

- supported Node and package-manager versions;
- commands run for type-check, tests, packaging, and smoke verification;
- acceptance rows intentionally deferred, if any;
- intentional metric or compatibility differences documented in `docs/`;
- metric-version changes, if any;
- coverage-generation and parse diagnostics demonstrated in tests.
