# Legacy Python crapper architecture

> **Historical note:** This document describes the former multi-language Python
> reference tool (tree-sitter, six language families). That source tree is **not
> vendored** in this repository. Current behavior is defined by
> `v1-decisions.md`, `compiler-api-analysis-rules.md`, and `test/`.

## Purpose

The legacy Python crapper measured each discovered function's cyclomatic complexity,
combines it with test coverage, prints a report, and writes a snapshot consumed
by uml-viewer. It supports six language families, but the target project only
needs the TypeScript path.

The runtime dependencies are Python 3.11, `tree-sitter`, and
`tree-sitter-language-pack`. The implementation is a synchronous batch CLI.

## End-to-end flow

```text
parse CLI
  → select source files
  → optionally generate coverage
  → load coverage reports
  → parse each source file
  → extract scored functions
  → associate coverage by file and line range
  → calculate and sort CRAP entries
  → write .metrics/crap.edn
  → print the console report
  → enforce the optional threshold
```

The orchestration lives in `src/crapper/cli.py:run`; analysis is in
`src/crapper/analyze.py:analyze_files`.

## Module responsibilities

| Module | Responsibility | Needed in TypeScript-only port |
| --- | --- | --- |
| `cli.py` | Parse flags, select files, orchestrate, exit statuses | Yes |
| `discover.py` | Extension mapping, test detection, tree walking | Yes, reduced extensions |
| `analyze.py` | Join source functions to coverage and score entries | Yes |
| `model.py` | Immutable `Function` and `Entry` records | Yes |
| `crap.py` | Formula, rounding, sort order | Yes |
| `coverage.py` | LCOV plus Go, JaCoCo, and Cloverage readers | LCOV only |
| `runners.py` | Generate reports for all language ecosystems | TypeScript section only |
| `languages/treesitter.py` | Parser and iterative AST helpers | Yes or equivalent |
| `languages/typescript.py` | TS/TSX/JS extraction and complexity | Yes |
| `metrics.py` | crap4clj-compatible EDN | Yes for compatibility |
| `report.py` | Human-readable table | Yes |
| Other `languages/*` | Clojure, Go, Java, Python, Rust | No |

## Data model

### Parsed function

`model.Function` represents a unit before coverage is attached:

| Field | Meaning |
| --- | --- |
| `name` | Function, method, variable, or synthesized route label |
| `namespace` | File-derived module or module plus enclosing classes |
| `complexity` | Integer cyclomatic complexity |
| `start_line`, `end_line` | 1-based inclusive LCOV matching range |
| `path` | Project-relative path, or absolute path outside the root |
| `language` | Always `"typescript"` on the TypeScript code path |
| `start_byte`, `end_byte` | UTF-8 AST span; currently not consumed here |
| `jacoco_class` | Java-only and removable |

`model.Entry` adds `coverage` and `crap` and omits AST spans. Its `path` and
`language` support reporting and sorting but are not emitted in EDN.

### Score

`crap.py:crap_score` uses:

```text
CRAP = CC² × (1 − coverage / 100)³ + CC
```

Coverage is represented internally as a percentage from 0 through 100.
Coverage and CRAP are rounded to four decimal places when the entry is made.

Scored entries sort before unscored entries. Scored entries use descending
CRAP, then namespace, name, and path. Unscored entries use descending
complexity, then the same identity fields.

## CLI contract

```text
crapper [options] [path-or-filter ...]
```

| Option | Behavior |
| --- | --- |
| `-h`, `--help` | Print help and exit 0 |
| `--root <path>` | Project root; default `.` |
| `-s`, `--source-root <path>` | Repeatable source trees |
| `--changed` | Analyze modified and untracked source files from Git |
| `--no-coverage` | Complexity only; coverage and CRAP are unavailable |
| `--use-existing-coverage` | Read reports without running tests |
| `--coverage-command <cmd>` | Run one user shell command instead of defaults |
| `--threshold <number>` | Exit 2 when maximum CRAP is strictly greater |

File selection precedence is:

1. `--changed`
2. one or more `--source-root`
3. existing positional files/directories
4. the full project root

Nonexistent positional values become case-sensitive path substring filters.
Filters apply after the primary selection mode. Results are resolved,
deduplicated, and lexically sorted.

`--changed` uses `git status --porcelain -z --no-renames
--untracked-files=all`. It includes modified and untracked files, excludes
deleted files and tests, and limits results to `--root`.

### Exit behavior

| Status | Meaning |
| --- | --- |
| 0 | Success, no files, or no threshold violation |
| 1 | CLI validation error |
| 2 | Threshold exceeded |
| Git status | Git failure in `--changed` mode |

