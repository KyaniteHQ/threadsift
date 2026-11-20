# Repository layout

`git ls-files` lists what exists. This page holds the placement rules and their reasons.

The deploy button builds from the repository root, because a monorepo subdirectory "becomes the new repo root" and must hold its own dependencies (Workers docs, Deploy buttons). So the root is the Worker project: `wrangler.jsonc` and `package.json` sit there.

- `.node-version` says 26, so Workers Builds builds on Node 26 instead of its default 24.
- `src/core/` holds logic that knows no target, in folders that import each other in one order (The folders of `src/core`, below). `src/http/` holds the Hono routes, each stating its own access gate (`access(...)`, or `unrouted()` for the unmatched `/api/` paths), and the MCP endpoint. Neither imports `node:*`, `cloudflare:*` or `src/targets/` (`docs/architecture/one-codebase-two-install-targets.md`).
- `src/targets/shared/` holds adapters both targets use. `src/targets/node/` holds the container entry and its adapters, and `src/targets/worker/` the Worker entry (fetch, queue, scheduled) and its adapters.
- `web/` is the React SPA and imports `design/system/`, the one source of visual values.
- `test/` holds the core tests, which run the real app in process on a temp database. `smoke/` holds the Playwright specs for both targets and the live check.
- `extension/` is its own pnpm workspace package.
- `bot/` holds the Threadsift bot. `tools/bot-release.sh` keeps its hashes true, and `test/bot-skills.test.ts`, `test/bot-script-tasks.test.ts`, `test/bot-script-links.test.ts` and `test/bot-release.test.ts` keep it true to the API.
- `tools/` holds the build and check scripts. `tools/oxlint/` holds the lint rule plugins: vendored anti-slop and Threadsift's own rules. `tools/copy/write-copy.sh` writes every text a user reads in the product. `tools/check-worker-size.ts` fails `pnpm build:worker` when the Worker upload passes the 64 MiB limit. `tools/doc-refs.ts` and `tools/docs-impact.ts` check the docs (`docs/architecture/lint-and-format.md`).
- `.claude/` holds the agents (`.claude/agents/`), their skills and the lint hook (`docs/agents/`). `.agents/skills/` holds the skills the Antigravity CLI loads: humanizer, and a link to `.claude/skills/impeccable`.
- `.github/workflows/` holds the gate with the live deploy and the live check.

## The folders of `src/core`

