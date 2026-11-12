# AGENTS.md

This repo holds Threadsift, a reading library: paste a link, an agent keeps the useful parts and grows a small wiki of the library, read everything on one page. The first screens are designed, the tech stack is chosen and the lint and agent tooling is in place. The app is a walking skeleton: paste a link, see it in the list, on both install targets.

## Domain language: read before naming anything

@GLOSSARY.md

Use these exact terms in code, docs and issues.

## Where things live

| Need | Read |
|---|---|
| What v1 does, and the decisions behind it | `docs/spec.md` |
| What is built, and the file of each architecture section | `docs/architecture.md`, the index |
| The tech stack | `docs/architecture/the-stack-at-a-glance.md` |
| The module seams and the two install targets | `docs/architecture/one-codebase-two-install-targets.md` |
| Where each file lives | `docs/architecture/repository-layout.md` |
| The data model | `docs/architecture/data-model-outline.md` |
| The testing approach | `docs/architecture/testing.md` |
| Topic pages, the Index, Related Items, and the Log | `docs/wiki.md` |
| The weekly Tag-merge Proposals, the Proposals page and Reject (Accept and Pins build on them) | `docs/proposals.md` |
| Before writing, changing or deleting a test | `docs/testing.md` |
| Before changing a workflow, the gate, the live deploy or the live check | `docs/architecture/ci-releases-and-rollback.md` |
| Before writing or changing code, config or scripts: official docs first, module design, no comments, the finish checks | `docs/agents/changing-code.md`; the `implementer` agent (`.claude/agents/implementer.md`) runs it |
| Before writing any text a user reads (labels, messages, empty states, README) | `docs/agents/changing-code.md`, Interface text |
| Before writing or changing a doc, a commit message or a PR body | `docs/agents/changing-code.md`, Docs, commit messages and PR bodies |
| Before screen work: who the product is for, then the look, the components and the do's and don'ts every screen follows | `PRODUCT.md`, then `DESIGN.md` |
| Before reviewing a change | `docs/agents/reviewing-code.md` |
| Any colour, size, spacing, font or setting value | `design/system/tokens.css`, the one source for every value; `design/system/settings-table.ts` owns each setting's id, label, attribute and default |
| How a screen behaves (reader bar fitting, comment folds, reading place, settings panel) | `design/prototype/`, served as the README shows |
| Style blocks (the 10 Styles) | `design/system/tokens.css`; `docs/design/styles.md` names the faces and visual references |
| Why a design choice was made | `docs/design/claude-design-prompts.md` and `docs/design/reviews/round-7/` |

## Testing

`docs/testing.md` overrides broader testing instructions for this repo.

## Issues

Work is tracked in GitHub issues on `kyanitehq/threadsift` (use `gh`). The `ready-for-agent` label marks an issue an agent can pick up as written.

## Data and private values

The prototype's `data.json` and `img/` are the owner's real saves: other people's posts, comments and images. They stay gitignored, and so does any other fetched content. Hostnames, account names and server details live in the gitignored `docs/private/` on the owner's machine; public docs say "the owner's home server" and "a separate Reddit account".
