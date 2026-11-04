# AGENTS.md

commonplace holds Library, a personal reading library: paste a link, an agent keeps the useful parts, read everything on one page. The design is done; the app is not built and the tech stack is not chosen.

## Domain language: read before naming anything

@CONTEXT.md

Use these exact terms in code, docs and issues.

## Where things live

| Need | Read |
|---|---|
| What v1 does, and the decisions behind it | `docs/spec.md` |
| Any colour, size, spacing, font or setting value | `design/system/tokens.css`, the one source for every value; `design/system/settings.js` owns each setting's id, label, attribute and default |
| How a screen behaves (reader bar fitting, comment folds, reading place, settings panel) | `design/prototype/`, served as the README shows |
| Style blocks (the 10 Styles) | `design/prototype/tokens.css`; the design system predates them, so they still have to move into `design/system/tokens.css` |
| Why a design choice was made | `docs/design/claude-design-prompts.md` and `docs/design/reviews/round-7/` |

## Issues

Work is tracked in GitHub issues on `kyanitehq/commonplace` (use `gh`). The `ready-for-agent` label marks an issue an agent can pick up as written.

## Data and private values

The prototype's `data.json` and `img/` are the owner's real saves: other people's posts, comments and images. They stay gitignored, and so does any other fetched content. Hostnames, account names and server details live in the gitignored `docs/private/` on the owner's machine; public docs say "the owner's home server" and "a separate Reddit account".
