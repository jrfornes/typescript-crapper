# typescript-crapper

TypeScript/Node CLI for CRAP metrics on TypeScript sources (`.ts`, `.tsx`, `.mts`, `.cts`).

Metric version: **typescript-crapper-v1**

## Requirements

- Node.js 20+ (tested on Node 22 LTS)
- npm 10+

No Python runtime is required. Metric behavior is defined by `docs/v1-decisions.md`
and the `test/` suite (the legacy Python reference is not vendored in this repo).

## Install

From a clone (usable across many projects):

```bash
git clone <repo-url> ~/typescript-crapper
cd ~/typescript-crapper
npm install
npm run build
npm link
```

Ensure your global npm bin directory is on `PATH` (for example `export PATH="$(npm bin -g):$PATH"`). After `git pull`, run `npm run build` again.

Alternatively: `npm install -g .` from the repo root, or add `typescript-crapper` as a devDependency in each project.

## Usage

```bash
typescript-crapper --root . --use-existing-coverage
typescript-crapper --root . --no-coverage
typescript-crapper --help
```

Writes `.metrics/crap.edn` for uml-viewer compatibility and prints a sorted report on stdout.

Common options:

| Option | Purpose |
| --- | --- |
| `--root <path>` | Project root (default: current directory). Metrics are written here. |
| `-s`, `--source-root <path>` | Walk only this tree (repeatable). Namespaces stay root-based. |
| `--no-coverage` | Complexity only; coverage and CRAP are N/A. |
| `--use-existing-coverage` | Read LCOV already on disk under `coverage/` or `target/coverage/`. |
| `--coverage-command <cmd>` | Shell command to generate coverage before analysis. |
| `--threshold <n>` | Exit code 2 if worst CRAP exceeds `n`. |
| `[path-or-filter ...]` | Limit to files, directories, or path substrings. |

## Nx monorepos (`apps/`, `libs/`)

There is no Nx-specific integration in v1; the tool treats the repo as a normal TypeScript tree. These patterns work well with typical Nx layouts.

### Set `--root` to the workspace root

Always run from (or point `--root` at) the directory that contains `nx.json`:

```bash
cd ~/work/my-nx-monorepo
typescript-crapper --root . ...
```

Discovery includes sources under `apps/` and `libs/`, skips `node_modules/`, `dist/`, `build/`, and similar directories, and excludes common test patterns (`*.spec.ts`, `*.test.ts`, `__tests__/`, etc.) unless you name a test file explicitly.

### Prefer Nx for coverage, then analyze

Built-in coverage generation uses the **workspace** `package.json` and a single planned command from the first selected file. On Nx that is often not what you want. The reliable approach:

```bash
# Generate coverage the way your workspace already does, for example:
npx nx run-many -t test --coverage
# or one project:
npx nx run my-app:test --coverage

typescript-crapper --root . --use-existing-coverage
```

LCOV is loaded from:

- `<root>/coverage/**/lcov.info`
- `<root>/target/coverage/**/lcov.info`

If your pipeline writes reports elsewhere, copy or symlink them under `coverage/`, or use `--coverage-command` to run your Nx test command before analysis.

### Scope which code is scored

Namespaces are always derived from `--root`, not from `-s`. Scoping only changes **which files** are analyzed:

```bash
# One application
typescript-crapper --root . -s apps/my-app --use-existing-coverage

# One library
typescript-crapper --root . -s libs/shared --use-existing-coverage

# Path substring filter
typescript-crapper --root . --use-existing-coverage libs/accounting
```

Example namespace for `libs/shared/src/lib/util.ts`: `libs.shared.src.lib.util` (v1 strips only a **leading** `src/` at the project root, not `libs/foo/src/`).

### Complexity-only sweeps

```bash
typescript-crapper --root . --no-coverage
typescript-crapper --root . --no-coverage -s apps/my-app
```

### npm scripts and Nx targets

Root `package.json`:

```json
{
  "scripts": {
    "crap": "typescript-crapper --root . --use-existing-coverage",
    "crap:ci": "typescript-crapper --root . --use-existing-coverage --threshold 30"
  }
}
```

Example Nx target (adjust project and test target names):

```json
"crap": {
  "executor": "nx:run-commands",
  "options": {
    "commands": [
      "nx run my-app:test --coverage",
      "typescript-crapper --root . --use-existing-coverage -s apps/my-app"
    ],
    "parallel": false
  }
}
```

Full monorepo report after many projects test with coverage:

```bash
npx nx run-many -t test --coverage
typescript-crapper --root . --use-existing-coverage
```

One combined `.metrics/crap.edn` is written at the workspace root. Run separate commands with different `-s` values if you want to focus reports per app or lib (same root, narrower selection).

### Custom coverage via shell

When one command produces the LCOV files the loader expects:

```bash
typescript-crapper --root . --coverage-command "npx nx run-many -t test --coverage"
```

Only `--coverage-command` is executed via a shell; all other subprocesses use argument arrays.

### Nx caveats (v1)

- No `project.json` / project-graph awareness—only filesystem walk and filters.
- LCOV paths must be matchable to selected source paths; otherwise functions may show **0%** with `MISSING_FUNCTION_COVERAGE` diagnostics.
- Untested libs with coverage enabled still score 0% when absent from LCOV (expected).

## Development

```bash
npm run typecheck
npm test
npm pack
npx typescript-crapper --help
```

Implementation follows `docs/v1-decisions.md` and Plan A in `docs/implementation-plans.md`.
