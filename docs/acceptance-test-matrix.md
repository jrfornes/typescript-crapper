# Version 1 acceptance test matrix

This document is the implementation checklist for automated tests. A coding
agent should convert each required row into an explicit test. “Inherited” means the expected behavior comes from the legacy Python crapper
baseline documented in `typescript-compatibility-spec.md`; “v1” means an
intentional TypeScript-native decision. Automated expectations live in `test/`.

## Test conventions

- Use temporary projects for filesystem and CLI tests.
- Keep parser tests pure: source string, path, root, expected entries.
- Assert fields explicitly; do not hide metric behavior in snapshots.
- Represent unavailable coverage as `null`, never `undefined`.
- Assert diagnostics by stable code rather than complete prose.
- Assert output status, stdout, stderr, and file content separately.
- Keep fixture source line numbers visible and stable.

## 1. Scoring

| ID | Input | Expected | Origin |
| --- | --- | --- | --- |
| SCORE-01 | CC 1, 100% | CRAP 1.0 | inherited |
| SCORE-02 | CC 2, 0% | CRAP 6.0 | inherited |
| SCORE-03 | CC 5, 0% | CRAP 30.0 | inherited |
| SCORE-04 | CC 5, 100% | CRAP 5.0 | inherited |
| SCORE-05 | CC 8, 45% | CRAP 18.648 | inherited |
| SCORE-06 | CC 3, coverage `null` | CRAP `null` | inherited |
| SCORE-07 | value beyond four decimals | stored value rounded to four decimals | inherited |
| SCORE-08 | threshold equals stored CRAP | pass | inherited |
| SCORE-09 | threshold below stored CRAP | exit 2 | inherited |

See `test/unit/scoring.test.ts` and `src/scoring.ts`.

## 2. File discovery

| ID | Case | Expected |
| --- | --- | --- |
| DISC-01 | `.ts`, `.tsx`, `.mts`, `.cts` | selected |
| DISC-02 | `.d.ts` | excluded |
| DISC-03 | `.js`, `.jsx`, `.mjs`, `.cjs` | excluded in v1 |
| DISC-04 | `*.test.*`, `*.spec.*` during walk | excluded |
| DISC-05 | source under `test`, `tests`, `spec`, `specs`, `__tests__` | excluded |
| DISC-06 | source under `node_modules`, `dist`, `build`, `coverage`, `.metrics`, `target` | excluded |
| DISC-07 | explicit test file | included |
| DISC-08 | explicit test directory | walked with test exclusions |
| DISC-09 | nonexistent positional value | case-sensitive path substring filter |
| DISC-10 | duplicate/resolved paths | one lexically sorted result |
| DISC-11 | `--changed` with modified and untracked TS | included |
| DISC-12 | `--changed` with deleted/test/JS file | excluded |
| DISC-13 | spaces and Unicode in file path | preserved |

See `test/unit/discover.test.ts`, `test/integration/cli.test.ts`, `src/discover.ts`.

## 3. Namespace derivation

Assume root `/repo`.

| ID | Input | Expected namespace |
| --- | --- | --- |
| NS-01 | `/repo/src/demo/box.ts` | `demo.box` |
| NS-02 | `/repo/demo/box.ts` | `demo.box` |
| NS-03 | `/repo/packages/web/src/app.ts` | `packages.web.src.app` |
| NS-04 | same file selected with `-s packages/web/src` | unchanged from root-based identity |
| NS-05 | `namespace API { function run() {} }` in `src/app.ts` | `app.API` |
| NS-06 | `namespace A.B { function run() {} }` | `app.A.B` |
| NS-07 | nested class `Outer.Inner` method | `module.Outer.Inner` |
| NS-08 | object `api.admin.run` | namespace `module.api.admin`, name `run` |

NS-03 through NS-08 are v1 decisions. See `test/unit/parser.test.ts`.

## 4. Function extraction

| ID | Construct | Expected entry |
| --- | --- | --- |
| FN-01 | named function with body | yes |
| FN-02 | anonymous default-export function | `default` |
| FN-03 | generator/async generator | yes |
| FN-04 | overload signature | no |
| FN-05 | overload implementation | yes, once |
| FN-06 | class method | yes |
| FN-07 | constructor | yes |
| FN-08 | getter/setter pair | `get x`, `set x` |
| FN-09 | top-level `const` arrow | yes |
| FN-10 | top-level `let` function expression | yes |
| FN-11 | top-level `var` arrow | yes |
| FN-12 | class-field arrow | yes |
| FN-13 | top-level object method | yes |
| FN-14 | nested object method | yes with object namespace |
| FN-15 | dynamic computed method | skipped + `DYNAMIC_MEMBER_NAME` |
| FN-16 | local named function | no separate entry |
| FN-17 | ordinary callback | no separate entry |
| FN-18 | top-level IIFE | no entry |
| FN-19 | declaration file | not selected |
| FN-20 | two equal compatibility keys | entries retained + duplicate diagnostic |

