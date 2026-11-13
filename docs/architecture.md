# Threadsift: architecture

Status: chosen on 2026-11-04 in a grill with the owner and revised after four model reviews the same day.

| State | Part |
|---|---|
| Built | The app saves a pasted link, fetches it through a job runner, writes a Digest with the saved Provider, lists, searches and filters Items, and opens one in the Reader (comments, images, Highlights, a Note) in the List and Grid Layouts, on both install targets |
| Built | The Extension saves a page or a Reddit thread from the owner's tab, and a pasted Reddit link is filled from the Arctic Shift archive |
| Built | A caller that fetched an X post with its replies saves them with a Paste as one JSON text |
| Built | Agents with an agent token search, read and add Items through MCP at `/mcp` |
| Built | The container loads a self-hoster's fetcher plug-ins at start (page text only) |
| Built | The owner's connected Reddit account is the first source for a Reddit link without Extension content, one fill at a time (the Extension's Connect Reddit button is not built) |
| Built | A Reddit post that links to an article or a GitHub repository gives the Digest that page's text (the one hop) |
| Built | A routine or an agent saves many links, with a cursor the Instance keeps, through `POST /api/items/batch`, and the owner imports a pasted or uploaded list of links on the Import screen at `/import` with the same call |
| Built | The first wiki slice, Topic pages (an agent-written overview and the Topic's Items, reached from the Reader and the filters), is built |
| Built | The Index (every Topic with its Item count and overview line, read from stored rows) is built too, and so are Related Items (up to 5 other Items that the agent links to an Item when its Digest lands, listed in the Reader) |
| Built | The Log (the committed changes the agent made to the library, newest first, at `/log`) is built |
| Built | The weekly Tag-merge Proposals (the weekly run, the Proposals page at `/proposals`, Reject, Accept and the Pin a merge leaves) are built, and so are the weekly Topic-merge Proposals (a second weekly run, Topic rows on the Proposals page, Reject and Accept) |
| Built | Accept of a Topic merge (a state machine shared with the Tag merge, two Topic leases, the Topic Pin it leaves, a `merge-topic` Log entry, and the old address of the merged-away Topic opening the survivor) is built |
| Built | So are the lost-Highlight Proposals (a third weekly check that needs no model, a Proposals page and contract that are generic over kinds, and Accept that removes the Highlight the way the Reader's Remove does), the overview-gap Proposals (a fourth weekly check, also with no model, whose Accept starts the Topic's overview run), and the disagreement Proposals (a fifth weekly check, a model run that names two Items of one Topic whose Summaries disagree, with Reject and Accept, which keeps the pair as a Pin outside the overview and lists it on the Topic page) |
| Built | On the container, a Paste of an X link fetches the post and its replies through the owner's grok CLI when no Grok Bot is saved and the CLI is installed and signed in, under an isolation rule that allows the two X tools and the backend web search and no local tool (Fetchers, X; `GET /api/settings/x`, the X posts section of Settings); live runs on the owner's Instance are still open |
| Not built | The rest of the wiki, the X bookmark Import, the Vault mirror, export and restore are not built |
| Partly built | The Grok Bot settings (the routine's webhook address and key, sealed, and a Test button that sends one ping) are built, and so are the task lifecycle for every AI task kind (the Digest, the Topic overview, the Related pick and the three weekly runs: a job sends the task, waits for the bot's answer and applies it) with its per-task callback credential and result route, and Grok Bot is a selectable Provider (chosen only when the Grok Bot settings are usable, with a Verify that waits for the bot's answer); the fetch job hands an X link to the bot and takes its answer at `POST /api/ai-tasks/{id}/intake` (built, and not yet run against a real bot), and `bot/` holds one skill, two routine prompts, the setup and update guides and one script; no run against a real bot has happened yet |

The repository layout lists what exists at HEAD. The other sections are the v1 design and run ahead of the code; a section that names a file or binding that does not exist yet says "Not built". `docs/spec.md` says what v1 does; the files under `docs/architecture/` say what it is built with and where each part runs. Unless a section dates its own check, versions named in those files were checked on 2026-11-04.

## Sections

| Section | File |
|---|---|
| The stack at a glance | [`docs/architecture/the-stack-at-a-glance.md`](architecture/the-stack-at-a-glance.md) |
| One codebase, two install targets | [`docs/architecture/one-codebase-two-install-targets.md`](architecture/one-codebase-two-install-targets.md) |
| Repository layout | [`docs/architecture/repository-layout.md`](architecture/repository-layout.md) |
| Database and search | [`docs/architecture/database-and-search.md`](architecture/database-and-search.md) |
| Data model outline | [`docs/architecture/data-model-outline.md`](architecture/data-model-outline.md) |
| Files | [`docs/architecture/files.md`](architecture/files.md) |
| Jobs, leases and the schedule | [`docs/architecture/jobs-leases-and-the-schedule.md`](architecture/jobs-leases-and-the-schedule.md) |
| Fetchers | [`docs/architecture/fetchers.md`](architecture/fetchers.md) |
| AI tasks and Providers | [`docs/architecture/ai-tasks-and-providers.md`](architecture/ai-tasks-and-providers.md) |
| Access: owner login, agent tokens, MCP | [`docs/architecture/access-owner-login-agent-tokens-mcp.md`](architecture/access-owner-login-agent-tokens-mcp.md) |
| Web app | [`docs/architecture/web-app.md`](architecture/web-app.md) |
| Extension and Threadsift bot | [`docs/architecture/extension-and-threadsift-bot.md`](architecture/extension-and-threadsift-bot.md) |
| Vault mirror | [`docs/architecture/vault-mirror.md`](architecture/vault-mirror.md) |
| Export, backup and restore | [`docs/architecture/export-backup-and-restore.md`](architecture/export-backup-and-restore.md) |
| Container image | [`docs/architecture/container-image.md`](architecture/container-image.md) |
| Cloudflare deploy button | [`docs/architecture/cloudflare-deploy-button.md`](architecture/cloudflare-deploy-button.md) |
| Development environment | [`docs/architecture/development-environment.md`](architecture/development-environment.md) |
| Lint and format | [`docs/architecture/lint-and-format.md`](architecture/lint-and-format.md) |
| Dependency updates | [`docs/architecture/dependency-updates.md`](architecture/dependency-updates.md) |
| CI, releases and rollback | [`docs/architecture/ci-releases-and-rollback.md`](architecture/ci-releases-and-rollback.md) |
| Testing | [`docs/architecture/testing.md`](architecture/testing.md) |
| Open items and unverified claims | [`docs/architecture/open-items-and-unverified-claims.md`](architecture/open-items-and-unverified-claims.md) |
