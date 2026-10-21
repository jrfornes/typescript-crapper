# Version 1 implementation decisions

Status: **authoritative for implementation**

This document resolves the alternatives described elsewhere in `docs/`.
Unless the project owner changes a decision, coding agents should implement
this document rather than reopening the design.

## Authority order

When documents disagree, use this order:

1. `docs/v1-decisions.md`
2. `docs/compiler-api-analysis-rules.md`
3. `docs/acceptance-test-matrix.md`
4. `docs/implementation-plans.md`, Plan A
5. `docs/typescript-compatibility-spec.md`
6. `docs/crapper-master-architecture.md`

The compatibility and architecture documents describe the legacy Python tool;
they are evidence, not requirements where this file intentionally differs.

## ADR-001: parser

Use the **TypeScript Compiler API** from the `typescript` package.

Rationale:

- the goal is the best TypeScript analysis, not byte-for-byte replication of
  the Python implementation;
- it supports current TypeScript syntax without a separate grammar package;
- it has simpler Node/npm distribution than native or WASM tree-sitter;
- it allows optional symbol-aware improvements later.

Use standalone `ts.createSourceFile` parsing in v1. Do not create a full
`Program` or require a valid `tsconfig.json` for basic analysis. Keep parsing
behind the `SourceAnalyzer` interface described in `implementation-plans.md`.

## ADR-002: supported source files

Version 1 analyzes:

```text
.ts .tsx .mts .cts
```

Version 1 excludes:

```text
.d.ts .js .jsx .mjs .cjs
```

JavaScript support may be added later as an explicit feature. The internal
model should not call all entries `"typescript"` because the tool has no
multi-language dispatch requirement.

Tests are excluded during normal walking and included when the user names an
individual test file explicitly.

## ADR-003: metric version

The initial metric version is `typescript-crapper-v1`.

The metric version covers:

- which declarations become entries;
- decision-node counting;
- nested-function attribution;
- namespace and display-name rules;
- source-range rules;
- LCOV branch/line selection.

Expose it through `--version` or `--metric-version` diagnostics. Do not add it
to each legacy EDN entry because uml-viewer expects the crap4clj entry shape.
A future additional output format may carry it as structured metadata.

Any change capable of changing a function's identity, complexity, coverage, or
CRAP score requires:

1. a fixture showing the old and new behavior;
2. a changelog entry;
3. either a new metric version or an explicit backwards-compatible ruling.

## ADR-004: scored entries

### Included

| Construct | Namespace | Display name |
| --- | --- | --- |
| Named function declaration | lexical module/class namespace | identifier |
| Anonymous default-exported function | lexical module namespace | `default` |
| Generator/async generator declaration | lexical module namespace | identifier |
| Class method | module plus class nesting | method name |
| Constructor | module plus class nesting | `constructor` |
| Getter | module plus class nesting | `get <name>` |
| Setter | module plus class nesting | `set <name>` |
| Top-level `const`/`let`/`var` initialized with arrow/function | lexical module namespace | variable name |
| Class property initialized with arrow/function | module plus class nesting | property name |
| Top-level named object method | module plus object path | method name |
| Inline recognized route callback | lexical module namespace | route label |

“Top-level” permits nesting inside TypeScript `namespace`/`module` blocks but
not inside a function body.

For object methods, only objects rooted in a top-level named variable are
entries. A nested object extends the namespace, for example
`const api = { admin: { run() {} } }` becomes namespace
`module.api.admin`, name `run`.

### Name rules

- Identifier, private identifier, numeric literal, and string-literal property
  names are stable names.
- A computed property with a string or numeric literal is a stable name.
- A dynamic computed property is skipped with a diagnostic.
- Overload signatures and declarations without bodies are skipped; only the
  implementation is scored.
- Duplicate `(namespace, display name)` keys produce a diagnostic.

### Excluded as independent entries

- local named functions;
- callbacks other than recognized inline route handlers;
- IIFEs;
- anonymous functions not assigned to a supported declaration;
- dynamically computed methods/properties;
- declaration-file content.

Excluded nested functions and callbacks still contribute decisions to the
nearest enclosing scored function. An excluded top-level IIFE has no entry.

## ADR-005: complexity rules

Complexity starts at 1. Add one for:

- `if`;
- `for`, `for...in`, `for...of`, `while`, and `do...while`;
- `catch`;
- conditional expressions;
- each `case` and `default`;
- `&&`, `||`, and `??`;
- `&&=`, `||=`, and `??=`;
- each optional property access, element access, or call segment.

Do not count:

- `switch` in addition to its clauses;
- `try` or `finally`;
- `await` or `yield`;
- type-only syntax;
- strings or comments.

When scoring an entry:

- skip nested class/interface/type declaration bodies;
- skip independently scored route callbacks;
- include other nested functions and callbacks;
- use an iterative traversal or another implementation proven safe for deeply
  generated expressions.

