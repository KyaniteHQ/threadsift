# Prior art: archive Reddit saved + X bookmarks, tag with an LLM, read in a web UI

Researched 2026-11-03 with `gh api`, README greps, source reads (read-only; nothing cloned into the workspace). Star counts and push dates are from `gh api repos/<o>/<r>` on 2026-11-03.

## Bottom line

No single project does Reddit saved + X bookmarks + LLM tags + web UI. Two things come close:

- Karakeep gives the web UI, REST API, CLI, tagging (OpenAI-compatible or Ollama only), search, and a NixOS module. Its own crawler is weak on Reddit and X, so a custom fetcher has to push rendered content to it.
- `afar1/fieldtheory-cli` (X) and `rhnfzl/reddit-stash` (Reddit) are the best fetchers to borrow from.

## Comparison table

| Repo | Stars | Last push | License | X source | Reddit source | LLM | Storage | UI |
|---|---|---|---|---|---|---|---|---|
| karakeep-app/karakeep | 30264 | 2026-11-02 | AGPL-3.0 | none (URL crawl only) | none (URL crawl only) | OpenAI-compatible, Ollama | SQLite + files, Meilisearch | web, mobile, extensions |
| sidoshi/karakeep-sync | 147 | 2026-04-21 | MIT | planned, not built | OAuth script app, refresh token | via Karakeep | Karakeep | Karakeep |
| viperrcrypto/Siftly | 3085 | 2026-04-08 | MIT | bookmarklet/console JSON, or cookies (auth_token + ct0) GraphQL | none | Anthropic key, OpenAI, MiniMax, `claude -p`, `codex exec` | SQLite (Prisma) + FTS5 | web (Next.js) |
| alexknowshtml/smaug | 950 | 2026-02-03 | MIT | bird CLI with cookies | none | Claude Code or OpenCode (agent runs) | markdown files | none (Obsidian-style files) |
| joemccann/x-bookmarks-pipeline | 92 | 2026-08-27 | MIT | official X API OAuth2 | none | Cerebras, xAI, Claude, OpenAI APIs | SQLite cache + JSON/Pine files | none |
| Gitmaxd/field-theory-ui | 25 | 2026-04-12 | MIT | via fieldtheory CLI | none | Claude Code CLI, Codex CLI, or API keys (chat only) | reads ~/.fieldtheory SQLite | web (local) |
| afar1/fieldtheory-cli | 2055 | 2026-09-05 | MIT | browser cookies GraphQL, or OAuth API | none (Instagram PR open) | `claude`, `codex` CLIs | JSONL + SQLite FTS5 + markdown | terminal, Mac app |
| sytelus/xarchive | 120 | 2026-09-05 | MIT | Chrome extension, internal GraphQL | none | none | IndexedDB, JSON download | extension viewer |
| rhnfzl/reddit-stash | 133 | 2026-10-29 | MIT | none | OAuth script app (password grant) or GDPR CSV | none | markdown + media, optional Dropbox/S3 | none (Obsidian-friendly) |
| akashpandey/Reddit-Fetch | 221 | 2026-10-30 | GPL-3.0 | none | OAuth with refresh token | none | JSON / HTML | static HTML |
| erohtar/redditSaver | 101 | 2026-07-17 | GPL-3.0 | none | OAuth script app, password grant | none | markdown with frontmatter | Obsidian Dataview |

## Facts that apply to every candidate

