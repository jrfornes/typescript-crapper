# `typescript-crapper` documentation

This folder defines the **typescript-crapper-v1** product: metric rules, parser
behavior, acceptance criteria, and implementation history. The shipped tool
is TypeScript-only and does not require Python.

## Documents

1. [Version 1 decisions](v1-decisions.md) — authoritative product and metric
   contract.
2. [Compiler API analysis rules](compiler-api-analysis-rules.md) maps the v1
   contract to the TypeScript Compiler API.
3. [Acceptance test matrix](acceptance-test-matrix.md) — required automated
   behavior and golden project.
4. [Legacy Python architecture](crapper-master-architecture.md) — historical
   pipeline of the former multi-language reference tool (no longer vendored in
   this repository).
5. [TypeScript compatibility specification](typescript-compatibility-spec.md)
   — inherited behavioral baseline for discovery, complexity, LCOV, and routes.
6. [Implementation blueprint](typescript-crapper-blueprint.md) — package
   structure and delivery phases.
7. [Implementation plans](implementation-plans.md) — staged Plan A (Compiler
   API) and Plan B (tree-sitter) notes.
8. [Decisions and risks](decisions-and-risks.md) — ambiguous or intentional
   divergences from the inherited baseline.

Coding agents should start with the repository-root `AGENTS.md`.

## Scope

Version 1 analyzes `.ts`, `.tsx`, `.mts`, and `.cts` only. It emits
`.metrics/crap.edn` for uml-viewer compatibility and reads **LCOV**
(`lcov.info`), not HTML coverage reports.

Authoritative behavior lives in `docs/v1-decisions.md`,
`docs/compiler-api-analysis-rules.md`, and the `test/` suite. The TypeScript
implementation under `src/` is the runtime source of truth.

## Key compatibility invariants

- CRAP is `CC² × (1 − coverage / 100)³ + CC`.
- Complexity starts at 1 and adds one for each recognized decision.
- Requested coverage that does not mention a function means 0% coverage.
- `--no-coverage` means coverage and CRAP are absent (`nil`/`N/A`), not 0%.
- LCOV branch records within a function take precedence over line records.
- Results are sorted by descending CRAP; unscored entries follow.
- Default discovery excludes tests and generated/dependency directories.
- Explicitly named test files are analyzed.
- Express inline route handlers are separate entries and are not also charged
  to an enclosing function.

## Source map (this repository)

| Concern | Implementation | Tests |
| --- | --- | --- |
| CLI and selection | `src/cli.ts`, `src/discover.ts`, `src/options.ts` | `test/integration/cli.test.ts`, `test/unit/discover.test.ts` |
| Pipeline and scoring | `src/analyze.ts`, `src/scoring.ts` | `test/integration/golden.test.ts`, `test/unit/scoring.test.ts` |
| TypeScript analysis | `src/parser/` | `test/unit/parser.test.ts` |
| LCOV matching | `src/coverage/` | `test/unit/lcov.test.ts` |
| Console and EDN | `src/output/` | `test/unit/edn.test.ts` |
