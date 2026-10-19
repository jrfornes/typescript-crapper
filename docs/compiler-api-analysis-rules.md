# TypeScript Compiler API analysis rules

This is the implementation reference for the
`typescript-crapper-v1` source analyzer. Product decisions are defined in
`v1-decisions.md`.

## Parser construction

Create one `ts.SourceFile` per selected file:

```ts
const sourceFile = ts.createSourceFile(
  fileName,
  source,
  ts.ScriptTarget.Latest,
  true,
  scriptKindFor(fileName),
);
```

Script kinds:

| Extension | `ts.ScriptKind` |
| --- | --- |
| `.ts`, `.mts`, `.cts` | `TS` |
| `.tsx` | `TSX` |

Use `sourceFile.parseDiagnostics` for syntax diagnostics. Parsing must not
require module resolution, dependency installation, or a `tsconfig.json`.

## Traversal model

Perform two related traversals:

1. **Extraction traversal:** discover scored declarations and route callbacks
   in source order.
2. **Complexity traversal:** walk one scored declaration's subtree and apply
   decision and skip rules.

Record source positions before sorting report entries. Use
`node.getStart(sourceFile, false)` for a start that excludes leading trivia and
`node.getEnd()` for the exclusive end. Convert offsets to lines through
`sourceFile.getLineAndCharacterOfPosition`.

For an inclusive ending line:

```ts
const endProbe = Math.max(start, endExclusive - 1);
const endLine =
  sourceFile.getLineAndCharacterOfPosition(endProbe).line + 1;
```

This prevents a trailing newline from adding an extra line.

## Extraction matrix

| TypeScript AST shape | Entry | Scored node/range |
| --- | --- | --- |
| `FunctionDeclaration` with body and name | yes | declaration |
| Anonymous default-export `FunctionDeclaration` with body | yes, `default` | declaration |
| Generator/async generator function | yes | declaration |
| Function overload without body | no | — |
| `MethodDeclaration` with body | yes | declaration |
| `ConstructorDeclaration` with body | yes | declaration |
| `GetAccessorDeclaration` with body | yes, `get <name>` | declaration |
| `SetAccessorDeclaration` with body | yes, `set <name>` | declaration |
| Top-level variable initialized by arrow/function | yes | variable declaration range; initializer complexity |
| Class property initialized by arrow/function | yes | property declaration range; initializer complexity |
| Named object method under top-level object variable | yes | method declaration |
| Inline recognized route callback | yes | callback expression |
| Local function or ordinary callback | no separate entry | included in enclosing complexity |
| IIFE | no separate entry | included if nested in a scored entry |
| Dynamic computed declaration name | no; diagnostic | — |

### Top-level test

A variable/object declaration is top-level when its ancestor chain reaches the
source file through only:

- syntax-list/container nodes;
- export declarations/modifiers;
- `ModuleBlock`;
- `ModuleDeclaration`.

It is not top-level when any ancestor is function-like.

### Lexical namespace

Begin with the file module namespace from `v1-decisions.md`. During extraction,
append stable enclosing:

- `ModuleDeclaration` names, including dotted/nested modules;
- class names;
- object variable/property names for object methods.

Do not append function names to nested-function namespaces because nested
functions are not independent entries.

### Stable declaration names

Implement one helper:

```ts
function stableName(name: ts.PropertyName): string | undefined
```

Return:

- identifier/private identifier text;
- string/numeric literal text;
- literal expression inside `ComputedPropertyName`.

Return `undefined` for dynamic computed expressions and emit one diagnostic.

## Complexity mapping

Every scored unit starts at 1.

| Rule | Compiler API detection | Increment |
| --- | --- | --- |
| `if` | `ts.isIfStatement(node)` | 1 |
| `for` | `ts.isForStatement(node)` | 1 |
| `for...in` | `ts.isForInStatement(node)` | 1 |
| `for...of` | `ts.isForOfStatement(node)` | 1 |
| `while` | `ts.isWhileStatement(node)` | 1 |
| `do...while` | `ts.isDoStatement(node)` | 1 |
| `catch` | `ts.isCatchClause(node)` | 1 |
| ternary | `ts.isConditionalExpression(node)` | 1 |
| switch case | `ts.isCaseClause(node)` | 1 |
| switch default | `ts.isDefaultClause(node)` | 1 |
| logical/nullish binary | `BinaryExpression.operatorToken.kind` is `AmpersandAmpersandToken`, `BarBarToken`, or `QuestionQuestionToken` | 1 |
| logical/nullish assignment | operator is `AmpersandAmpersandEqualsToken`, `BarBarEqualsToken`, or `QuestionQuestionEqualsToken` | 1 |
| optional property access | `ts.isPropertyAccessChain(node)` and `node.questionDotToken` is present | 1 |
| optional element access | `ts.isElementAccessChain(node)` and `node.questionDotToken` is present | 1 |
| optional call | `ts.isCallChain(node)` and `node.questionDotToken` is present | 1 |

Use the public type guards available in the pinned TypeScript version. If a
chain guard changes, preserve the semantic condition—one increment per `?.`
segment—rather than depending on internal transform flags.

Examples:

