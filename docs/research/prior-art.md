# Prior art: archive Reddit saved + X bookmarks, tag with an LLM, read in a web UI

Researched 2026-11-03 with `gh api`, README greps, source reads (read-only; nothing cloned into the workspace). Star counts and push dates are from `gh api repos/<o>/<r>` on 2026-11-03.

## Bottom line

No single project does Reddit saved + X bookmarks + LLM tags + web UI. Two things come close:

- Karakeep gives the web UI, REST API, CLI, tagging (OpenAI-compatible or Ollama only) and search. Its own crawler is weak on Reddit and X.
- `afar1/fieldtheory-cli` (X) and `rhnfzl/reddit-stash` (Reddit) are the best fetchers.

This research recommended adopting Karakeep as the store and UI. `docs/spec.md` (Build or adopt) chose an own app instead, so its Recommendation and its open points about Karakeep, Siftly and a Reddit script app are moot; `docs/spec.md` (Ingest flow, "Why Reddit works this way") records how Reddit access was settled.

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
- **Reddit API access.** Reddit's saved list shows only the latest 1000 items (`reddit-stash` README, "Overcome Reddit's Limitations"). Since November 2025 new API apps need Reddit's pre-approval (`reddit-stash` README line 11; `Reddit-Fetch` README lines 30 to 65, and its closed issue #7 "Cannot Create Reddit API App"). Third-party blogs say personal scripts are often rejected (WebSearch 2026-11-03, sources sell alternatives, so treat as unconfirmed; I could not open Reddit's own policy page, it returned 403). Existing app credentials and refresh tokens keep working.
- **Reddit GDPR export.** https://www.reddit.com/settings/data-request gives `saved_posts.csv` and `saved_comments.csv`. Only `reddit-stash` uses it (details below). The 1000-item limit applies to the live listing, so the export is the only route in this list to older saves.
- **Reddit cookie or `.json` route.** None of the candidates uses it. I did not test it.

## Per candidate

### karakeep-app/karakeep (AGPL-3.0, 30264 stars, pushed 2026-11-02)
Evidence: `gh api repos/karakeep-app/karakeep`, commits, releases, docs under `docs/docs/` in the repo.
1. **Data:** it is not a fetcher. It crawls URLs you give it, takes a Netscape HTML, Pocket CSV, Omnivore JSON, or one-link-per-line CLI import (`docs/docs/04-using-karakeep/import.md`). Reddit and X crawling is weak: open issues #2885 "Reddit crawling is now getting blocked", #1883, #739 (Reddit full page archiving), #1331 "Twitter (x.com) doesnt download media", #1468 (save X thread), #2651 (X crawler extracts unrelated reply content).
2. **Media, pages, threads:** link bookmarks keep screenshot (default on), optional PDF, optional full-page archive (monolith), optional yt-dlp video (`CRAWLER_*` variables in `01-environment-variables.md`). No comment-thread model; a thread would have to be flattened to text.
3. **LLM:** `OPENAI_API_KEY` (+ `OPENAI_BASE_URL` for any OpenAI-compatible server) or `OLLAMA_BASE_URL` (`02-different-ai-providers.md`; `packages/shared/inference.ts` has only `OpenAIInferenceClient` and `OllamaInferenceClient`). No `claude -p` / `codex` / `grok` backend. Prompt can be extended in the AI Settings page; `INFERENCE_ENABLE_AUTO_TAGGING` can be turned off.
4. **Storage and UI:** SQLite plus asset files, Meilisearch for search; web app, iOS, Android, Chrome/Firefox/Safari extensions, lists, rules, full-text and semantic search.

### sidoshi/karakeep-sync (MIT, 147 stars, pushed 2026-04-21)
Evidence: README, `crates/sync/src/plugin/reddit_saves.rs`, releases 0.2.0 (2026-04-21).
1. **Data:** Reddit script app with client id, secret, refresh token (scope `history`) and username; Hacker News cookie, GitHub token, Pinboard token. X is "planned". Reddit saves go to a list `Reddit Saved`. Each save becomes a Karakeep bookmark with only `title` and `url` (`created_at: None`, no body, no comments, no media of its own). It pages the live saved list, so the 1000-item limit stays.
2. As above, Karakeep's crawler then tries the Reddit URL, which issue #2885 says gets blocked.
3. LLM: whatever Karakeep uses.
4. Rust, Docker image, cron schedule per source.

### viperrcrypto/Siftly (MIT, 3085 stars, pushed 2026-04-08)
Evidence: README, `lib/claude-cli.ts`, `lib/codex-cli.ts`, `lib/x-sync.ts`, `lib/twitter-api.ts`, issues, PR list.
1. **Data:** X only. Bookmarklet or console script that auto-scrolls and downloads `bookmarks.json`, then upload. `lib/x-sync.ts` also syncs live using `auth_token` + `ct0` cookies against X's internal bookmark GraphQL, with `MAX_PAGES = 50`. Dedup on re-import. No Reddit.
2. **Media:** media proxy/download and ZIP export; vision analysis of images; OCR text feeds search. No threads.
3. **LLM:** Anthropic key, OpenAI, MiniMax, or local CLIs: `claude -p --output-format json` and `codex exec --output-last-message` via `execFile`. The README says zero-config Claude CLI auth works on macOS keychain; the code also reads `~/.claude/.credentials.json` on Linux, but the README tells Linux users to add an API key (I did not run it).
4. Next.js + Prisma + SQLite + FTS5; web UI with grid/list, categories, mindmap, Obsidian export, CSV/JSON/ZIP export.

