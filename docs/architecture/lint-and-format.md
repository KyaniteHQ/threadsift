# Lint and format

oxlint lints the code and reports TypeScript errors, and oxfmt formats it. Both run directly and not through Vite+, which advises against a separate oxlint configuration and oxfmt configuration ([viteplus.dev lint guide](https://viteplus.dev/guide/lint)). Direct use keeps every oxlint flag and lets oxlint update on its own schedule.

The oxlint configuration and the oxfmt configuration hold the rules. This page holds the reasons they do not show, the import boundaries and the whole-repository checks.

## Contents

- [Reasons the configuration does not show](#reasons-the-configuration-does-not-show)
- [Import boundaries](#import-boundaries)
- [Custom rules](#custom-rules)
- [Whole-repository checks](#whole-repository-checks)
- [Fixes that run without review](#fixes-that-run-without-review)
- [Outside the lint](#outside-the-lint)

## Reasons the configuration does not show

- oxfmt does not check Markdown, so `pnpm exec oxfmt --check <doc>` passes without reading it. oxfmt pads every table column to its widest cell, so a one-cell change in a doc would rewrite the whole table.
- Type check. `oxlint-tsgolint` reports TypeScript errors with the lint, so there is no separate `tsc` step. It needs TypeScript 7.
- `reportUnusedDisableDirectives` is `error`, so a disable directive that suppresses nothing fails the lint. Delete the directive when the configuration starts to cover its line.
- Plugin folders. `anti-slop` is vendored from dmmulroy/anti-slop, and the lint, the formatter and the root TypeScript configuration leave it out, so the repository's strict options do not apply to upstream code. The `threadsift` folder is exempt from `typescript/prefer-readonly-parameter-types`, because ESTree nodes are mutable by construction and no `allow` entry exempts the node types.
- Drizzle types are exempt from `prefer-readonly-parameter-types`. The `allow` list names `SQL`, `SQLWrapper`, `SQLiteColumn`, `SQLiteTable` and `Subquery` from `drizzle-orm`, because their members are mutable by construction. A table, column or subquery parameter needs no inline disable. The rule offers no form that matches the named type alone. `p: SQL & { extra: string[] }` passes, while `p: { extra: string[] }` fails, so a reviewer reads a parameter typed as such an intersection by hand.
- `ol` and `ul` may carry `role="list"`. VoiceOver in Safari drops list semantics from a list with `list-style: none` unless the element carries the role.
- `import/max-dependencies` counts value imports only. `ignoreTypeImports` skips type imports, because `import type` is erased and adds no runtime or bundle coupling. `typescript/no-import-type-side-effects` refuses `import { type X }` with no value beside it, which `verbatimModuleSyntax` keeps as an import of the module and the cap would not count. Counting type imports made code reach a type through `ComponentProps<typeof X>` or `Parameters<typeof f>[0]`, keep a re-export, or copy a helper to stay under the cap. A route module imports the contract schemas, the core functions and the shared HTTP helpers of its routes, and the route list imports each top-level register function, so its imports grow with the route list.
- Anti-slop leaves out four upstream rules. `no-chained-type-assertions` and `no-widen-then-assert` are not needed, because `typescript/consistent-type-assertions` set to `never` bans the assertion itself. `require-safety-comment-for-type-assertion` conflicts with the comment policy, and `require-readable-spacing` is left out as well.

## Import boundaries

The oxlint configuration declares each import ban once, and `restrictImports` hands it to two rules. `eslint/no-restricted-imports` refuses an `import`, an `export ... from` (type-only ones included), a bare `import "x"` and an `import()` with a string source. It does not visit an `import()` type (`type T = import("x")`, `typeof import("x")`), so `threadsift/no-restricted-import-types` refuses that form with the same message. `typescript/consistent-type-imports` is not used, because its `disallowTypeAnnotations` option bans every `import()` type and carries no message for each pattern ([the rule's docs](https://oxc.rs/docs/guide/usage/linter/rules/typescript/consistent-type-imports.html)). `require` is refused as a Node global, and `import x = require("x")` by TypeScript's `erasableSyntaxOnly` (TS1294).

| Where | Refused |
|---|---|
| `src/core`, `src/features`, `src/http` | `node:*`, `cloudflare:*` and `targets/` (a runtime module belongs in an adapter under `src/targets/`), and the vault queue module outside the vault modules |
| `src/core` and the core halves | `hono` and `@hono/*`, so the code that needs them moves into an http half or `src/http/` |
| the vault modules in `src/core` and the core halves | the same bans as above, with the vault queue module allowed |
| `web/**` | `node:*` and `cloudflare:*` |
| `web/**` except the call module | `fetch`, `globalThis.fetch`, `window.fetch` and `self.fetch`. The web app calls the server through one module, which gives every read its deadline and makes every write name one ([Web app](web-app.md), Read and write deadlines). A destructured `fetch` is not seen, and the Extension and `smoke/` sit outside `web/`, so the rule does not reach them |
| `web/src/**`, Extension entrypoints and libraries | a value import whose chain reaches `drizzle-orm`, `hono`, `@hono/*`, `node:*` or `cloudflare:*` (`threadsift/no-server-value-import`) |

The vault queue module belongs to the vault modules. Outside them, a writer queues a Vault note only through an entry of `STALE` (the stale-notes declaration in `kernel`). Inside them, the vault state module calls `queueVaultNotes` itself, for the inventory seed and for the lease recovery. The rule reads only imports, so a write of a table that feeds a note and queues nothing is not refused, because the statements come from Drizzle builders in many modules ([Vault mirror](vault-mirror.md), Queue).

### `threadsift/layer-imports`

The rule reads the layout file when the plugin loads and takes no option. The plugin refuses to load while a feature folder of `order` has no key in `entries` and `testEntries`, or when `order` does not run `contract`, `kernel`, the features, `compose`. The root of the repository comes from the plugin's own location, so oxlint run from `web/` or any other folder reports the same violations.

It reports an import, an export-from, a `require()`, an `import()` and an `import()` type, type-only ones included, that breaks the import rules of [Repository layout](repository-layout.md), The tree under src.

Details of the matching:

- A template literal without `${}` counts as a plain string.
- It resolves relative specifiers and the Extension's WXT aliases `@/`, `~/`, `@@/` and `~~/`, which the Extension's generated tsconfig maps to the Extension folder. The root TypeScript configuration, the Vite configuration and the web app define no alias, and the Extension defines no other.
- A `require()`, `createRequire(...)()` or `import()` whose source is computed is reported when a string in it names a path under `src/core` or `src/features`, or, in a file of `web/`, `extension/` or `design/`, a path under `src/http` or `src/targets`. A source with no such string, such as `import(pathToFileURL(path).href)` in the container's fetcher module loader, is not seen.
- `new URL(..., import.meta.url)` and `import.meta.resolve` load nothing and are not checked.
- No code outside `design/prototype/` calls `require` or `createRequire`.
- The rule applies to every linted file, so it has no `files` override and no exception. The packages a browser may load are the job of `threadsift/no-server-value-import`.

## Custom rules

### `threadsift/no-comments`

It refuses a prose comment. It keeps a shebang and the kinds that [Changing code](../agents/changing-code.md), No comments, lists.

### `threadsift/no-item-insert`

`itemInsert` is the one door for an insert into `items`. The rule is on in `src/**` except the Item rows module that defines `itemInsert`. It refuses a call `<expression>.insert(items)`. `itemInsert` puts the Restore guard in front of the insert, and nothing else refuses an Item while a Restore holds the library ([Export, backup and restore](export-backup-and-restore.md), While it runs).

The rule matches the identifier `items` as the first argument. It does not see an alias (`const table = items`), nor the registry insert of the Restore (`insertRows`, which takes its table from `spec.table` and writes the Restore's own rows). A scratch `db.insert(items)` in `src/` gets the message that names `itemInsert`.

### `threadsift/no-server-value-import`

It reports a value import whose chain reaches a server module (the `forbidden` option in the oxlint configuration lists them), because the bundler ships every module a value import reaches. A plugin rule sees only the file it lints, so the walk reads the other files itself. It scans their import statements with regular expressions and follows only relative `.ts`, `.tsx` and `.mts` paths. The plugin runs in Node, so `node:fs` works, as `pnpm lint` shows. The plugin docs ([Writing JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins)) do not mention reading files, and the `@oxlint/plugins` types give a rule `context.cwd` and `context.filename`.

The rule sees no path alias, no `require` and no import in a file that the walk cannot scan as TypeScript. The repository has none of those, and the root TypeScript configuration sets no `paths`. The WXT and Vite configurations run in Node, so the folders above exclude them.

### `threadsift/no-await-before-rethrow`

It reports an `await`, a `for await` or an `await using` that runs before a `catch` block throws the caught error, because a failure there replaces the error the caller needs. With `finalizers` on, which the config sets for `src/`, it also reports an `await` in a `finally`.

- A call passes when its callee is a function that the `cannotThrow` option names for its declaring module. A listed name that its module does not declare is reported, so a stale entry fails lint.
- The listed functions must catch and log their own failure. Nothing checks that.
- The rule does not see: a nested `catch` that throws, a rethrow of a wrapped error or of any expression other than the caught name, a rethrow inside a helper that the `catch` calls, a `catch` with no parameter or a destructured one, a promise handled with `.then`, and the real exits of a `break` (it treats `break` as the end of the path).

## Whole-repository checks

Lint sees one file at a time, so two scripts read the whole repository. Both are part of `pnpm run check`, so of `ci:gate`.

### `pnpm run check:core-layout`

The script reads every tracked code file and fails in these cases:

- A file sits outside the places the layout names.
- A feature of `order` has no core half.
- A basename repeats within the core side or the http side.
- `entries` or `testEntries` names a module that is not in the core half of that feature, or that no importer outside the feature uses (`entries`: a file under `src/` or a root config. `testEntries`: a file in `test/`, `tools/` or `smoke/`).
- A name is in both lists.
- A file of `src/http/` is imported only by the http half of one feature, which then owns it.

Its import scan is a regular expression, like the one of `threadsift/no-server-value-import`.

### `pnpm run check:doc-refs`

The script reads every tracked Markdown file except these:

- the dated records (the design reviews, the bot changelog and the Claude Design prompts),
- the provenance files of vendored code,
- the `impeccable` skill and agents, which name the paths of other projects.

It refuses a path, a link, a symbol paired with a path, or a line number that the code no longer matches. The tables `OTHER_PROJECT_SPANS` and `OTHER_PROJECT_SYMBOLS` in the script list, by doc, the spans that name another project's files.

### `pnpm docs:impact [base]`

The command lists the doc lines that a change may make untrue ([Changing code](../agents/changing-code.md), Finish).

## Fixes that run without review

The commit hook and the agent hook apply safe fixes only. The agent hook runs after each edit to a file in the project or in one of its git worktrees, and lints with that checkout's own `node_modules`. Suggestion fixes run only through `pnpm lint:fix`, whose diff the agent reads.

## Outside the lint

`design/prototype/` is reference code, and the CSS of the design system keeps its one-line rule layout, so both stay out of oxlint and oxfmt. The TypeScript of the design system is app code: oxlint, oxfmt and the TypeScript `include` cover it.
