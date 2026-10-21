# TypeScript compatibility specification

This document describes observable behavior inherited from the legacy Python
multi-language crapper (historical baseline). Each rule can
become a fixture or unit test in `typescript-crapper`. Items marked as gaps are
not recommendations; they describe current behavior that needs an explicit
compatibility decision.

## Supported files and grammar selection

| Extension | Parser grammar | Internal language |
| --- | --- | --- |
| `.ts`, `.mts`, `.cts` | TypeScript | `typescript` |
| `.tsx` | TSX | `typescript` |
| `.js`, `.jsx`, `.mjs`, `.cjs` | JavaScript | `typescript` |
| `.d.ts` | excluded | none |

The existing tool therefore means “TypeScript-family tooling,” not strictly
TypeScript-only input.

## Extracted entries

Entries are returned in source-byte order.

### Included

- Top-level named `function_declaration` nodes with a statement body.
- Class `method_definition` nodes with a statement body and a simple
  identifier/property name.
- Top-level lexical declarations whose declarator value is an arrow function
  or function expression, for example `const run = () => 1`.
- Inline arrow/function callbacks passed to recognized Express-style route
  calls.
- Constructors, getters, and setters when tree-sitter represents them as a
  supported method definition.
- Methods of nested classes, with every enclosing class name appended to the
  namespace.

“Top-level” means not nested inside any function declaration, method, arrow,
or function expression. It does not require the node to be a direct program
child, so declarations inside a TypeScript `namespace` can be found.

### Excluded or collapsed

- Function overload signatures and abstract/interface methods without bodies.
- Nested named functions as separate entries; their decisions remain in the
  enclosing function.
- Nested non-route callbacks as separate entries; their decisions remain in
  the enclosing function.
- Generator declarations (`function*` and `async function*`).
- Object literal methods.
- Computed class methods such as `[name]() {}`.
- Class field arrows such as `run = () => {}`.
- IIFEs and anonymous functions not assigned by a supported top-level lexical
  declaration.
- Route callbacks referenced by identifier rather than written inline.

These exclusions are implementation gaps, not documented product intent.

## Namespace and naming

### Module namespace

The path is normalized with `/`, then transformed:

1. remove the configured source-root prefix when it is a literal prefix;
2. remove leading `./`;
3. strip a leading `src/`, or everything through the first `/src/`;
4. remove the recognized script extension;
5. replace `/` with `.`.

Examples:

| Input path | Namespace |
| --- | --- |
| `src/demo/box.ts` | `demo.box` |
| `/app/src/demo/box.ts`, root `/app` | `demo.box` |
| `/app/pkg/src/demo/box.mts` | `demo.box` |
| `src/ui/view.tsx` | `ui.view` |

This does not read `tsconfig.json`, package exports, workspace names, or
TypeScript `namespace` declarations.

### Entry namespace and name

| Entry | Namespace | Name |
| --- | --- | --- |
| Function | module | declared identifier |
| Arrow/function variable | module | variable identifier |
| Class method | `module.Class[.NestedClass]` | method identifier |
| Route callback | module | synthesized method/path label |

Getter and setter pairs can produce duplicate `(namespace, name)` identities.
uml-viewer joins on those two fields, so this is potentially ambiguous.

## Cyclomatic complexity

Every entry starts at 1. The AST subtree adds one for each:

- `if`;
- `for`, `for…in`/`for…of`, `while`, and `do…while`;
- `catch`;
- ternary conditional;
- every `case` and `default` label;
- every `&&` and `||` binary expression;
- every `??` binary expression;
- every optional-chain wrapper, or bare `?.` token not already represented by
  a wrapper.

The implementation walks iteratively rather than recursively, allowing deeply
nested/generated expressions.

### Subtree accounting

While scoring an entry:

- nested class, abstract class, and interface subtrees are skipped;
- recognized inline route callbacks are skipped in their enclosing function;
- other nested callbacks and functions are included;
- strings and comments do not contribute because decisions are AST nodes.

For example:

```ts
function outer() {
  [1].map((n) => (n ? 1 : 0)); // ternary belongs to outer
  app.get("/", () => (ok ? 1 : 0)); // ternary belongs to route only
}
```

Expected complexity is 2 for `outer` and 2 for `GET /`.

### Not counted

Current behavior does not count logical/nullish assignments (`&&=`, `||=`,
`??=`), `try` or `finally` themselves, `await`, `yield`, or the `switch`
wrapper. Whether these should count is a compatibility decision.

### Golden examples