See `test/unit/parser.test.ts` and `docs/compiler-api-analysis-rules.md`.

## 5. Complexity

Use one function around each expression unless noted.

| ID | Body feature | Expected CC |
| --- | --- | --- |
| CC-01 | straight-line | 1 |
| CC-02 | one `if` | 2 |
| CC-03 | `for`, `for...in`, `for...of`, `while`, `do` | 6 |
| CC-04 | `try` + `catch` + `finally` | 2 |
| CC-05 | one ternary | 2 |
| CC-06 | switch with two cases and default | 4 |
| CC-07 | `a && b || c ?? d` | 4 |
| CC-08 | `a &&= b; c ||= d; e ??= f` | 4 |
| CC-09 | `a?.b` | 2 |
| CC-10 | `a?.b?.c` | 3 |
| CC-11 | `a?.()` | 2 |
| CC-12 | `a?.[0]` | 2 |
| CC-13 | `a ?? b?.c ?? c?.() ?? c?.[0]` | 7 |
| CC-14 | JSX `ok && ready ? <A/> : <B/>` | 3 |
| CC-15 | string `"a ?? b?.c"` | 1 |
| CC-16 | nested ordinary callback with ternary | parent CC 2 |
| CC-17 | nested class method with `if` | parent unchanged; nested local class not an entry |
| CC-18 | 1,200-term generated expression | completes without stack overflow |

See `test/unit/parser.test.ts` and `src/parser/complexity.ts`.

## 6. Source ranges and offsets

For each entry kind, assert:

- `startLine` is the line containing the first declaration token;
- `endLine` is the line containing the last declaration token;
- a trailing file newline does not increase `endLine`;
- `startOffset`/`endOffset` slice the intended declaration;
- Unicode before the entry does not corrupt line calculation;
- ID is normalized project-relative path plus `startOffset`.

Required cases:

| ID | Entry |
| --- | --- |
| RANGE-01 | multiline function declaration |
| RANGE-02 | decorated class method |
| RANGE-03 | variable arrow |
| RANGE-04 | class-field arrow |
| RANGE-05 | object method |
| RANGE-06 | parent function plus inline route callback |
| RANGE-07 | TSX function |
| RANGE-08 | source containing BMP and supplementary Unicode before function |

Add exact numeric expectations after fixtures are materialized; do not rely on
snapshots.

## 7. Route handlers

| ID | Source shape | Expected |
| --- | --- | --- |
| ROUTE-01 | `app.get("/users", () => {})` | `GET /users` |
| ROUTE-02 | function-expression callback | route entry |
| ROUTE-03 | `app.use(() => {})` | `USE` |
| ROUTE-04 | `.route("/items").get(() => {})` | `GET /items` |
| ROUTE-05 | two inline callbacks | `GET /x`, `GET /x#2` |
| ROUTE-06 | later same label | next numeric suffix |
| ROUTE-07 | template path with interpolation | source text retained |
| ROUTE-08 | dynamic path | method-only label |
| ROUTE-09 | identifier callback | no route entry |
| ROUTE-10 | non-Express receiver `.get` | recognized syntactically |
| ROUTE-11 | callback contains ternary | callback CC 2, parent does not include it |
| ROUTE-12 | ordinary `.map` callback | no entry; parent includes decisions |

See `test/unit/parser.test.ts`.

## 8. LCOV parsing and matching

| ID | Case | Expected |
| --- | --- | --- |
| LCOV-01 | positive/zero `DA` | covered/uncovered lines |
| LCOV-02 | positive/zero/`-` `BRDA` | covered/uncovered branches |
| LCOV-03 | no final `end_of_record` | final record retained |
| LCOV-04 | URL-encoded, `file:`, `./`, duplicate slash | normalized |
| LCOV-05 | exact source key and suffix candidate | exact wins |
| LCOV-06 | one unique longer report suffix | match |
| LCOV-07 | ambiguous repeated basename | no match + diagnostic |
| LCOV-08 | `b/main.ts` and `a/b/main.ts` | no cross-assignment |
| LCOV-09 | branch records inside function | branch percentage used |
| LCOV-10 | no branch records inside function | line percentage used |
| LCOV-11 | no records in matched range | 0% |
| LCOV-12 | selected function absent from LCOV | 0% + diagnostic |
| LCOV-13 | no coverage requested | `null`, not 0% |
| LCOV-14 | same line in two reports, one hit | merged covered |
| LCOV-15 | same branch identity in shards | counted once, hit if any |
| LCOV-16 | user report under `coverage/lcov.info` | loaded |
| LCOV-17 | generated report under `target/coverage/...` | loaded |

See `test/unit/lcov.test.ts` and `src/coverage/`.

## 9. Output and sorting

