# AGENTS.md

This repo holds Threadsift, a reading library: paste a link, an agent keeps the useful parts and grows a small wiki of the library, read everything on one page. v1 is not released. The app runs on two install targets, a container and Cloudflare.

## Domain language: read before naming anything

@GLOSSARY.md

Use these exact terms in code, docs and issues.

## Where things live

| Need | Read |
|---|---|
| What v1 does today, one bullet per behaviour; a code change edits its bullets | `docs/spec.md` |
| The route rules, and the reasons and measurements behind the product decisions | `docs/architecture/http-interfaces.md`, `docs/architecture/decisions-and-evidence.md` |
| What is not fully built yet, and the file of each architecture section | `docs/architecture.md`, the index |
| The tech stack | `docs/architecture/the-stack-at-a-glance.md` |
| The module seams and the two install targets | `docs/architecture/one-codebase-two-install-targets.md` |
| Where files go, and why; the tree under `src` (`src/core`, `src/features`, `src/http`), its import order and entries | `docs/architecture/repository-layout.md` |
| The data model | `docs/architecture/data-model-outline.md` |
| The testing approach | `docs/architecture/testing.md` |
| Topic pages, the Index, Related Items, and the Log | `docs/wiki.md` |
| The weekly Proposals, the Proposals page, Accept, Reject and Pins | `docs/proposals.md` |
| Before writing, changing or deleting a test | `docs/testing.md` |
| Before changing a workflow, the gate, the live deploy or the live check | `docs/architecture/ci-releases-and-rollback.md` |
| Before writing or changing code, config or scripts: official docs first, module design, no comments, state, repeated writes and deadlines, the finish checks | `docs/agents/changing-code.md`; the `implementer` agent (`.claude/agents/implementer.md`) runs it |
| Before writing any text a user reads in the product (labels, messages, empty states) | `docs/agents/changing-code.md`, Interface text |
| Before writing or changing a doc, the README, a commit message or a PR body | `docs/agents/changing-code.md`, Docs, commit messages and PR bodies |
| Before screen work: who the product is for, then the look, the components and the do's and don'ts every screen follows | `PRODUCT.md`, then `DESIGN.md` |
| Before reviewing a change | `docs/agents/reviewing-code.md` |
| Any colour, size, spacing, font or setting value | `design/system/tokens.css`, the one source for every value; `design/system/settings-table.ts` owns each setting's id, label, attribute and default |
| How a screen behaves (reader bar fitting, comment folds, reading place) | `design/prototype/`, served as its `README.md` (Viewing) shows; the masthead, the Look panel and the Instance menu follow `DESIGN.md` |
| Style blocks (the 10 Styles) | `design/system/tokens.css`; `docs/design/styles.md` names the faces and visual references |
| Why a design choice was made | `docs/design/brand-direction.md` for the brand, `docs/design/claude-design-prompts.md` and `docs/design/reviews/round-7/` |

## Testing

`docs/testing.md` overrides broader testing instructions for this repo.

## Issues

Work is tracked in GitHub issues on `kyanitehq/threadsift` (use `gh`). The `ready-for-agent` label marks an issue an agent can pick up as written.

## Spending

Workers AI bills the owner's Cloudflare account by use. Do not call Workers AI from a test, a smoke or live check, a comparison run (`tools/provider-comparison.ts`; Compare Providers in `docs/guides/providers.md`) or an Instance, the owner's included. Never save it as an Instance's Provider. In a comparison run leave `CLOUDFLARE_WORKERS_AI_TOKEN` unset, so its Workers AI row records `workers-ai-credentials-missing`.

The X API bills the owner's X developer account by use. Do not call the X API from a test, a smoke or live check, the gate or a comparison run. The `x-api:probe` task calls it, by hand, with a cap ([CI, releases and rollback](docs/architecture/ci-releases-and-rollback.md#x-api-probe)).

## Data and private values

The prototype's `data.json` and `img/` are the owner's real saves: other people's posts, comments and images. They stay gitignored, and so does any other fetched content. Hostnames, account names and server details live in the gitignored `docs/private/` on the owner's machine; public docs say "the owner's home server" and "a separate Reddit account".

## Grok Bot

Before you design anything that touches the Grok Bot (the Threadsift bot, its skill or routines, the Instance routes it calls, or the Grok Bot Provider), read `docs/private/grok-bot/NOTES.md`. `docs/private/` exists only in the owner's main checkout, never in a worktree, so read and save there. Ask the owner's primary Bot (xAI's name for the main Grok Bot of an account, the one the owner talks to) only what the notes do not already answer as verified. Save the questions and answers in that folder, and give each answer a status in `NOTES.md`: verified by xAI's Grok Bot docs (https://docs.x.ai/grok-bot/overview), verified by a run, stated by the Bot only, refuted, or open. Rely only on a verified answer, because the docs leave much of a Bot's behaviour out, and the Bot answers from its own tool descriptions, which runs have contradicted.

On the owner's machine a session reaches the Bot through the Grok Bot app, with `box-browser --app <account> <agent-browser command>`; `NOTES.md`, "Reaching the primary Bot", names the account. A run that adds or changes anything on the owner's Bot, such as a skill or a routine, waits for the owner's yes. It records each setting it changes before the run, puts it back after, and checks that it is back, and it deletes what it added.
