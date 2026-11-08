# Changing code

Rules for every agent that writes or changes code, config, scripts, docs, commit messages or PR bodies here. The `implementer` agent (`.claude/agents/implementer.md`) runs them; a session that edits code directly follows them too.

## Official sources first

Hono, Drizzle, Workers, React, oxlint and the AI SDK release every few weeks, so a model's memory of them is stale.

- Before using an API, a config key, a CLI flag or a library function, read its official docs, its source at the installed version under `node_modules/`, or its versioned schema. A CLI's own `--help` counts.
- When the docs and the installed source disagree, the installed source wins.
- The commit message cites each source: the URL, and for a repository the commit SHA or tag.

## No comments

Agents copy what they read, so a comment that excuses a workaround teaches the next agent to write another one. Names, types and small functions carry the meaning instead. A fact the code cannot show goes into the commit message or the doc that owns its topic.

Three kinds of comment stay:

- A tool directive that a tool reads: a lint suppression that names its rule and gives its reason after `--`, `@ts-expect-error` with its reason, `/// <reference ... />`, `// oxfmt-ignore`, and the bundler annotations `/* @vite-ignore */`, `/* #__PURE__ */`, `/* #__NO_SIDE_EFFECTS__ */` and `/** @jsxImportSource ... */`. The comment holds the directive alone, with no prose around it. `prettier-ignore` is refused, because oxfmt reads `oxfmt-ignore`.
- A licence header at the top of the file: a block comment that holds an `SPDX-License-Identifier:` line and any copyright lines, or the single line `// SPDX-License-Identifier: <id>`.
- One line that names a constraint an outside dependency, platform or protocol forces and ends with its upstream `https://` link. It sits on its own line, because `eslint/no-inline-comments` refuses a comment after code.

`threadsift/no-comments` (`tools/oxlint/threadsift/rules/no-comments.ts`) holds the exact patterns and refuses every other comment, doc comments on exported functions included. Lint cannot judge whether a kept suppression or link line is true, so before finishing, read `.claude/agents/comment-sicko.md` and judge every comment the diff adds by its keep-list and its hunt.

## Design

The app is one core with ports, and each install target supplies an adapter per port: ports and adapters, also called hexagonal architecture (`docs/architecture.md`, One codebase, two install targets). Before adding or changing a module, a port or an interface, load the `codebase-design` skill (`.claude/skills/codebase-design/`) and use its words: module, interface, seam, adapter, depth, leverage. Where the skill differs from this page or from `docs/testing.md`, they win.

- A module hides a lot of behaviour behind a small interface. A module whose interface is as big as its body is shallow: merge it into its caller or deepen it.
- `src/core/` and `src/http/` run on both targets and call ports only. Lint refuses there a `node:` or `cloudflare:` import, any import from `targets/`, and an `import()` whose source is not a plain string; the target's entry passes adapters in through `createApp(ports)`.
- A port exists only when two production adapters need it, such as the Node and Worker targets or two Providers. A test adapter does not count, because tests use no fakes (`docs/testing.md`).
- Names come from `GLOSSARY.md`.

## Interface text

Every text a user reads is written by `tools/copy/write-copy.sh`, never by hand: labels, buttons, messages, empty states, errors, onboarding, and README and site prose. The owner chose this instead of picking a voice by hand. The script runs the Antigravity CLI (`agy`) on Gemini 4 Argon at high effort, falls back to Gemini 3.8 Flash at high effort when Argon is rate limited, and has it follow the vendored `humanizer` skill (`.agents/skills/humanizer/`) with `PRODUCT.md` and `GLOSSARY.md` as context.

1. Write a brief to a file outside the repository: where the text shows, what it must say, the facts it may use, length and case limits, and the neighbouring texts it must match.
2. Run `tools/copy/write-copy.sh <brief>`. It prints the text, or exits non-zero with the reason: 64 for a missing brief, 69 when `agy` is not installed, is signed out or does not list both models, 75 when both models are rate limited, 1 for any other failure.
3. Use the text as printed. When it is wrong, fix the brief and run the script again.
4. Quote the brief and the printed text in the commit message and in the report, so the reviewer can check the text came from the script.

The `error` text of the HTTP API is read by agents and `curl` and never shown by the web app, so it is code and stays as written; the script covers only text a person reads in the product.

`agy` must be signed in on the machine; a contributor without it leaves a visible placeholder, `[text needed]`, for the owner to run the script.

## Code

- Load the `ub-mode` skill before writing code. Where it differs from this page or from `docs/testing.md`, they win: its TDD, Crapper and Mutator sections give way to `docs/testing.md`, and its Commit and Push section gives way to the caller's branch and review flow.
- For TypeScript, follow the `typescript-best-practices` skill (`.claude/skills/typescript-best-practices/`): discriminated unions, branded types, schemas before hand-written guards, exhaustive switches.
- Outside data is parsed with Zod where it enters. `as` assertions fail lint (`typescript/consistent-type-assertions`); `as const` is allowed.
- A change to `tools/pr-copy/` that a feature's copy check needs lands in its own pull request before the feature, because `copy-checks.yml` runs `main`'s `tools/pr-copy` against the pull request's copy (`docs/architecture.md`, Copy checks).

## Docs, commit messages and PR bodies

Write them by the `technical-writing` skill (`.claude/skills/technical-writing/`). A doc points at the code and never restates or copies it: it names the file, symbol or command, and holds only what the code cannot show, such as the reason for a choice, a constraint, a measured fact with its command, or a procedure.

## Tests

`docs/testing.md` governs. A feature is proven end to end through the real app on both install targets, with no fakes and no recordings; a unit test is written only when the owner asks for one.

## Screens and browser code

- For any change to what a screen shows or how it behaves, load the `impeccable` skill. Every value comes from `design/system/`.
- For HTML, CSS and browser APIs, load the `modern-web-guidance` skill (its plugin is enabled in `.claude/settings.json`) and follow the guide it returns. The browser target is Baseline Widely available.

## Finish

1. Run `pnpm lint:fix`. It also applies suggestion fixes, which can change behaviour, so read its diff and keep or revert each one. Dangerous fixes (`--fix-dangerously`) are never applied.
2. Run `pnpm check`.
3. Judge every comment the diff adds with `.claude/agents/comment-sicko.md`, and act on each verdict.
4. Prove the change the way its caller meets it, and keep the command and its output as the artifact. A change to what the app does gets the end-to-end proof `docs/testing.md` asks for. A change to tooling, config or scripts gets a run of that tool as its caller runs it, such as the edit hook fed a sample payload, a commit through the git hooks, or `devenv test`.

Done when all four pass on the final version of every changed file. `docs/agents/reviewing-code.md` says what happens next.
