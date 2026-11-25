# Repository layout

This page holds the placement rules and their reasons. `git ls-files` lists what exists.

## Contents

- [Top-level folders](#top-level-folders)
- [The tree under src](#the-tree-under-src)
- [Where a module goes](#where-a-module-goes)
- [Where a route module goes](#where-a-route-module-goes)
- [Entries](#entries)
- [Edit the layout file](#edit-the-layout-file)

## Top-level folders

The deploy button builds from the repository root, because a monorepo subdirectory "becomes the new repo root" and must hold its own dependencies ([Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)). So the root is the Worker project: the Worker configuration and the package manifest sit there. A Node version file at the root says 26, so Workers Builds does not use its default, 24.

| Folder | Holds |
|---|---|
| `src/core/` | `contract`, `kernel` and `compose`, the three folders that no feature owns |
| `src/features/<feature>/` | one folder for each feature, with its logic in `core/` and its route modules in `http/` |
| `src/http/` | the HTTP parts that no feature owns |
| `src/targets/` | `shared/` for the adapters both targets use, `node/` for the container entry and its adapters, `worker/` for the Worker entry (fetch, queue, scheduled) and its adapters |
| `web/` | the React SPA, which imports `design/system/`, the one source of visual values |
| `extension/` | the browser Extension, its own pnpm workspace package |
| `bot/` | the Threadsift bot |
| `design/` | the design system and the prototype |
| `test/` | the core tests, which run the real app in process |
| `smoke/` | the Playwright specs for both targets, and the live check |
| `migrations/` | the database migrations |
| `tools/` | the build and check scripts, `tools/oxlint/` for the lint rule plugins, and `tools/copy/` for the script that writes every text a user reads in the product |
| `docs/` | the docs |
| `.claude/` | the agents, their skills and the lint hook ([Changing code](../agents/changing-code.md)) |
| `.codex/` | the Codex hooks: the Impeccable check after an edit and its design pass when a turn ends |
| `.impeccable/` | the settings of the Impeccable check, and the sidecar of the design system doc that its documenter writes |
| `.vscode/` | the editor settings that run oxlint and oxfmt on save, and the recommended oxc extension |
| `.agents/skills/` | the skills the Antigravity CLI loads, and the link to the Impeccable skill that the Codex hooks run |
| `.github/workflows/` | the gate, the live deploy and check, the release, the contributor licence agreement and the update workflow of Cloudflare copies |

The docs call the two halves of a feature the core half and the http half. None of `src/core/`, `src/features/` and `src/http/` imports `node:*`, `cloudflare:*` or `src/targets/` ([One codebase, two install targets](one-codebase-two-install-targets.md)).

`pnpm build:worker` fails when the Worker upload passes 64 MiB. [Lint and format](lint-and-format.md) describes the checks of the docs.

## The tree under `src`

```text
src/
  core/       contract/  kernel/  compose/      the folders no feature owns
  features/
    <feature>/  core/  http/                    one folder for each feature of `order`
  http/       the access gate, refusals, MCP endpoint, route helpers, the route list, the app
  targets/    the adapters of the two install targets
```

The folder of a file states its place, so no list records it. The layout refuses a file that sits anywhere else under `src/core/` or `src/features/`, or in a subfolder of `src/http/`. The layout file, `tools/core-layout.json`, holds the order of the folders (`order`) and each feature's entries (`entries` and `testEntries`). The lint rule `threadsift/layer-imports` and the check `pnpm run check:core-layout` read it and fail on a violation ([Lint and format](lint-and-format.md)).

Imports go up this list and never down:

```text
contract < kernel < core halves of the features (in `order`) < compose < src/http < http halves of the features < the route list and the app
lowest                                                                                                           highest
```

- Type imports, `import()` and `require()` count as imports.
- The http halves of two features never import each other.
- Outside its own http half, only the route list (`registerRoutes`) and the app (`createApp`) import an http half.
- No file of `src/core/` or of a core half imports `hono` or `@hono/*`, so a route's Hono types stay in an http half.
- `web/`, `extension/` and `design/` import only `contract`. They never import `src/http`, an http half or `src/targets`.

A basename is unique within the core side (`src/core/` and the core halves) and within the http side (`src/http/` and the http halves), so the docs name a module by its bare name. Two basenames, `bearer` and `access-contract`, exist on both sides, so the docs give their folder. `git ls-files ':(glob)src/**/<name>.ts'` finds a module.

## Where a module goes

Take the first answer that fits.

1. `contract`, when `web/` or the Extension imports the module, or a `kernel` module does and the module imports only `zod` and other `contract` modules. A `contract` module holds constants, Zod schemas, types and pure parsers, and imports no `src/core` module outside `contract`. The request and answer shapes of the HTTP routes sit here in the `*-wire` modules, because `web/` reads them.
2. `kernel`, when the module is a table or the schema, a port or its interface module or a helper of a port, a guard, a part of the job queue, a reader or writer of a stored record that two or more features import, or a helper that two or more features import and no feature owns, such as the Markdown escapes. A module that a `kernel` module imports, and that is not `contract`, also sits here, because `kernel` imports only `contract` and `kernel`. A reader or writer of a stored record that one feature imports stays in that feature.
3. The feature that owns the module's term, when one feature does, in `src/features/<feature>/core/`. The table below names the terms of each feature, taken from the [glossary](../../GLOSSARY.md). The stale-Vault-notes declaration is in `kernel`, because writers in many features declare their stale notes in it and the features before `vault` in `order` could not import it from `vault`.
4. `compose`, when the module joins several features and no feature owns it: the job engine and its handlers, the sweep, the tick and the Item delete. No core half imports `compose`. `src/http/`, the http halves, `src/targets/` and the tests do.

Four `contract` modules are read by neither `web/`, the Extension nor `kernel`, and sit there for another reason:

- The Item list cursor, which `item`, `wiki` and `src/http` read. It could sit in `item` at the cost of one entry, and stays in `contract` so the interface of `item` does not widen.
- The shown status, which `src/http` and two other `contract` modules read. A `contract` module imports no module outside `contract`, so it must sit there.
- The X intake contract, which `ai`, `bot`, `x` and tests read.
- The Zod reasons helper, which `ai`, `x`, `src/http` and another `contract` module read.

`ai` comes before `x` in `order`, so the last two cannot sit in `x`. `threadsift/no-server-value-import` decides which packages a browser may load. The text projection module imports `remark` and `unified` and the web bundle holds it, so it sits in `contract` and needs no exception.

| Feature | Owns |
|---|---|
| `access` | the owner's login and password, sessions, agent tokens, the Daily budget |
| `ai` | Provider, AI task, the Grok Bot task kinds, OpenRouter connect |
| `thread` | the comments and post text of an Item: the comment filter, Kept comment selection, the thread store |
| `media` | article images, stored and served images, media reads and writes |
| `item` | Item rows, the Item list and detail, Read state, Highlight, Note, search |
| `wiki` | Topic, Tag, Topic page, Index, Log, Proposal, Pin |
| `github` | the GitHub Source |
| `vault` | the Vault mirror |
| `x` | the X Source: posts, Author thread, Quote chain, verification, bookmark intake |
| `reddit` | the Reddit Source: the connected account, the Arctic Shift archive fill, oEmbed |
| `fetch` | fetching a pasted link, the container's fetcher plug-ins |
| `digest` | Digest |
| `paste` | Paste, Import, Short-link alias, saving an Item |
| `export` | Export, the zip codec |
| `restore` | Restore |
| `related` | Related Item |
| `bot` | the Threadsift bot: answers, verification |

Each core half imports only the core halves before it. When two features need each other, one gives a declaration to `kernel` or `contract`, or they become one feature.

## Where a route module goes

A route module goes in `src/features/<feature>/http/` when it serves the terms of one feature and imports only route modules of that feature. The owner is the feature whose term the route path names. The Item delete route sits in `item` although it calls the Item delete of `compose`, and `/share`, Import and batch Paste sit in `paste`.

A route module goes in `src/http/` in these cases, because only an http half's own modules, the route list and the app import an http half:

- The gate, the MCP endpoint or the routes of two features read it.
- It serves several features.
- A target, a tool, a smoke check or a test imports it.

The Item view and the Item read modules stay in `src/http/`, because the Item routes, the paste routes and the MCP endpoint read them. The web headers and document path modules and the app stay there, because targets, tools or tests import them.

Each route states its own access gate with `access(...)`, or `unrouted(app)` for the unmatched `/api/` paths. A route group is one module that declares its routes and registers their handlers. The access group is the exception: its declarations serve both its own route module and the password route module. The route list `registerRoutes` names the top-level register functions in the order that decides route matching and the order of `/api/openapi.json`.

`layer-imports` refuses a route module that the route module of another feature imports. `check:core-layout` fails a `src/http` module that only one feature's http half imports, and its message names the folder to move it to.

## Entries

An outside caller reaches a feature through its entries. The entries of a feature are its interface:

- `entries` lists the modules of its core half that code under `src/` outside `src/features/<feature>/` imports.
- `testEntries` lists the modules that only `test/`, `tools/` or `smoke/` import.
- Every other module of the core half is hidden. `layer-imports` refuses an import of a hidden module from outside the feature.

Only `test/`, `tools/` and `smoke/` may also import `testEntries`. The http halves of other features, `src/http/`, `src/targets/`, `bot/` and the root config files import `entries` only. The http half of a feature is inside the feature, so it imports any module of its own core half and needs no entry, and the lists do not show which core modules its routes call. `contract`, `kernel` and `compose` have no entries, and every folder that ranks after them may import them.

The lists hold the modules that outside code imports. When a caller moves off an entry and the module's name leaves the list, the feature gets deeper (depth is the behaviour a caller reaches for each unit of interface it learns). The diff of the layout file shows each widening and each narrowing of an interface, and `pnpm run check:core-layout` fails on a name that no file outside the feature imports any more.

## Edit the layout file

The layout file has three keys. `order` lists the 20 folder names, lowest first: `contract`, `kernel`, the 17 features, `compose`. `entries` and `testEntries` map each feature to a sorted list of file names of its core half.

| Change | Steps |
|---|---|
| A new module | Create it in `src/features/<feature>/core/`, or in `src/core/<folder>/` for `contract`, `kernel` and `compose`, by the rules above. It needs no entry. `check:core-layout` refuses a basename that another file of the same side already uses. |
| A new route module | Create it in `src/features/<feature>/http/` by the rule above, import its register function in the route list and add it at the position that decides route matching. It imports any module of its own core half without an entry. |
| A new entry | When code outside the feature must import a hidden module, first check whether an existing entry can serve the caller. Otherwise add `"<name>.ts"` to `entries.<feature>` if code under `src/` imports it, or to `testEntries.<feature>` if only `test/`, `tools/` or `smoke/` do. A name never sits in both lists. |
| A removed entry | When the last outside importer goes, delete the name from `entries.<feature>`, or move it to `testEntries.<feature>` when a test still imports it. `pnpm run check:core-layout` names it. |
| A moved module | Run `git mv`, fix the import paths, and move its name between `entries` lists if its feature changes. |
| A new feature | Add the folder name to `order` after the last feature it imports and before the first feature that imports it (always before `compose`), and add `"<feature>": []` to `entries` and to `testEntries`. The plugin refuses to load while a feature in `order` has no key in either list, and it refuses an unknown key. Create the feature's `core/` folder, add a row to the feature table above, and use only terms of the glossary. |

After any edit, run `pnpm lint:fix`, `pnpm run check:core-layout` and `pnpm docs:impact`, and update the docs that name the module.
