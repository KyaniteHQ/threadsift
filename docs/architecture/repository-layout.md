# Repository layout

`git ls-files` lists what exists. This page holds the placement rules and their reasons.

The deploy button builds from the repository root, because a monorepo subdirectory "becomes the new repo root" and must hold its own dependencies (Workers docs, Deploy buttons). So the root is the Worker project: `wrangler.jsonc` and `package.json` sit there.

- `.node-version` says 26, so Workers Builds builds on Node 26 instead of its default 24.
- `src/core/` holds logic that knows no target. `src/http/` holds the Hono routes, the guard in front of them and the MCP endpoint. Neither imports `node:*`, `cloudflare:*` or `src/targets/` (`docs/architecture/one-codebase-two-install-targets.md`).
- `src/targets/shared/` holds adapters both targets use. `src/targets/node/` holds the container entry and its adapters, and `src/targets/worker/` the Worker entry (fetch, queue, scheduled) and its adapters.
- `web/` is the React SPA and imports `design/system/`, the one source of visual values.
- `test/` holds the core tests, which run the real app in process on a temp database. `smoke/` holds the Playwright specs for both targets and the live check.
- `extension/` is its own pnpm workspace package.
- `bot/` holds the Threadsift bot. `tools/bot-release.sh` keeps its hashes true, and `test/bot-skills.test.ts`, `test/bot-script-tasks.test.ts`, `test/bot-script-links.test.ts` and `test/bot-release.test.ts` keep it true to the API.
- `tools/` holds the build and check scripts. `tools/oxlint/` holds the lint rule plugins: vendored anti-slop and Threadsift's own rules. `tools/copy/write-copy.sh` writes every text a user reads in the product. `tools/check-worker-size.ts` fails `pnpm build:worker` when the Worker upload passes the 64 MiB limit. `tools/doc-refs.ts` and `tools/docs-impact.ts` check the docs (`docs/architecture/lint-and-format.md`).
- `.claude/` holds the agents (`.claude/agents/`), their skills and the lint hook (`docs/agents/`). `.agents/skills/` holds the skills the Antigravity CLI loads: humanizer, and a link to `.claude/skills/impeccable`.
- `.github/workflows/` holds one file for each of the gate with the live deploy, the live check, the PR bundle, PR previews, and the `devenv.lock` update.