| Source shape | Expected CC |
| --- | --- |
| Empty/straight-line function | 1 |
| One ternary | 2 |
| JSX `ok && ready ? a : b` | 3 |
| `a ?? b?.c ?? c?.() ?? c?.[0]` | 7 |
| `if` + `&&` + loop + nested `if` + `catch` + ternary | 7 |

The final example is 1 base plus six decisions.

## Source ranges

- Lines are 1-based and inclusive.
- A node ending at column 0 on a new line ends on the previous source line.
- Declared functions and methods use the whole AST node.
- Variable-held arrows/functions use the whole variable declarator for the
  range, but only the function value for complexity.
- Route entries use the callback node.
- UTF-8 byte offsets are recorded for all TypeScript entries.

These ranges directly affect LCOV association. Changing from declaration span
to body span can change scores even when complexity is identical.

## Express-style route handlers

Recognized property names are:

```text
get post put patch delete head options all use
```

Any member call with one of these property names qualifies; the receiver is
not verified to be Express. Supported forms include:

```ts
app.get("/users", (req, res) => {});
router.use((req, res, next) => next());
app.route("/items").get((req, res) => {});
```

Only inline arrow functions and function expressions in the argument list
become entries. Multiple inline callbacks become separate entries.

### Labels

- Method names are uppercased.
- The first string or template-string argument is used as the path.
- Chained `.route(path)` supplies the path when the verb call does not.
- A dynamic/nonliteral path yields only the method, for example `GET`.
- Template-string interpolation is retained textually.
- Duplicate labels in one file get `#2`, `#3`, and so on in source order.

Examples: `GET /users`, `USE`, `DELETE /users/${id}`,
`GET /users#2`.

Route recognition is deliberately or accidentally broader than Express
because it only checks the property name. Conversely, common Fastify/Hono/Koa
forms that do not fit this syntax may be missed.

## LCOV contract

### Parsing

- `SF` begins a source record.
- `DA:<line>,<hits>` contributes one line; positive hits mean covered.
- `BRDA:<line>,...,<taken>` contributes one branch; positive `taken` means
  covered, while `-` and zero mean uncovered.
- A final record is stored even if `end_of_record` is absent.

### Function percentage

For the inclusive function line range:

1. If one or more branch records exist, use branch coverage only.
2. Otherwise use line coverage from recorded `DA` lines.
3. Do not count source lines absent from LCOV.
4. Return 0% when the matched report has no countable lines in the range.
5. Treat no unambiguous report match as 0% when coverage mode is active.
6. Preserve unavailable coverage only in explicit complexity-only mode.

This branch-over-line rule can make two functions with identical executed lines
score differently if one has emitted branch metadata.

## Coverage execution contract

### Existing script

If `package.json` has `scripts.coverage`, run:

```text
npm run coverage
```

No reporter or output path is injected.

### Vitest

Vitest is selected when the test script contains `vitest` or a
`vitest.config.{ts,mts,cts,js,mjs,cjs}` file exists. The effective command is:

```text
vitest run --coverage
  --coverage.reporter=lcov
  --coverage.reportsDirectory=<target>
  --coverage.reportOnFailure=true
  --coverage.include=<selected source> ...
```

The local binary is preferred; otherwise `npx vitest` is used. Test files and
files outside the package are not passed as includes.

### Other test runners

Any other `scripts.test` is wrapped:

```text
npx --yes c8 --reporter=lcov --reports-dir <target> npm test
```

This assumes c8 can observe the test runner's processes.

## Output contract

Each entry carries path/language internally, but compatible EDN contains:

```clojure
{:name "choose"
 :namespace "demo.box"
 :complexity 7
 :coverage 50.0
 :crap 17.7}
```

Metrics use four-decimal precision; the console uses one decimal. The EDN
entry order is report order, worst CRAP first.

## Required compatibility fixtures

A port should preserve fixtures for:

1. TS, TSX, MTS, CTS and any intentionally supported JS extensions.
2. Declarations, methods, arrows, overloads, nested functions and nested
   classes.
3. Every decision node, including optional chains in TS and JS grammars.
4. JSX logical and ternary expressions.
5. Express direct, chained, duplicated, pathless, and multi-callback routes.
6. UTF-8 identifiers and byte/line range behavior.
7. LCOV line fallback, branch precedence, missing records, URL/Windows paths,
   suffix ambiguity, and overlapping source suffixes.
8. Vitest, custom coverage script, generic test script, malformed
   `package.json`, nested package, and absent test script.
9. Complexity-only, missing coverage, threshold equality, and threshold
   violation outputs.

