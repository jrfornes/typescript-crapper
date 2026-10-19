# typescript-crapper

TypeScript/Node CLI for CRAP metrics on TypeScript sources (`.ts`, `.tsx`, `.mts`, `.cts`).

Metric version: **typescript-crapper-v1**

## Requirements

- Node.js 20+ (tested on Node 22 LTS)
- npm 10+

No Python runtime is required.

## Install

```bash
npm install
npm run build
npm link
```

## Usage

```bash
typescript-crapper --root . --use-existing-coverage
typescript-crapper --root . --no-coverage
typescript-crapper --help
```

Writes `.metrics/crap.edn` for uml-viewer compatibility and prints a sorted report on stdout.

## Development

```bash
npm run typecheck
npm test
npm pack
npx typescript-crapper --help
```

Implementation follows `docs/v1-decisions.md` and Plan A in `docs/implementation-plans.md`.