| ID | Case | Expected |
| --- | --- | --- |
| OUT-01 | scored entries | descending CRAP |
| OUT-02 | equal CRAP | namespace/name/path tie-breakers |
| OUT-03 | scored and unscored | scored first |
| OUT-04 | unscored entries | descending CC |
| OUT-05 | coverage/CRAP `null` | `nil` in EDN, `N/A` console |
| OUT-06 | integral metric | `.0` in EDN |
| OUT-07 | four-decimal metric | no excess/trailing zeros |
| OUT-08 | quotes/backslashes in identity | escaped EDN string |
| OUT-09 | empty entries | `{:entries []}` |
| OUT-10 | interrupted/temp write | no partial final file |

Parse generated EDN with an independent EDN reader in at least one integration
test.

## 10. CLI statuses and streams

| ID | Scenario | Status | Stream/file |
| --- | --- | --- | --- |
| CLI-01 | `--help` | 0 | help on stdout |
| CLI-02 | unknown/missing option | 1 | error/help on stderr |
| CLI-03 | no selected source | 0 | message on stdout; no metrics required |
| CLI-04 | successful complexity-only | 0 | report stdout, path stderr, EDN written |
| CLI-05 | successful existing coverage | 0 | scored report and EDN |
| CLI-06 | threshold equality | 0 | no threshold error |
| CLI-07 | threshold exceeded | 2 | message stderr; metrics retained |
| CLI-08 | coverage generation failure | 3 | diagnostic stderr; no new final EDN |
| CLI-09 | Git failure | nonzero | diagnostic stderr |
| CLI-10 | parse warning | 0 | warning stderr, recovered results |
| CLI-11 | parse issue with `--strict` | 1 | diagnostic stderr; no final EDN |

## 11. TypeScript end-to-end golden project

Materialize this project in a temporary directory:

```text
project/
  package.json
  src/
    choose.ts
    clean.ts
  coverage/
    lcov.info
```

`src/choose.ts`:

```ts
export function choose(ok: boolean): number {
  if (ok) return 1;
  return 0;
}
```

`src/clean.ts`:

```ts
export const clean = (): number => 1;
```

LCOV:

```text
TN:
SF:src/choose.ts
DA:1,1
DA:2,1
DA:3,1
BRDA:2,0,0,1
BRDA:2,0,1,0
end_of_record
SF:src/clean.ts
DA:1,1
end_of_record
```

Expected entries:

| Namespace | Name | CC | Coverage | CRAP |
| --- | --- | ---: | ---: | ---: |
| `choose` | `choose` | 2 | 50.0 | 2.5 |
| `clean` | `clean` | 1 | 100.0 | 1.0 |

Expected EDN:

```clojure
{:entries [
  {:name "choose", :namespace "choose", :complexity 2, :coverage 50.0, :crap 2.5}
  {:name "clean", :namespace "clean", :complexity 1, :coverage 100.0, :crap 1.0}
]}
```

Required runs:

1. `--root <project> --use-existing-coverage` → status 0 and exact entries.
2. Same plus `--threshold 2.5` → status 0.
3. Same plus `--threshold 2.49` → status 2.
4. `--no-coverage` → both coverage/CRAP values `nil`.
5. Explicit `src/choose.ts` → only `choose`.

## 12. Coverage runner

Mock process execution for unit tests and use tiny real projects only for
integration.

| ID | Scenario | Expected |
| --- | --- | --- |
| RUN-01 | `scripts.coverage` | package-manager coverage script |
| RUN-02 | Vitest with provider installed | native LCOV args and selected includes |
| RUN-03 | Vitest provider absent | exit 3 with install guidance; no install |
| RUN-04 | generic test script | c8 argument array |
| RUN-05 | no test script | exit 3 |
| RUN-06 | nested packages | isolated report paths |
| RUN-07 | path with shell metacharacters | remains one argument |
| RUN-08 | custom command | shell used only for this command |
| RUN-09 | failed command with stale report | stale report ignored |
| RUN-10 | cleanup target outside tool directory | refuse deletion |

See `src/coverage/run.ts` (runner tests deferred in v1).

## 13. Differential compatibility suite (optional, external)

The differential suite is **optional** and not part of the product or CI. The
legacy Python reference is no longer vendored in this repository. To compare
against it, check out that project separately at a pinned commit, run both CLIs
on the same fixture tree with `--use-existing-coverage`, parse both EDN
documents, and compare `(namespace, name)` fields.

Classify differences as `unexpected`, `typescript-crapper-v1 improvement`, or
`known namespace/range policy difference`. Document accepted deltas in a
reviewed data file. Expected v1 improvements include generators, class-field
arrows, object methods, logical assignments, lexical TS namespaces,
getters/setters, and root-stable namespace derivation.

## Definition of done

Version 1 is ready when:

- every required row above is automated or explicitly deferred with rationale;
- the end-to-end golden project passes from the packed npm artifact;
- no Python executable is used by the product;
- expected differential changes are reviewed;
- type-check, tests, package installation, and CLI smoke tests pass on all
  supported platforms.