### alexknowshtml/smaug (MIT, 950 stars, pushed 2026-02-03)
Evidence: README, issues, PR list.
1. **Data:** X only, through the `bird` CLI with `auth_token` and `ct0` cookies; `--all` paginates (needs bird from git); bookmark folders fetched one by one; optional likes.
2. Expands links: GitHub repos (API), articles, X long-form articles, quote tweets and reply threads. Media is "experimental" (`includeMedia`, default false).
3. LLM: Claude Code (default) or OpenCode, invoked as an agent per batch (`claudeModel`, `claudeTimeout`); README warns about token cost on big backlogs.
4. Markdown files by date, repos and articles filed under `knowledge/`; no UI.

### joemccann/x-bookmarks-pipeline (MIT, 92 stars, pushed 2026-08-27)
Evidence: README, commits (last code commit 2026-03-19; 2026-08-27 is a docs commit), languages (`{"Rust":359324}`).
1. **Data:** official X API with OAuth 2.0 and an auto-consent step over Chrome DevTools; inherits the 800 cap and the stale "$100/month Basic" statement.
2. Extracts structured data from chart images; no threads.
3. LLM: Cerebras, xAI, Claude, OpenAI by API key. Per-bookmark cost report.
4. SQLite cache, `.meta.json` and `.pine` output files; no UI; email notices.
5. 0 open issues, no releases. The GitHub description says "Python pipeline" while the code and README are Rust.

### Gitmaxd/field-theory-ui (MIT, 25 stars, pushed 2026-04-12) and afar1/fieldtheory-cli (MIT, 2055 stars, pushed 2026-09-05)
Evidence: both READMEs, `src/engine.ts`, `src/graphql-bookmarks.ts`, issues and PRs of `afar1/fieldtheory-cli`.
1. **Data:** `ft sync` reads the X session cookies from a Chrome-family browser or Firefox (Linux supported per the README table), calls internal GraphQL, resumes with `--continue`, can mirror bookmark folders (`--folders`), backfill quoted tweets and X Articles and linked articles (`--gaps`), or sync via OAuth API (`ft sync --api`). `--cookies <ct0> <auth_token>` is the manual fallback. No Reddit (an Instagram Saved PR #186 is open).
2. **Media:** photos, video posters, capped videos downloaded by default; linked articles enriched; quoted posts. No thread crawl.
3. **LLM:** `ft classify` calls local `claude` or `codex` binaries via `spawn` (`src/engine.ts`, preference order claude then codex). PR #190 (opencode engine, concurrent classify) is open. field-theory-ui chat works with Claude Code CLI, Codex CLI, or API keys.
4. **Storage and UI:** `~/.fieldtheory/bookmarks/bookmarks.jsonl` (raw), `bookmarks.db` (SQLite FTS5), markdown export (`ft md`, `ft wiki`). The CLI is terminal-only; field-theory-ui adds a local web UI (Stream, People, Chronos, Forge, Chat) over that database; a PR for `ft web` (#189) is open. The Mac app is AGPL-3.0 and separate.

### sytelus/xarchive (MIT, 120 stars, pushed 2026-09-05)
Evidence: README, issues #1 to #6.
1. **Data:** Chrome MV3 extension using X's internal GraphQL with the credentials the page already holds (no cookie extraction, no API key); paginated 100 per page with a 2.5 to 3.75 s delay; "no application-imposed bookmark cap"; includes Premium bookmark folders; incremental "quick" and "full" updates; cumulative archive in the browser; JSON download.
2. Media URLs and quoted tweets are in the JSON; media files are not downloaded.
3. LLM: none.
4. IndexedDB plus JSON export; built-in dark viewer; issue #6 asks for a searchable library view.

### rhnfzl/reddit-stash (MIT, 133 stars, pushed 2026-10-29)
Evidence: README (sections "Overcome Reddit's Limitations", "GDPR-Only Mode", "Media"), issue/PR list, commit dates.
1. **Data:** PRAW-style OAuth script app (client id, secret, username, password; 2FA as `password:code`) for saved, posted, upvoted items; optional GDPR CSV. With API credentials it fetches full content for each CSV entry; in CSV-only mode it writes markdown with links and fills titles and bodies from Arctic Shift and PullPush archives when available. **This is the only candidate that goes past the 1000-item limit.** The README's November 2025 note says new apps need Reddit approval; GDPR-only mode needs no credentials.
2. **Media and comments:** downloads images, videos, galleries (Imgur API option), claims about 80 percent success; saved comments are kept as `SAVED_COMMENT_*.md` with context; no full comment-thread tree for saved posts (not confirmed from the README, which says "comments with context" only in the repo description).
3. LLM: none.
4. Markdown per item by subreddit, `file_log.json` for dedup, optional Dropbox/S3, GitHub Actions or Docker; no UI.

### akashpandey/Reddit-Fetch (GPL-3.0, 221 stars, pushed 2026-10-30)
Evidence: README, issues, commit dates.
1. **Data:** Reddit OAuth with a stored refresh token (`tokens.json`), local callback on `localhost:8080`, Docker and SSH-tunnel notes; explicitly tells you to request Responsible Builder Policy approval and lets you copy a working `tokens.json` from another install. Live list only, so the 1000 limit applies.
2. No media files, no comment threads in the README.
3. LLM: none. Output `saved_posts.json` and `saved_posts.html`.

### erohtar/redditSaver (GPL-3.0, 101 stars, pushed 2026-07-17)
Evidence: README, commits (2023-06-12, then 2026-07-17 "Use Reddit's OAuth API instead of the private RSS feed").
1. **Data:** script app with the OAuth password grant (plaintext password in `settings.json`); fetches only the last 25 saved items by default (`limit=25`, own choice; the README says the API pages to about 1000).
2. Markdown with YAML frontmatter, subreddit folders, score and awards; no media.
3. No LLM. Obsidian Dataview table as the "UI".