A failed built-in coverage command does not fail analysis. A failed custom
coverage command also leaves the CLI at status 0, but stale reports are not
loaded. Both cases result in 0% for uncovered functions. This is compatibility
behavior, not necessarily the best future policy.

## Discovery

The source implementation recognizes `.ts`, `.tsx`, `.mts`, `.cts`, `.js`,
`.jsx`, `.mjs`, and `.cjs` as `"typescript"` and excludes `.d.ts`.

Default walking excludes:

```text
.git .hg .svn .idea .venv venv node_modules vendor target dist build out
coverage .metrics testdata __pycache__ .clj-kondo
test tests spec specs __tests__
```

TypeScript/JavaScript test suffixes are `.test.*` and `.spec.*` for every
recognized script extension. Walking excludes these files. A test file passed
as an explicit file is included; a directory passed explicitly is still
walked with normal exclusions.

## Coverage lifecycle

### Package discovery

For each selected script source, `runners.py:typescript_packages` walks upward
to the nearest `package.json`, stopping at the project root. Coverage runs once
per unique package. Nested package output is placed under a slugged directory.

### Command selection

For each package:

1. A `scripts.coverage` entry wins and runs unchanged as
   `npm run coverage`.
2. A Vitest test script or Vitest config uses Vitest's own V8 provider.
3. Any other test script is wrapped with `npx --yes c8`.
4. A package with no usable test script is skipped.

Vitest gets an LCOV reporter, an explicit reports directory, and one
`--coverage.include` per selected non-test source in that package. If
`@vitest/coverage-v8` is missing, the runner installs a version matching the
installed Vitest when possible. It snapshots and restores `package.json`,
`package-lock.json`, and `npm-shrinkwrap.json`, though it intentionally leaves
the package in `node_modules`.

The generated report directory is removed before a built-in run. A custom
`scripts.coverage` command is not forced to use the expected path, so it must
write somewhere the loader scans.

### Report loading

The loader merges:

```text
target/coverage/**/lcov.info
coverage/**/lcov.info
```

When duplicate LCOV source keys are present, later merged files overwrite
earlier records rather than combining their counts.

LCOV source paths are normalized by URL-decoding, replacing backslashes,
removing a `file:` prefix and leading `./`, and collapsing duplicate slashes.
Matching prefers:

1. exact normalized paths;
2. a unique report key ending with the source path;
3. a unique source path ending with the report key.

All selected source paths are bound before matching to prevent `b/main.ts`
from accidentally taking coverage for `a/b/main.ts`. Ambiguity means no match.

For a matched function range:

- if at least one `BRDA` branch exists, coverage is covered branches divided
  by total branches;
- otherwise coverage is hit `DA` lines divided by recorded `DA` lines;
- lines absent from LCOV are not part of the denominator;
- a matched file with no records in the range yields 0%;
- an unmatched file also becomes 0% during analysis;
- only `--no-coverage` produces unavailable coverage.

## Outputs

### Console

The table contains function, namespace, CC, coverage percentage, and CRAP.
Columns have bounded dynamic widths. Coverage and CRAP display as `N/A` in a
complexity-only run. Results are already sorted before formatting.

### EDN

Each successful analysis replaces `<root>/.metrics/crap.edn`:

```clojure
{:entries [
  {:name "open", :namespace "demo.box.Box", :complexity 2,
   :coverage 75.0, :crap 2.1}
]}
```

Only `name`, `namespace`, `complexity`, `coverage`, and `crap` are emitted.
Unavailable values are `nil`; numbers retain at most four decimals and always
include a decimal point when integral. uml-viewer joins operations using
`namespace` and `name`. Renames and moves have no cross-run identity.

## Error and mutation behavior

- Source reads use UTF-8 with replacement for invalid bytes.
- Tree-sitter parse errors are not surfaced; recovery may produce partial or
  empty results.
- Invalid `package.json` is reported and that package is skipped.
- A missing process returns synthetic status 127.
- Built-in command failures warn on stderr and analysis continues.
- User-provided command strings run through a shell; internally constructed
  commands are argument arrays and do not.
- Coverage generation removes stale report directories before running.
- The metrics file is written directly, not atomically, despite its role as a
  replace-on-success snapshot.

## What can be deleted in the new project

The language dispatch map, every non-TypeScript parser, Go profiles, JaCoCo,
Cloverage HTML, Maven/Cargo/Python/Clojure runners, and Java-specific model
fields are not part of the target. Retaining the thin pipeline boundaries is
still useful because parsing, coverage generation, LCOV ingestion, scoring,
and output are independently testable.