Every module sits in `src/core/<folder>/`. `tools/core-layout.json` records which folder holds which module (`modules`), the order of the folders (`order`) and each feature's entries (`entries`, `testEntries`). The lint rule `threadsift/layer-imports` and the check `pnpm run check:core-layout` read that file and fail on a violation (`docs/architecture/lint-and-format.md`). A basename is unique across `src/core/`, so the docs name a module by its bare name, and `git ls-files 'src/core/*/<name>.ts'` finds it. `git ls-files src/core | cut -d/ -f3 | sort | uniq -c` counts the modules of each folder.

```
contract  ->  kernel  ->  access ... bot (the features, in `order`)  ->  compose
lowest                                                                  highest
```

A folder imports only itself and the folders before it in `order`. Type imports, `import()` and `require()` count. `web/`, `extension/` and `design/` import only `contract`, and never `src/http` or `src/targets`.

### Where a module goes

Take the first answer that fits.

1. **`contract`**, when `web/` or the Extension imports the module, or a `kernel` module does and the module imports only `zod` and other `contract` modules. A `contract` module imports no `src/core` module outside `contract`: constants, Zod schemas, types and pure parsers. The request and answer shapes of the HTTP routes sit here in `*-wire.ts` modules (`item-route-wire.ts`, `access-wire.ts`), because `web/` reads them; `src/http/route-input.ts` keeps only the path parameters and query strings that routes parse. Four modules sit here although `web/`, the Extension and `kernel` do not import them: `item-cursor.ts` (read by `item`, `wiki` and `src/http`), `shown-status.ts` (read by `src/http` and by the `item-wire.ts` and `item-detail-wire.ts` modules here), `x-intake-contract.ts` (read by `ai`, `bot`, `x`, `src/http` and tests) and `zod-reasons.ts` (read by `ai`, `x`, `src/http` and `x-intake-contract.ts`). `ai` comes before `x`, so the last two cannot sit in `x`. `item-cursor.ts` could sit in `item` at the cost of one entry, and stays here so that the interface of `item` does not widen; `shown-status.ts` must sit here, because a `contract` module imports no module outside `contract`. Which packages a browser may load is the job of `threadsift/no-server-value-import`, so `text-projection`, which imports `remark` and `unified` and which the web bundle holds, sits here and needs no exception.
2. **`kernel`**, when the module is a table or the schema, a port or its interface module or a helper of a port, a guard, a part of the job queue, or a reader or writer of a stored record that two or more features import. A module that a `kernel` module imports and that is not `contract` also sits here, because `kernel` imports only `contract` and `kernel`. A reader or writer of a stored record that one feature imports stays in that feature.
3. **The feature that owns the module's term**, when one feature does. The table below names the terms of each feature, taken from `GLOSSARY.md`. A module keeps its name when its folder differs from its prefix: `vault-stale` is in `kernel`, because writers in many features declare their stale Vault notes in it, and the features before `vault` in `order` could not import it from there.
4. **`compose`**, when the module joins several features and no feature owns it: the job engine and its handlers, the sweep, the tick and the Item delete. No other `src/core` folder imports `compose`; `src/http/`, `src/targets/` and the tests do.

| feature | owns |
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

The features are ordered so that each imports only the features before it, and never one after it. When two features need each other, one of them gives a declaration to `kernel` or `contract`, or they become one feature.

### Entries

An outside caller reaches a feature through its entries. The entries of a feature are its interface: `entries` lists the modules that code under `src/` outside the folder imports, and `testEntries` lists the modules that only `test/`, `tools/` or `smoke/` import. Every other module of the feature is hidden. `layer-imports` refuses an import of a hidden module from outside the feature. Only `test/`, `tools/` and `smoke/` may also import `testEntries`; `src/http/`, `src/targets/`, `bot/` and the root config files follow the `src/` rule and import `entries` only. `contract`, `kernel` and `compose` have no entries and are open to every folder that comes after them, because a folder may import any folder before it. Nothing imports `compose` from `src/core/`, since it comes last.

The lists hold the modules that outside code imports. A caller that moves off an entry, and the removal of the module's name from the list, make the feature deeper (depth is the behaviour a caller reaches per unit of interface it learns). The diff of `tools/core-layout.json` shows each widening and each narrowing of an interface. `pnpm run check:core-layout` fails on a name that no outside file imports any more, so a stale entry cannot stay.

### Editing `tools/core-layout.json`

The file has four keys. `order` lists the folders, lowest first. `modules` maps each module file name to its folder. `entries` and `testEntries` map each feature folder to a sorted list of file names. Keep the keys of `modules` sorted.

- **A new module.** Create `src/core/<folder>/<name>.ts` by the rule above, then add `"<name>.ts": "<folder>"` to `modules`. A name that another folder already uses is refused by lint, because a basename is unique. `layer-imports` fails on a module that `modules` does not list under the folder it sits in.
- **A new entry.** When code outside the feature must import a hidden module, add `"<name>.ts"` to `entries.<feature>` if code under `src/` imports it, or to `testEntries.<feature>` if only `test/`, `tools/` or `smoke/` do. First check whether an existing entry can serve the caller. A name never sits in both lists.
- **A removed entry.** When the last outside importer goes, delete the name from `entries.<feature>`, or move it to `testEntries.<feature>` when a test still imports it. `pnpm run check:core-layout` names it.
- **A moved module.** Run `git mv` to the new folder, change its value in `modules`, fix the import paths, and move its name between `entries` lists if its folder changes feature.
- **A new feature.** Add the folder name to `order` after the last feature it imports and before the first feature that imports it, which is always before `compose`. Add `"<feature>": []` to `entries` and to `testEntries`; the plugin refuses to load while a feature in `order` has no key in either list, and an unknown key is refused too. Add each of its modules to `modules`, add a row to the table above, and use only terms of `GLOSSARY.md`.
- After any edit run `pnpm lint:fix` and `pnpm run check:core-layout`, and update the docs that name the module (`pnpm docs:impact`).
