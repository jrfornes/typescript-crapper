# Decisions and risks

The legacy Python crapper provides a useful baseline, but not every inherited behavior
should become permanent. Resolve the blocking decisions before implementation;
record later choices as architecture decisions and fixtures.

## Blocking product decisions

### 1. What does “TypeScript-only” mean?

Current behavior accepts TS, TSX, MTS, CTS, JS, JSX, MJS, and CJS under one
language label. Plausible target scopes are:

- only `.ts`, `.tsx`, `.mts`, and `.cts`;
- TypeScript plus JavaScript, matching the source;
- TypeScript by default with an opt-in JavaScript flag.

Recommendation: name the tool after its analysis ecosystem but state supported
extensions explicitly. If “TypeScript-only” is literal, reject JS extensions
and remove JavaScript grammar/runtime code.

### 2. Is exact score parity required?

Parser choice and function-form improvements can change scores. Choose between:

- **compatibility first**: reproduce source results, then version changes;
- **idiomatic TypeScript first**: score modern constructs and publish a
  documented break from the inherited baseline.

Recommendation: preserve parity for existing constructs and add omitted
constructs behind explicit fixtures. Treat score changes as user-visible API
changes because CI thresholds depend on them.

### 3. Which function forms are units?

The source omits generators, object methods, class-field arrows, computed
methods, and IIFEs. These are common enough to affect trust in the tool.

Recommendation for the native tool:

- include generator declarations;
- include class-field arrows with stable property names;
- include object methods only if a stable namespace scheme is defined;
- skip computed names unless they are static string literals;
- keep IIFEs folded into the enclosing entry.

Do not add these silently if parity is promised.

### 4. Should the tool run tests automatically?

Automatic coverage is convenient but can be slow, mutate `node_modules`, run
arbitrary project scripts, and behave differently across package managers.

Recommendation: make existing LCOV a first-class path and keep automatic
execution explicit in help. Never auto-install a provider without an opt-in.

### 5. What should coverage failures do?

The source warns, assigns 0%, writes results, and usually exits 0. This can make
infrastructure failure look like a catastrophic code-quality regression.

Options:

- compatibility: warn and score 0%;
- strict: return a distinct nonzero status;
- configurable: `--coverage-failure=zero|error|unavailable`.

Recommendation: expose a policy, with `error` for CI and `zero` only when
compatibility is desired.

## Metric decisions

### Logical assignments

`&&`, `||`, and `??` count; `&&=`, `||=`, and `??=` do not. Decide whether
assignment forms represent equivalent control flow. Changing this alters CC.

### `switch default`

Every `case` and `default` counts. Some cyclomatic definitions do not count
`default`. Keep it for parity unless publishing a metric version.

### Optional chaining

Every optional chain component can count. For
`a?.b?.c`, parser node shape determines whether this is one or multiple
decisions. Pin parser versions and fixture chained property, element, and call
forms.

### Nested callbacks

Non-route callbacks contribute to the parent rather than becoming entries.
This works for local implementation details but can inflate a coordinator
function containing substantial callbacks. A generalized callback policy
would be more coherent than the current Express exception.

### Branch versus line coverage

Any branch record in a range causes line data to be ignored. This follows the
source but does not combine statement and branch coverage. Preserve for parity
or version a new formula; do not blend metrics without defining the resulting
meaning.

## Identity decisions

### Module namespaces

Path-derived dotted names ignore `tsconfig` roots, path aliases, package names,
and workspaces. Stripping through the first `/src/` can also collapse distinct
packages.

Recommendation: retain path identity for compatibility output, but define a
canonical project-relative `id` internally. A later output schema can include
package and path without breaking uml-viewer keys.

### Duplicate names

Overloads without bodies are skipped, but getters/setters and route labels can
collide. Route labels are disambiguated only within a file. EDN omits paths,
and uml-viewer joins by namespace/name.

Recommendation: detect duplicate compatibility keys and warn. Keep an internal
stable ID such as normalized path plus byte start.

### Renames and moves

There is no cross-run identity. This is acceptable for snapshots but prevents
history without external matching. Do not imply trend continuity unless a
separate identity strategy is built.