- **X official API.** `GET /2/users/{id}/bookmarks` needs OAuth 2.0 PKCE with scopes `tweet.read users.read bookmark.read` and returns only the 800 most recent bookmarks (X developer forum, https://devcommunity.x.com/t/bookmark-retrieves-only-800-most-recent/169433; reports of pagination stopping after 2 to 3 pages at https://devcommunity.x.com/t/bookmarks-api-v2-stops-paginating-after-3-pages-no-next-token-returned/257339). Pricing is pay-per-use since February 2026; reading your own bookmarks is an "Owned Read" at $0.001 per resource (https://docs.x.com/x-api/getting-started/pricing, read 2026-11-03). So roughly $1 per 1000 bookmark reads, but the 800 cap means older bookmarks are unreachable. The `x-bookmarks-pipeline` README still says "Basic tier ($100/month)", which is stale against the pricing page. Cookie-based GraphQL (fieldtheory-cli, Siftly, xarchive, smaug) has no such cap but uses X's undocumented internal API and a logged-in session; it can break when X changes its schema (xarchive issues #1, #3 show such breakages).
- **Reddit API access.** Reddit's saved list shows only the latest 1000 items (`reddit-stash` README, "Overcome Reddit's Limitations"). Since November 2025 new API apps need Reddit's pre-approval (`reddit-stash` README line 11; `Reddit-Fetch` README lines 30 to 65, and its closed issue #7 "Cannot Create Reddit API App"). Third-party blogs say personal scripts are often rejected (WebSearch 2026-11-03, sources sell alternatives, so treat as unconfirmed; I could not open Reddit's own policy page, it returned 403). Existing app credentials and refresh tokens keep working. Omer should check whether he can still create a script app at https://www.reddit.com/prefs/apps before choosing a design; I did not test that (it needs his login).
- **Reddit GDPR export.** https://www.reddit.com/settings/data-request gives `saved_posts.csv` and `saved_comments.csv`. Only `reddit-stash` uses it (details below). The 1000-item limit applies to the live listing, so the export is the only route in this list to older saves.
- **Reddit cookie or `.json` route.** None of the candidates uses it. I did not test it.

## Per candidate

### karakeep-app/karakeep (AGPL-3.0, 30264 stars, pushed 2026-11-02)
Evidence: `gh api repos/karakeep-app/karakeep`, commits, releases, docs under `docs/docs/` in the repo.
1. **Data:** it is not a fetcher. It crawls URLs you give it, takes a Netscape HTML, Pocket CSV, Omnivore JSON, or one-link-per-line CLI import (`docs/docs/04-using-karakeep/import.md`). Reddit and X crawling is weak: open issues #2885 "Reddit crawling is now getting blocked", #1883, #739 (Reddit full page archiving), #1331 "Twitter (x.com) doesnt download media", #1468 (save X thread), #2651 (X crawler extracts unrelated reply content).
2. **Media, pages, threads:** link bookmarks keep screenshot (default on), optional PDF, optional full-page archive (monolith), optional yt-dlp video (`CRAWLER_*` variables in `01-environment-variables.md`). No comment-thread model; a thread would have to be flattened to text.
3. **LLM:** `OPENAI_API_KEY` (+ `OPENAI_BASE_URL` for any OpenAI-compatible server) or `OLLAMA_BASE_URL` (`02-different-ai-providers.md`; `packages/shared/inference.ts` has only `OpenAIInferenceClient` and `OllamaInferenceClient`). No `claude -p` / `codex` / `grok` backend. Prompt can be extended in the AI Settings page; `INFERENCE_ENABLE_AUTO_TAGGING` can be turned off.
4. **Storage and UI:** SQLite plus asset files, Meilisearch for search; web app, iOS, Android, Chrome/Firefox/Safari extensions, lists, rules, full-text and semantic search.
5. **Health:** commits within hours of 2026-11-03; releases v0.34.1 (2026-10-22), v0.34.0 (2026-10-17), v0.33.2 (2026-08-11); the newest issues have 1 to 2 comments within a day. 727 open issues and PRs combined (API count). AGPL-3.0 matters only if Omer redistributes a modified server.
6. **Fit:** best UI and ops story for one person on NixOS.

**Nixpkgs and NixOS.** `pkgs/by-name/ka/karakeep/package.nix` exists, version 0.34.0 (upstream is 0.34.1; last bump 2026-10-18, `gh api repos/NixOS/nixpkgs/commits?path=pkgs/by-name/ka/karakeep`). `nixos/modules/services/web-apps/karakeep.nix` exists with options `enable`, `environmentFile`, `browser.enable` (headless Chromium), `meilisearch.enable` (read from the file via `gh api`; I did not evaluate the module). The CLI is part of the same package (`helpers/karakeep`). Secrets such as `OPENAI_API_KEY` go in `environmentFile`.

**Import API and CLI for a custom fetcher.** REST API with Bearer key, documented under `docs/docs/api/`: create bookmark, attach tags, attach asset, create list, list/search bookmarks. The create-bookmark schema has `type` (link or text), `url`, `text`, `title`, `note`, `summary`, `sourceUrl`, `createdAt`, `archived`, `favourited`, `tags` (each with `attachedBy` of `ai` or `human`), `importSessionId`, `precrawledArchiveId`, `crawlPriority`. A duplicate URL returns the existing bookmark. The CLI (`@karakeep/cli`, commands `bookmarks add`, `lists`, `tags`, `--json`) wraps the same API. So a fetcher can push Reddit/X items as `text` bookmarks with the rendered post, top comments, original date, and `sourceUrl`, attach media as assets, and either let Karakeep tag them or attach its own tags as `ai`. Not verified by a run: whether text bookmarks get auto-tagged as well as link bookmarks, and open issues #3289 and #3291 (2026-11-03) show text-bookmark summarization is being fixed right now.

### sidoshi/karakeep-sync (MIT, 147 stars, pushed 2026-04-21)
Evidence: README, `crates/sync/src/plugin/reddit_saves.rs`, releases 0.2.0 (2026-04-21).
1. **Data:** Reddit script app with client id, secret, refresh token (scope `history`) and username; Hacker News cookie, GitHub token, Pinboard token. X is "planned". Reddit saves go to a list `Reddit Saved`. Each save becomes a Karakeep bookmark with only `title` and `url` (`created_at: None`, no body, no comments, no media of its own). It pages the live saved list, so the 1000-item limit stays.
2. As above, Karakeep's crawler then tries the Reddit URL, which issue #2885 says gets blocked.
3. LLM: whatever Karakeep uses.
4. Rust, Docker image, cron schedule per source.
5. Health: 3 open issues, 0 comments on each; last commit "fix ci" 2026-04-21; the author is the only committer in the last 5.
6. **Fit:** a working reference for the Reddit refresh-token flow and the Karakeep client, not a solution.

### viperrcrypto/Siftly (MIT, 3085 stars, pushed 2026-04-08)
Evidence: README, `lib/claude-cli.ts`, `lib/codex-cli.ts`, `lib/x-sync.ts`, `lib/twitter-api.ts`, issues, PR list.
1. **Data:** X only. Bookmarklet or console script that auto-scrolls and downloads `bookmarks.json`, then upload. `lib/x-sync.ts` also syncs live using `auth_token` + `ct0` cookies against X's internal bookmark GraphQL, with `MAX_PAGES = 50`. Dedup on re-import. No Reddit.
2. **Media:** media proxy/download and ZIP export; vision analysis of images; OCR text feeds search. No threads.
3. **LLM:** Anthropic key, OpenAI, MiniMax, or local CLIs: `claude -p --output-format json` and `codex exec --output-last-message` via `execFile`. The README says zero-config Claude CLI auth works on macOS keychain; the code also reads `~/.claude/.credentials.json` on Linux, but the README tells Linux users to add an API key (I did not run it).
4. Next.js + Prisma + SQLite + FTS5; web UI with grid/list, categories, mindmap, Obsidian export, CSV/JSON/ZIP export.
5. Health: last 15 commits on 2026-04-08, nothing since. 5 open PRs from 2026-07 to 2026-10 (including an X API fix #92/#93 for "400" on live import) have no comments and are not merged. Releases v0.3.0 (2026-04-08), v0.2.0, v1.0.1 (odd tag order).
6. **Fit:** the most complete X-side UI, and the local-CLI tagging code is worth copying. It looks unmaintained since April.

### alexknowshtml/smaug (MIT, 950 stars, pushed 2026-02-03)
Evidence: README, issues, PR list.
1. **Data:** X only, through the `bird` CLI with `auth_token` and `ct0` cookies; `--all` paginates (needs bird from git); bookmark folders fetched one by one; optional likes.
2. Expands links: GitHub repos (API), articles, X long-form articles, quote tweets and reply threads. Media is "experimental" (`includeMedia`, default false).
3. LLM: Claude Code (default) or OpenCode, invoked as an agent per batch (`claudeModel`, `claudeTimeout`); README warns about token cost on big backlogs.
4. Markdown files by date, repos and articles filed under `knowledge/`; no UI.
5. Health: last commit 2026-02-03; PRs #30 and #31 open since March; #32 to #35 closed (2026-03 to 2026-09); 4 open issues.
6. **Fit:** a good model for "agent reads the bookmark and its links, writes markdown", but no web UI and no Reddit.

### joemccann/x-bookmarks-pipeline (MIT, 92 stars, pushed 2026-08-27)
Evidence: README, commits (last code commit 2026-03-19; 2026-08-27 is a docs commit), languages (`{"Rust":359324}`).
1. **Data:** official X API with OAuth 2.0 and an auto-consent step over Chrome DevTools; inherits the 800 cap and the stale "$100/month Basic" statement.
2. Extracts structured data from chart images; no threads.
3. LLM: Cerebras, xAI, Claude, OpenAI by API key. Per-bookmark cost report.
4. SQLite cache, `.meta.json` and `.pine` output files; no UI; email notices.
5. 0 open issues, no releases. The GitHub description says "Python pipeline" while the code and README are Rust.
6. **Fit:** it turns bookmarks into trading strategies (Pine Script). Ignore.

### Gitmaxd/field-theory-ui (MIT, 25 stars, pushed 2026-04-12) and afar1/fieldtheory-cli (MIT, 2055 stars, pushed 2026-09-05)
Evidence: both READMEs, `src/engine.ts`, `src/graphql-bookmarks.ts`, issues and PRs of `afar1/fieldtheory-cli`.
1. **Data:** `ft sync` reads the X session cookies from a Chrome-family browser or Firefox (Linux supported per the README table), calls internal GraphQL, resumes with `--continue`, can mirror bookmark folders (`--folders`), backfill quoted tweets and X Articles and linked articles (`--gaps`), or sync via OAuth API (`ft sync --api`). `--cookies <ct0> <auth_token>` is the manual fallback. No Reddit (an Instagram Saved PR #186 is open).
2. **Media:** photos, video posters, capped videos downloaded by default; linked articles enriched; quoted posts. No thread crawl.
3. **LLM:** `ft classify` calls local `claude` or `codex` binaries via `spawn` (`src/engine.ts`, preference order claude then codex). PR #190 (opencode engine, concurrent classify) is open. field-theory-ui chat works with Claude Code CLI, Codex CLI, or API keys.
4. **Storage and UI:** `~/.fieldtheory/bookmarks/bookmarks.jsonl` (raw), `bookmarks.db` (SQLite FTS5), markdown export (`ft md`, `ft wiki`). The CLI is terminal-only; field-theory-ui adds a local web UI (Stream, People, Chronos, Forge, Chat) over that database; a PR for `ft web` (#189) is open. The Mac app is AGPL-3.0 and separate.
5. **Health:** fieldtheory-cli had 36 commits in April, 11 in May, 11 in June, 2 in September (last 60 commits); PRs #190 to #196 from 2026-09 and 2026-10 are open and unmerged; 46 open issues and PRs. field-theory-ui is a single "Initial release" commit with 0 issues.
6. **Fit:** the best X ingestion to borrow from; the data model (JSONL raw cache + SQLite index) is easy to extend with Reddit rows.

### sytelus/xarchive (MIT, 120 stars, pushed 2026-09-05)
Evidence: README, issues #1 to #6.
1. **Data:** Chrome MV3 extension using X's internal GraphQL with the credentials the page already holds (no cookie extraction, no API key); paginated 100 per page with a 2.5 to 3.75 s delay; "no application-imposed bookmark cap"; includes Premium bookmark folders; incremental "quick" and "full" updates; cumulative archive in the browser; JSON download.
2. Media URLs and quoted tweets are in the JSON; media files are not downloaded.
3. LLM: none.
4. IndexedDB plus JSON export; built-in dark viewer; issue #6 asks for a searchable library view.
5. Health: commits July to September 2026, 6 open issues (one has a comment), no GitHub releases.
6. **Fit:** the safest way to get a full X export without the 800 cap and without touching cookies; output JSON can feed a custom importer. Issues #1 and #3 show X-side breakage happens.

### rhnfzl/reddit-stash (MIT, 133 stars, pushed 2026-10-29)
Evidence: README (sections "Overcome Reddit's Limitations", "GDPR-Only Mode", "Media"), issue/PR list, commit dates.
1. **Data:** PRAW-style OAuth script app (client id, secret, username, password; 2FA as `password:code`) for saved, posted, upvoted items; optional GDPR CSV. With API credentials it fetches full content for each CSV entry; in CSV-only mode it writes markdown with links and fills titles and bodies from Arctic Shift and PullPush archives when available. **This is the only candidate that goes past the 1000-item limit.** The README's November 2025 note says new apps need Reddit approval; GDPR-only mode needs no credentials.
2. **Media and comments:** downloads images, videos, galleries (Imgur API option), claims about 80 percent success; saved comments are kept as `SAVED_COMMENT_*.md` with context; no full comment-thread tree for saved posts (not confirmed from the README, which says "comments with context" only in the repo description).
3. LLM: none.
4. Markdown per item by subreddit, `file_log.json` for dedup, optional Dropbox/S3, GitHub Actions or Docker; no UI.
5. Health: 100 recent commits over Feb, Jul, Oct 2026; the maintainer commits steadily; 3 items listed on 2026-10-28/29 with 0 comments (look like maintainer PRs); 0 open per repo count.
6. **Fit:** best Reddit fetcher to borrow from (CSV merge, media, markdown layout).

### akashpandey/Reddit-Fetch (GPL-3.0, 221 stars, pushed 2026-10-30)
Evidence: README, issues, commit dates.
1. **Data:** Reddit OAuth with a stored refresh token (`tokens.json`), local callback on `localhost:8080`, Docker and SSH-tunnel notes; explicitly tells you to request Responsible Builder Policy approval and lets you copy a working `tokens.json` from another install. Live list only, so the 1000 limit applies.
2. No media files, no comment threads in the README.
3. LLM: none. Output `saved_posts.json` and `saved_posts.html`.
4. Health: 100 recent commits spread Feb 2025 to Oct 2026 (2 in November/December 2025, 3 in May, 1 each in August and October 2026); closed issues #7 and #8 are about app creation and client id. GPL-3.0.
5. **Fit:** useful for the approval wording and refresh-token reuse; little else.

### erohtar/redditSaver (GPL-3.0, 101 stars, pushed 2026-07-17)
Evidence: README, commits (2023-06-12, then 2026-07-17 "Use Reddit's OAuth API instead of the private RSS feed").
1. **Data:** script app with the OAuth password grant (plaintext password in `settings.json`); fetches only the last 25 saved items by default (`limit=25`, own choice; the README says the API pages to about 1000).
2. Markdown with YAML frontmatter, subreddit folders, score and awards; no media.
3. No LLM. Obsidian Dataview table as the "UI".
4. Health: three years between commits, revived once in July 2026.
5. **Fit:** ignore.

### Extra searches (`gh search repos`, `gh search code`, 2026-11-03)
Queries: "reddit twitter bookmarks" sorted by updated, "reddit twitter saved" updated after 2026-01-01, "reddit saved" "twitter bookmarks" by stars, `reddit-saved twitter-bookmarks`, and two code searches. All hits are tiny (at most 8 stars) and none has a web UI plus LLM tagging for both:

- `SidSethi/bookmark-ingestion` (0 stars, no license, pushed 2026-07-10): X via Field Theory data, Reddit from browser-capture JSONL, writes Obsidian markdown; says AI enrichment and Reddit media are out of scope. Confirms the same "fieldtheory + own Reddit capture" design Omer is considering.
- `sankabuilds/xer` (1 star, MIT, Rust): downloads media from X and Instagram bookmarks with a cookie file; Reddit "pending".
- `shiyue1250/nuttle` (1 star, MIT): browser extension that records Reddit comment trees and X posts while you browse, with a local MCP server; it captures what you view, not your saved list.
- `hermiod99-vibe/Agent-Social-Reader` (6 stars, MIT): agent skill that saves a pasted link as a summary to Notion or Obsidian; per-link, not a saved-list sync.
- `smurphy8/bookmarks`, `jayteealao/Crumb` (Android app), `slmingol/chrome-tabs-to-pinboard`: not relevant on inspection (not read in detail).

## Recommendation

**Adopt (as the store, UI and tagging engine): Karakeep.**
It is the only candidate with a real reading UI, search, API, CLI, tag model, NixOS module and a live maintainer. Write a small own fetcher that pushes `text` bookmarks with the full rendered content. Do not rely on Karakeep's crawler for Reddit or X. Tagging options, because Karakeep cannot call `claude -p`: (a) point `OPENAI_BASE_URL` at Ollama or a hosted OpenAI-compatible endpoint, (b) turn off `INFERENCE_ENABLE_AUTO_TAGGING` and have the fetcher attach tags with `attachedBy: ai` after running `claude -p` or `codex exec` itself, or (c) run a small OpenAI-compatible shim in front of a CLI (custom code; not evaluated). Check text-bookmark tagging with one real item before committing, because that was not run.

**Borrow from:**
1. `afar1/fieldtheory-cli` for X: cookie-based GraphQL sync, folders, media, JSONL record shape, `claude`/`codex` spawn engine. MIT.
2. `rhnfzl/reddit-stash` for Reddit: GDPR CSV merge (the only way past the 1000 limit), Arctic Shift/PullPush fallback, media download, markdown layout. MIT.
3. `sytelus/xarchive` if Omer prefers a browser-extension export over cookie extraction, and for an uncapped full X export.
4. `viperrcrypto/Siftly` for the local-CLI tagging code (`lib/claude-cli.ts`, `lib/codex-cli.ts`) and the FTS5 search ideas, if he decides to build his own UI instead. Unmaintained since April 2026.
5. `sidoshi/karakeep-sync` for the Reddit refresh-token flow and a typed Karakeep client in Rust.

**Alternative if Karakeep's text-bookmark handling disappoints:** build the minimum himself: fetchers from items 1 and 2, SQLite + FTS5, `claude -p` tagging as in Siftly, and Siftly's or field-theory-ui's UI as the visual reference. This is more code to keep up.

**Ignore:** `joemccann/x-bookmarks-pipeline` (trading focus, paid-tier assumptions), `Gitmaxd/field-theory-ui` (one commit; wait for `ft web`, PR #189), `alexknowshtml/smaug` (no UI, stale since February), `akashpandey/Reddit-Fetch` and `erohtar/redditSaver` (live listing only, GPL, JSON/HTML or 25 items), `sankabuilds/xer`, `nuttle`, `Agent-Social-Reader`.

## Open points and what I did not verify
- Whether Omer can still create a Reddit script app (needs his login). If not, the GDPR export plus Arctic Shift route from reddit-stash is the fallback.
- Whether Reddit's cookie-authenticated `.json` listing still works for saved items; not tested.
- Karakeep text-bookmark auto-tagging and the NixOS module option names; read from source only, not evaluated or run.
- Siftly's Linux Claude CLI path; code read only.
- Third-party blog claims on Reddit approval rates are unconfirmed; Reddit's policy page returned 403 to WebFetch.
