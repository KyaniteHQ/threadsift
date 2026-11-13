# Repository layout

The deploy button builds from the repository root, because a monorepo subdirectory "becomes the new repo root" and must hold its own dependencies (Workers docs, Deploy buttons). So the root is the Worker project.

```
wrangler.jsonc, package.json      Worker config and the scripts; the root is the Worker project
.node-version                     26, so Workers Builds builds on Node 26 instead of its default 24
devenv.nix, devenv.yaml           the development environment and the gate tasks
Containerfile                     the container image
migrations/                       SQL files from drizzle-kit, applied on both targets
src/core/                         ingest pipeline, jobs, access, ports
src/http/                         Hono routes, the guard in front of them and the MCP endpoint (`mcp-*.ts`)
src/targets/shared/               adapters both targets use: `node:crypto` behind the Crypto port
src/targets/node/                 container entry and adapters
src/targets/worker/               Worker entry (fetch, queue, scheduled) and adapters
web/                              React SPA; imports design/system/
test/                             core tests: the real app in process on a temp database (`pnpm test`)
smoke/                            the Playwright smoke spec for both targets and the post-merge live check
playwright.config.ts              starts the Worker or the container for the smoke spec and the live check
tools/oxlint/                     lint rule plugins: vendored anti-slop and Threadsift's own rules
tools/copy/                       write-copy.sh, which writes every text a user reads
tools/icons/                      build.ts, which draws the installable app's icons from the design tokens
tools/case-folding/               build.ts, which generates src/core/case-folding-table.ts from the Unicode data file, and check.ts, which checks the key function
tools/check-worker-size.ts        pnpm build:worker; fails when the Worker upload passes the 64 MiB limit
tools/theme-script.ts             the Vite plugin that emits the first-paint theme script as a hashed file and links it from index.html
tools/worker-headers.ts           the Vite plugin that writes dist/web/_headers from src/http/web-headers.ts
extension/                        the browser Extension (WXT): popup, settings page, background worker and the page capture script; its own pnpm workspace package
design/                           design system and prototype
docs/                             spec, architecture, testing, design notes, guides and agent rules
.claude/                          the implementer agent, its skills and the lint hook (docs/agents/)
.agents/skills/                   skills the Antigravity CLI loads: humanizer
.github/workflows/                the gate with the live deploy and live check, PR previews, and the `devenv.lock` update
PRODUCT.md, DESIGN.md, GLOSSARY.md who the product is for, the look every screen follows, and the domain words
renovate.json                     the dependency update rules
```

The tree lists what exists. The Extension saves the page in the owner's tab, saves a Reddit post or comment with its thread and the replies behind its `more` stubs, up to the request limits in `docs/spec.md` (Fetchers), and fills a Link-only Reddit Item when the owner opens its thread; Connect Reddit is not built. A pasted Reddit link gets its title, author and community from oEmbed and, while the archive fill setting is on, its post and comments from Arctic Shift (`src/core/archive-fill.ts`, `src/core/archive-adapter.ts`, `src/core/fetch-source.ts`; the setting is in `src/core/reddit-settings.ts` and `src/http/reddit-routes.ts`). A pasted X link is a Link-only Item unless a caller sends the post with its replies as `content` (`src/core/x-thread.ts`, `src/core/x-wire.ts`); the X fetchers (the grok CLI and Grok Bot) and the connected Reddit account are not built. Fetcher plug-ins are built: the contract is in `src/core/fetcher.ts`, the choice among them and the checks of each answer in `src/core/plugin-fetch.ts`, the call from the fetch job in `src/core/fetch-source.ts`, and the loader in `src/targets/node/fetcher-modules.ts`, which `src/targets/node/operator-code.ts` runs before it starts the CLI runners; the real plug-in modules the tests load are in `test/fetchers/`. The Threadsift bot, the release and update workflows, and the deploy button's files are planned and not built; the sections below that plan them say so. The AI settings, HTTP executor and Verify task are in `src/core/ai-*.ts` and `src/http/ai-routes.ts`. OpenRouter Connect is in `src/core/openrouter-*.ts` and `src/http/openrouter-routes.ts`. The GitHub token setting is in `src/core/github-token.ts` and `src/http/github-routes.ts`. The GitHub rate-limit wait is in `src/core/github-rate-limit.ts`, `src/core/github-cooldown.ts` and `src/core/wait-view.ts`. The Claude Code executor is in `src/targets/node/claude-code.ts` and its process helpers, and the Codex executor in `src/targets/node/codex-*.ts`. The MCP endpoint is in `src/http/mcp-route.ts`, `mcp-gate.ts` and the files they import (Access, MCP). The Reader, the Grid Layout, stored images (`src/core/article-images.ts`, `src/core/media-*.ts`, `src/core/image-*.ts`), Highlights (`src/core/highlight*.ts`), the Note (`src/core/note*.ts`) and the Highlights page (`src/core/highlights-page*.ts`) are built. The installable app and the Share target are built. Automatic Digests and the Topic and Tag lists are built, and so are search over the title, post text, Digest title, Summary, Tags, a repository's description and topics, Kept comments, Highlights and Notes and the filters with their counts (`src/core/search*.ts`, `src/core/item-filters.ts`). A Reddit thread sent with a Paste is built (`src/core/paste.ts`, `src/core/reddit-*.ts`, `src/core/thread-publish.ts`, `src/core/comment-*.ts`), and the Provider's Digest chooses its Kept comments (`src/core/digest-prompt.ts`, `src/core/digest-publish.ts`). The one hop is in `src/core/candidate-link.ts` (the candidate link), `src/core/digest-hop.ts` (the fetch in the Digest job) and `src/core/digest-attempt.ts` (the Digest job's attempt). Of the wiki, Topic pages and the Index (`src/core/topic-*.ts`) and Related Items (`src/core/related-*.ts`, with the Reader's list in `web/src/Related.tsx`) the Log (`src/core/log-*.ts`, with the page in `web/src/LogPage.tsx`) and the weekly Tag-merge Proposals with Accept and Pins (`src/core/proposal-*.ts`, `src/core/pin*.ts`, `src/core/tag-rewrite.ts`, with the page in `web/src/ProposalsPage.tsx`) are built, and so are the weekly Topic-merge Proposals with Accept, the Topic Pin and the shared Topic rewrite (`src/core/pins.ts`, `src/core/pin-merge.ts`, `src/core/catalog-key-links.ts`, `src/core/merge-kinds.ts`, `src/core/topic-merge-unit.ts`), and the lost-Highlight Proposals (`src/core/highlight-proposals.ts`, `src/core/scheduled-claim.ts`, with the row's body in `web/src/LostHighlightBody.tsx`); the other Proposal kinds, export and restore are not built yet.
