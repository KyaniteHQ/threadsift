# Decisions and evidence

`docs/spec.md` states what the app does. This page holds the reasons behind its product decisions and the measured or sourced facts that the spec leaves out. A fact here has the command, address or source that shows it; a fact no run has proven is in `docs/architecture/open-items-and-unverified-claims.md`.

## Product decisions

- **Name.** The repository is named to match. Threadsift was picked from 26 checked names for free `.app` and `.dev` domains and no app or real repository of the same name. The masthead wordmark, which the design draws as "Library", reads Threadsift. Words inside the app (Item, Reader, Highlights page and the rest) and the Style named Library stay as `GLOSSARY.md` and the design define them.
- **Licence.** AGPL-3.0-only, so a rival hosted copy must publish its changes. The contributor licence agreement (CLA) applies to outside contributions. Contributors keep copyright in their contributions and grant Kyanite Labs a perpetual, irrevocable, non-exclusive licence that includes the right to sublicense. This lets Kyanite Labs license contributions under other terms (section 2 of `CLA.md`).
- **Build or adopt.** The app is its own. Karakeep, Linkwarden, Shiori and Raindrop were rejected as the base. `docs/research/prior-art.md` compares Karakeep with other projects and does not name the other three.
- **A public address.** The app needs a public HTTPS address so that Grok Bot can reach it, because Grok Bot's MCP connections run on Cursor's servers (Grok Bot's own answer).
- **Ownership of Tags.** Only the agent sets Tags, so the UI has no Tag editing, and Proposals keep the lists clean over time.
- **One Provider.** The owner picks one Provider in settings. The Threadsift bot ships as a public Grok Bot template, with its skill files in this repository so the bot stays in step with the API, and one short profile because a template has one profile field. The bot's rules live in its skill.
- **Obsidian.** The mirror is one-way, as Readwise's Obsidian sync is: the owner reads in Obsidian and edits Highlights and Notes in Threadsift. Vault repositories on other Git hosts are not in the first release (`docs/spec.md`).
- **Design of new screens.** Every screen the first design lacks is built from `design/system/` to match the existing screens. The building agent checks each from screenshots in every theme before it lands, and decides the approval. No Claude Design round.
- **README.** The README sells the project. An agent drafts its prose and the building agent approves it.
- **One codebase.** EdgeEver and Open Managed Agents already ship one app on both targets.
- **Token budget default.** A new token starts at 200 Items a day. This is the maintainer's choice, not a measured value.

## Design review

Impeccable Reviews is a GitHub App in closed beta. Hosted pull request reviews do not run without per-PR previews, so the building agent checks screenshots in every theme before landing (`docs/agents/reviewing-code.md`).

When it runs, Impeccable posts one review comment with its findings and screenshots, writes no summary into the PR body, and its GitHub check fails on a P1 finding or worse. It judges against a design profile scanned from `design/`, with the prototype's own tool panels (`.tool`, `.tw`) excluded; against ten rules, six quoted from `docs/spec.md`, Design (token-only values, contrast, the 12px floor, 44px targets under 480px, the open-row bar, reduced motion) and four the app suggested from `design/system/` and the owner kept (the app root never scrolls, the 1px and 2px literals `tokens.css` allows, the unread dot on the first metadata line, the reading width set by Text width); and through four personas, one of them on a phone. Drafts are not reviewed.

Impeccable's live address is the live copy, `https://threadsift-live.<subdomain>.workers.dev`, so a review's before comes from `main`. The live copy has its own demo password, so Impeccable signs in there with a saved browser session made through the real login. The saved session expires on 2026-12-06 and needs a new one before then. No review has shown a before yet, because each review rendered only the pull request copy.

## Reddit

Reddit blocks anonymous `.json` (HTTP 403), does not take new API access requests, and its app-registration page says "Remaining public API access will end in March 2027". Its User Agreement forbids scraping without written consent, and its Developer Terms forbid paid use of Reddit data without an agreement. A tab the owner opened by hand sends no server traffic to Reddit, and the archive fill sends none either; only a connected account makes the owner's own server request threads from reddit.com, with the owner's own session. Readeck's add-on works the same way and still works, while tools that fetch Reddit from a server (Linkwarden, Karakeep) are blocked.

Measurements behind the Reddit fetch:

- On a 671-comment thread in the owner's browser, the page held 100 comment elements, and the `.json` returned 465 comments plus 199 behind `more` stubs.
- `/api/morechildren` answered 403 even to a signed-in session, so the fill uses permalinks (`/comments/<post>/_/<comment id>.json?limit=500&raw_json=1`).
- On a 677-comment thread the first `.json` gave 464 comments and 34 stubs, and 67 permalink requests, all HTTP 200, brought it to 659 in 51 s (a throwaway account from a home address).
- Arctic Shift returned 661 comments with no `more` stubs for the 671-comment thread in 1.4 s, with no key, from a home address and from a Worker. 24 of the 661 were marked deleted later and are dropped.
- With the owner's account, the container's platform `fetch` got HTTP 200 from a home and a datacenter address. On Cloudflare, the Workers `fetch` got 403 for the thread's `.json` even with the cookie, while a raw TLS socket from the same Worker got HTTP 200 with 464 comments in 3 of 3 runs, so the Worker sends these requests over a socket.
- Reddit's `me.json` answered 403 with its network-security page for an altered session and 200 for a valid one, so one 403 does not expire the session. The rule that does is in `docs/architecture/fetchers.md`, Reddit.
- A `reddit.com/r/<community>/s/<code>` share link needs one redirect, which Reddit answers without a login (`docs/architecture/fetchers.md`).

## AI providers

The owner chose `claude-sonnet-5-5` at medium for Claude Code and `gpt-6.2-sol` at medium for Codex. The comparison ran Digests on 20 Items from the owner's library on 2026-11-18 with `tools/provider-comparison.ts` at revisions `fd4eee8` and `d43acd8`. The records stay outside the repository.

| Provider | Model | Effort | Digests | Median call | Longest call |
|---|---|---|---:|---:|---:|
| Claude Code | `claude-sonnet-5-5` | Medium | 20/20 | 5.6 s | 9.1 s |
| Claude Code | `claude-sonnet-5-5` | High | 20/20 | 7.1 s | 20.0 s |
| Claude Code | `claude-sonnet-5-5` | CLI default | 20/20 | 5.5 s | 8.6 s |
| Claude Code | `claude-haiku-5-5` | CLI default | 20/20 | 10.3 s | 22.3 s |
| Codex | `gpt-6.2-sol` | Medium | 20/20 | 15.3 s | 26.1 s |
| Codex | `gpt-6.2-sol` | CLI default (low) | 20/20 | 13.9 s | 22.6 s |

Workers AI bills by use. The free OpenRouter rows returned 6 Digests across 120 attempts in the comparison. Grok Bot has no model field. These Providers have no recommendation.

- The Providers Anthropic, OpenAI and xAI have no successful live run until the owner supplies a key; only their refusal of a wrong key was run against the vendors. OpenRouter ran a real Verify on the container with a free model.
- OpenRouter turns a new key on some seconds after it makes it (up to 17.2 s in 16 runs), so Connect saves the key and then checks once a second for up to 45 s.
- Anthropic allows "an end user… signing in to the unmodified Claude Code binary with their own Claude subscription" and forbids a third party from offering "Claude.ai login" or routing plan credentials for its users (`code.claude.com/docs/en/legal-and-compliance`). So the hosted product never offers a Claude plan login. Plan limits are small for an Import, so the Import screen suggests an API key when a plan Provider is picked.

## Grok Bot

Grok Bot's capabilities in `docs/spec.md`, Grok Bot, come from the owner's Grok Bot, which marked each answer as checked or inferred. The extra time an X link takes through the webhook, seconds to tens of seconds, is the bot's own estimate and is not measured.

## The hosted product

Comparable hosted services cost $3 to $13 a month (Karakeep $4, Linkwarden $3, Readwise Reader $7.99, mymind $7.99 to $12.99, from their pricing pages). Threadsift's price is not decided. The rules that bind the hosted product are in `docs/spec.md`, Hosted product.

## The library wiki

The wiki follows the LLM wiki idea (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent builds the synthesis once, when an Item arrives, and keeps it current. The rules in `docs/spec.md`, The library wiki, answer the known failures of LLM wikis, from the gist's comments:

- A wrong merge becoming a permanent error: overviews cite their Items, and changes go through Proposals.
- Human corrections lost to regeneration: Pins.
- Near-duplicate pages from parallel updates: overview revisions are accepted only while the Topic's inputs are still the ones the run read, with a second run refused and queued again, and Grok Bot starts one overview task per Topic at a time.
