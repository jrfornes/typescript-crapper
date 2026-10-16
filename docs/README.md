# `typescript-crapper` discovery notes

This folder captures the behavior of `crapper-master` that matters when
building a TypeScript-only replacement. It separates observed behavior from
proposed design so the new implementation does not accidentally inherit
multi-language complexity or silently change established results.

## Documents

1. [Source architecture](crapper-master-architecture.md) explains the current
   pipeline, data model, CLI, coverage workflow, outputs, and failure behavior.
2. [TypeScript compatibility specification](typescript-compatibility-spec.md)
   is the testable contract for source discovery, function extraction,
   complexity, namespaces, LCOV, and Express route handlers.
3. [Implementation blueprint](typescript-crapper-blueprint.md) proposes a
   TypeScript-native package structure, delivery phases, and test strategy.
4. [Decisions and risks](decisions-and-risks.md) lists behavior that is
   ambiguous, surprising, incomplete, or intentionally pending a product
   decision.

## Scope

The source project lives in `crapper-master/`. It is a Python 3.11 tool that
uses tree-sitter for TypeScript parsing and emits a crap4clj-compatible EDN
snapshot. The target project should be implemented in TypeScript and require
no Python runtime.

The compatibility baseline includes TypeScript, TSX, and JavaScript because
`crapper-master` puts all of these extensions in its internal `"typescript"`
language bucket. Whether the replacement should truly accept only TypeScript
syntax and extensions is an explicit decision recorded in
[Decisions and risks](decisions-and-risks.md).

## Evidence hierarchy

When sources disagree, use this order:

1. Tests in `crapper-master/tests/`
2. Runtime code in `crapper-master/src/crapper/`
3. `crapper-master/README.md`
4. Generated UML and examples

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