These rules intentionally improve on the inherited Python baseline by counting logical
assignments and by recognizing additional function forms.

## ADR-006: namespaces

File module identity is always derived relative to `--root`, not
`--source-root`. `--source-root` controls selection only. This keeps identities
stable when users analyze the same file through different selection options.

Derivation:

1. convert separators to `/`;
2. make the path relative to project root;
3. strip a leading `src/` only;
4. remove the supported extension;
5. replace `/` with `.`.

Do not strip arbitrary content through an internal `/src/`; the project root
already provides the boundary.

Append lexical containers:

- TypeScript namespaces/modules append their declared segments;
- nested classes append each class name;
- object paths append each stable object property.

Do not use `tsconfig` path aliases or package exports in v1.

## ADR-007: source ranges and offsets

- LCOV ranges are 1-based inclusive lines.
- A trailing newline is not an extra source line.
- Functions and methods use the full implementation declaration.
- Variable and property functions use the full variable/property declaration.
- Route handlers use only the callback expression.
- Object methods use the method declaration.

The compiler exposes UTF-16 offsets. Store these as `startOffset` and
`endOffset`; do not call them byte offsets. Stable internal identity is
`<normalized project-relative path>:<startOffset>`.

Coverage association uses lines, not offsets. UTF-8 byte compatibility with
the legacy Python tool is not required.

## ADR-008: route handlers

Retain the inherited Express-style route feature for:

```text
get post put patch delete head options all use
```

Recognize inline arrow/function arguments on member calls, including
`.route(path).get(...)`. Do not require the receiver to resolve to Express in
v1; syntax compatibility is intentional.

Naming remains:

- uppercase method;
- first literal string/template path when available;
- inherited path from `.route(path)`;
- no path for dynamic expressions;
- `#2`, `#3`, and so forth for duplicate labels in source order.

An identifier callback is not an independent route entry. A route entry's
decisions are excluded from its enclosing scored function.

## ADR-009: coverage input and merging

LCOV is the sole coverage input format.

Search:

```text
target/coverage/**/lcov.info
coverage/**/lcov.info
```

Match exact normalized source paths first, then unambiguous suffixes while
considering the complete selected source set.

When multiple reports contain the same source:

- merge line hits by considering a line covered if any report has positive
  hits;
- merge branches by stable LCOV branch identity `(line, block, branch)`,
  considering a branch covered if any report reports positive `taken`;
- do not double-count the same branch identity.

For a function:

- use branch coverage when at least one branch record falls in its range;
- otherwise use recorded line coverage;
- ignore lines with no LCOV record;
- return 0% for a selected function with no unambiguous coverage match;
- return `null` only in explicit complexity-only mode.

Emit diagnostics for ambiguous paths and LCOV source records that match no
selected source.

## ADR-010: CLI coverage modes

Final v1 supports:

```text
--no-coverage
--use-existing-coverage
--coverage-command <command>
```

Default behavior attempts built-in coverage generation, matching the familiar
the familiar legacy crapper workflow. Implementation may ship read-only milestones first,
but the final v1 default is not complexity-only.

Built-in generation order per package:

1. an existing `coverage` script;
2. Vitest native LCOV coverage;
3. a documented generic c8 fallback around the test script.

Detect and use the project's package manager when supported. Version 1 must
support npm; other package managers must not be claimed until integration
tested. Never install a coverage provider or mutate manifests automatically.
If a required provider is absent, report how the user can install it.

Internally generated commands use argument arrays. Only
`--coverage-command`, which is explicitly user-authored, uses a shell.

## ADR-011: failures and exit statuses

| Status | Meaning |
| --- | --- |
| 0 | Successful analysis and threshold not exceeded |
| 1 | Invalid CLI input or analysis/configuration failure |
| 2 | CRAP threshold exceeded |
| 3 | Coverage generation failed or required coverage is unavailable |
| Git status, normalized to 1 if invalid | `--changed` could not inspect Git |

Coverage failure must not be converted into 0% results because that confuses
tool failure with untested code. Existing LCOV that genuinely omits a selected
function still produces 0%.

Write final metrics only after all fatal validation and coverage steps succeed.
Parse diagnostics are warnings by default; provide `--strict` to make them an
analysis failure.

## ADR-012: output

Required outputs:

- console table on stdout;
- diagnostics and output path on stderr;
- atomic `<root>/.metrics/crap.edn`.

Legacy EDN remains:

```clojure
{:entries [{:name "choose"
            :namespace "demo.core"
            :complexity 2
            :coverage 50.0
            :crap 2.5}]}
```

Keep path, stable ID, ranges, and metric version in memory and debug output,
but do not add them to compatibility EDN v1.

Sorting uses:

1. scored entries before unscored entries;
2. descending CRAP for scored entries;
3. descending complexity for unscored entries;
4. namespace, display name, and path as deterministic tie-breakers.

Threshold comparison uses the stored four-decimal CRAP value and is strictly
greater-than; equality passes.
