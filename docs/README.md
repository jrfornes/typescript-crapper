# `typescript-crapper` discovery notes

This folder captures the behavior of `crapper-master` that matters when
building a TypeScript-only replacement. It separates observed behavior from
proposed design so the new implementation does not accidentally inherit
multi-language complexity or silently change established results.

## Documents

1. [Version 1 decisions](v1-decisions.md) is the authoritative product and
   metric contract.
2. [Compiler API analysis rules](compiler-api-analysis-rules.md) maps the v1
   contract to TypeScript Compiler API syntax.
3. [Acceptance test matrix](acceptance-test-matrix.md) defines the required
   automated behavior and end-to-end golden project.
4. [Source architecture](crapper-master-architecture.md) explains the current
   pipeline, data model, CLI, coverage workflow, outputs, and failure behavior.
5. [TypeScript compatibility specification](typescript-compatibility-spec.md)
   is the testable contract for source discovery, function extraction,
   complexity, namespaces, LCOV, and Express route handlers.
6. [Implementation blueprint](typescript-crapper-blueprint.md) proposes a
   TypeScript-native package structure, delivery phases, and test strategy.
7. [Implementation plans](implementation-plans.md) provides staged plans for
   the TypeScript Compiler API and tree-sitter, with deliverables and exit
   criteria.
8. [Decisions and risks](decisions-and-risks.md) lists behavior that is
   ambiguous, surprising, incomplete, or intentionally pending a product
   decision.

Coding agents should start with the repository-root `AGENTS.md`, which defines
the reading order, work sequence, invariants, and scope.

## Scope

The source project lives in `crapper-master/`. It is a Python 3.11 tool that
uses tree-sitter for TypeScript parsing and emits a crap4clj-compatible EDN
snapshot. The target project should be implemented in TypeScript and require
no Python runtime.

The compatibility baseline includes TypeScript, TSX, and JavaScript because
`crapper-master` puts all of these extensions in its internal `"typescript"`
language bucket. Version 1 deliberately accepts only `.ts`, `.tsx`, `.mts`,
and `.cts`, as recorded in [Version 1 decisions](v1-decisions.md).

## Source evidence hierarchy

For claims about `crapper-master`, use this order:

1. Tests in `crapper-master/tests/`
2. Runtime code in `crapper-master/src/crapper/`
3. `crapper-master/README.md`
4. Generated UML and examples

For the new implementation, `v1-decisions.md` and
`compiler-api-analysis-rules.md` override inherited behavior.

The generated UML is stale in at least one important way: it references
`crapper.languages.language`, `LanguageFactory`, and `UnknownFactory`, but no
such source module exists. Runtime dispatch is the `_READERS` map in
`src/crapper/languages/__init__.py`.

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
- `.metrics/crap.edn` remains the compatibility output for uml-viewer.

## Source map

| Concern | Primary source | Contract tests |
| --- | --- | --- |
| CLI and selection | `src/crapper/cli.py`, `discover.py` | `test_cli.py`, `test_edges.py` |
| Pipeline and scoring | `analyze.py`, `crap.py`, `model.py` | `test_crap.py`, `test_edges.py` |
| TypeScript AST behavior | `languages/typescript.py`, `treesitter.py` | `test_typescript.py`, `test_edges.py` |
| LCOV matching | `coverage.py` | `test_coverage.py`, `test_edges.py` |
| Coverage execution | `runners.py` | `test_runners.py` |
| Console and EDN output | `report.py`, `metrics.py` | `test_crap.py`, `test_cli.py` |