## Coverage risks

### LCOV path ambiguity

Suffix matching is necessary because tools emit absolute, package-relative, or
`src`-stripped paths. It can misassociate files with repeated basenames.
Binding all selected sources mitigates this but means analyzing a subset can
match differently from analyzing the whole project.

Recommendation: prefer exact canonical matches, preserve the ambiguity guard,
and emit diagnostics for unmatched and ambiguous keys.

### Merging reports

The source overwrites duplicate `SF` records according to filesystem/glob
order instead of aggregating them. Monorepos or shard reports can therefore
lose coverage.

Recommendation: define merge semantics. For independent test shards, aggregate
hits by line and branch identity. For duplicate reports of the same run,
deduplicate to avoid double-counting.

### Range attribution

Line-based attribution can include declaration lines and exclude generated
branch locations. Arrow variables use a declarator range while methods use the
whole method. Source maps are not considered.

Recommendation: preserve ranges initially, expose them in debug output, and
add fixtures for decorators, multiline signatures, JSX, and transpiler LCOV.

### Test runner compatibility

The source assumes npm, Vitest, or c8. Risks include:

- pnpm, Yarn, Bun, and Corepack projects;
- Jest's native coverage;
- test scripts that already wrap coverage;
- monorepo root scripts versus package scripts;
- c8 not observing worker subprocesses;
- custom coverage scripts writing outside scanned locations.

Detect the package manager from lockfiles only after the desired policy is
specified. Never silently invoke a different package manager.

## Parser and syntax risks

### Error recovery

Tree-sitter can return useful trees for invalid source but the source tool does
not report parse errors. Empty output may be mistaken for a file with no
functions.

Recommendation: collect parser error nodes. Warn by default and offer a strict
mode that fails analysis.

### Grammar version drift

Node kinds and nesting for optional chains, decorators, import attributes, and
new syntax can change. Unpinned/latest grammar behavior can alter CI scores.

Recommendation: pin versions and run the full fixture suite on dependency
updates.

### UTF-8 versus UTF-16 offsets

Tree-sitter byte offsets are UTF-8; TypeScript compiler offsets are UTF-16 code
units. If the parser changes, non-ASCII text can break route exclusion and
stable IDs unless offsets are converted deliberately.

## CLI and operational risks

### Shell execution

The custom coverage command intentionally runs through a shell and is arbitrary
code. Generated commands must remain argument arrays. Documentation should
make the trust boundary clear.

### Destructive cleanup

The source deletes the selected report directory before generation. A bad path
calculation would be destructive.

Recommendation: constrain deletion to a tool-owned directory under the project
root and verify that boundary before removal.

### Git mode

`--changed` means working-tree modifications and untracked files, not “changed
from the main branch.” The name is easy to misinterpret.

Recommendation: document it as working-tree mode or rename it. Add a separate
`--diff <ref>` only if required.

### Output writes

Direct writes can leave truncated EDN on interruption.

Recommendation: write and rename atomically. Do not write metrics if parsing or
coverage policy has produced a fatal result.

### Threshold semantics

The source uses strict `>`; equality passes. Floating scores are rounded before
comparison because the threshold sees stored entry values.

Recommendation: preserve and test this. Document whether future output/metric
versions compare rounded or full precision.

## Source inconsistencies to avoid copying

- The UML references a missing language abstraction; actual dispatch is a map.
- README discovery exclusions are less complete than implementation/help.
- TypeScript support descriptions do not disclose omitted generator/object/
  computed/class-field functions.
- The runner says custom coverage should write reports, but it cannot enforce
  their path.
- Missing coverage and deliberately unexecuted code both become 0%, even though
  their diagnostics differ.
- The comment that metrics replacement is atomic is not supported by the
  direct `write_text` implementation.

## Resolution

These risks have now been resolved for version 1 in
`v1-decisions.md`. In particular, v1 uses the TypeScript Compiler API,
accepts TypeScript extensions only, includes additional modern function forms,
uses a named metric version, treats coverage-generation failure separately
from 0% function coverage, and writes EDN atomically.

This document remains useful as design rationale. It is not authoritative when
an alternative conflicts with the version 1 decisions.