| Expression | Decision increments |
| --- | --- |
| `a?.b` | 1 |
| `a?.b?.c` | 2 |
| `a?.()` | 1 |
| `a?.[0]` | 1 |
| `a ?? b?.c ?? c?.() ?? c?.[0]` | 6 |
| `a &&= b; c ||= d; e ??= f` | 3 |
| `ok && ready ? yes : no` | 2 |

The fifth example therefore has complexity 7 after its base path.

## Complexity boundaries

Start with the scored syntax node or its function initializer. Traverse its
descendants with these rules:

### Skip entire subtree

- class declarations/expressions nested below the scored root;
- interface, type alias, and type-literal declarations;
- a callback already extracted as a route entry.

Do not skip the root itself when the scored entry is a class property arrow or
route callback.

### Include subtree

- local named functions;
- ordinary arrow/function callbacks;
- nested blocks and expressions;
- JSX expressions;
- function parameter initializers and decorators that are inside the chosen
  declaration range, subject to type-only exclusions.

The compatibility behavior attributes local functions/callbacks to the parent.
Changing that boundary requires a new metric version.

### Traversal safety

Prefer an explicit node stack:

```ts
const stack: ts.Node[] = [root];
while (stack.length > 0) {
  const node = stack.pop()!;
  if (shouldSkip(node, root)) continue;
  if (isDecision(node)) complexity += 1;
  node.forEachChild((child) => stack.push(child));
}
```

Child push order does not affect counts. Extraction order does matter and must
be sorted by `startOffset`.

## Route extraction

Recognized method property text:

```text
get post put patch delete head options all use
```

For each `CallExpression`:

1. Check that its callee is a property access with a recognized method.
2. Find inline `ArrowFunction` and `FunctionExpression` arguments, unwrapping
   parenthesized expressions.
3. Find the first literal path argument:
   - string literal;
   - no-substitution template literal;
   - template expression, preserving source text between backticks.
4. If absent, walk the receiver chain for `.route(<literal>)`.
5. Create one route entry per inline callback.
6. Sort callbacks by source offset and disambiguate repeated labels with
   `#2`, `#3`, and so on.
7. Add each route callback's node identity to the parent-complexity skip set.

Do not resolve receiver symbols in v1. Consequently, `cache.get("/", () => {})`
is recognized syntactically. This is inherited behavior and must be documented
as such.

Identifier callbacks are not entries:

```ts
const handler = () => {};
app.get("/", handler); // handler is scored only by its supported declaration
```

## File/module namespace examples

Assume `--root /repo`:

| Path/source | Namespace |
| --- | --- |
| `/repo/src/demo/box.ts` | `demo.box` |
| `/repo/packages/web/src/app.ts` | `packages.web.src.app` |
| `namespace API { export function run() {} }` in `src/app.ts` | `app.API` |
| `namespace A.B { export function run() {} }` | `app.A.B` |
| `class Outer { class` is invalid | parse diagnostic |
| nested class `Inner` in a method | skipped as an entry and subtree |
| `class Outer { static Inner = class { run() {} } }` | not a v1 entry |

Only a leading project-relative `src/` is stripped. This intentionally avoids
the inherited behavior of stripping through any internal `/src/`.

## Object and class examples

```ts
export class Box {
  constructor() {}
  get value() { return this.ready ? 1 : 0; }
  set value(next) { if (next) this.current = next; }
  run = (ok: boolean) => ok ? 1 : 0;
  [dynamicName]() {}
}
```

Entries:

| Namespace | Name | CC |
| --- | --- | --- |
| `<module>.Box` | `constructor` | 1 |
| `<module>.Box` | `get value` | 2 |
| `<module>.Box` | `set value` | 2 |
| `<module>.Box` | `run` | 2 |

The dynamic method is skipped with a diagnostic.

```ts
const api = {
  run() { if (ready) return 1; return 0; },
  admin: {
    stop() { return 0; },
  },
};
```

Entries:

| Namespace | Name | CC |
| --- | --- | --- |
| `<module>.api` | `run` | 2 |
| `<module>.api.admin` | `stop` | 1 |

## Diagnostics

Each diagnostic has:

```ts
interface AnalysisDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  path: string;
  startLine?: number;
  startColumn?: number;
}
```

Minimum codes:

| Code | Meaning |
| --- | --- |
| `TS_PARSE_ERROR` | Compiler parser diagnostic |
| `DYNAMIC_MEMBER_NAME` | Entry skipped because its name is not stable |
| `DUPLICATE_COMPATIBILITY_KEY` | Same namespace/display name appears twice |
| `AMBIGUOUS_LCOV_PATH` | Coverage source path is not uniquely associated |
| `UNMATCHED_LCOV_PATH` | Report source has no selected source |
| `MISSING_FUNCTION_COVERAGE` | Selected function is absent from loaded LCOV |

Parser diagnostics are warnings by default and errors under `--strict`.
Coverage-generation failures are not analysis diagnostics; they use exit 3.

## Upgrade checks

When upgrading `typescript`:

1. run all explicit syntax fixtures;
2. inspect optional-chain counts;
3. inspect start/end lines and offsets;
4. run malformed-source diagnostics;
5. compare output against the previous metric version;
6. reject unexplained score changes.

