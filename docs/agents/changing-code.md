# Changing code

These rules apply to every agent that writes or changes code, config, scripts, docs, commit messages or PR bodies here. The `implementer` agent runs them, and a session that edits code directly follows them too.

## Official sources first

- Before you use an API, a config key, a CLI flag or a library function, read its official docs, its source at the installed version under `node_modules`, or its versioned schema. A CLI's own `--help` counts.
- When the docs and the installed source disagree, the installed source wins.
- The commit message cites each source: the URL, and for a repository the commit SHA or tag.

## No comments

A fact the code cannot show goes into the commit message or the doc that owns its topic. Three kinds of comment stay:

- A tool directive that a tool reads: a lint suppression that names its rule and gives its reason after `--`, `@ts-expect-error` with its reason, `/// <reference ... />`, `// oxfmt-ignore`, and bundler annotations such as `/* @vite-ignore */` and `/* #__PURE__ */`. The comment holds the directive alone, with no prose around it.
- A licence header at the top of the file: a block comment that holds an `SPDX-License-Identifier:` line and any copyright lines, or the single line `// SPDX-License-Identifier: <id>`.
- One line that names a constraint an outside dependency, platform or protocol forces and ends with its upstream `https://` link. It sits on its own line, because `eslint/no-inline-comments` refuses a comment after code.

The `threadsift/no-comments` lint rule holds the exact patterns and refuses every other comment, doc comments on exported functions included. Lint cannot judge whether a kept suppression or link line is true. Before you finish, judge every comment the diff adds by the keep-list and the hunt of the `comment-sicko` agent.

## Design

The app is one core with ports, and each install target supplies an adapter per port ([One codebase, two install targets](../architecture/one-codebase-two-install-targets.md)). Before you add or change a module, a port or an interface, load the `codebase-design` skill. Where the skill differs from this page or from [Testing](../testing.md), they win.

- A module hides a lot of behaviour behind a small interface. A module whose interface is as big as its body is shallow: merge it into its caller or deepen it.
- The code is cut into layers that import each other in one order, and lint refuses an import against it. Put a new module and a new route module where [Repository layout](../architecture/repository-layout.md) says, and reach the core half of another feature only through its entries.
- A port exists only when two production adapters need it, such as the Node and Worker targets or two Providers. A test adapter does not count, because tests use no fakes ([Testing](../testing.md)). `Crypto`, `fetchers`, `xFetcher` and `vaultFolder` are the four accepted exceptions, and [One codebase, two install targets](../architecture/one-codebase-two-install-targets.md) gives the reason for each.
- Names come from the [GLOSSARY](../../GLOSSARY.md).
- Declare an enum list, a code or a limit once. It lives in the contract module of the feature that owns its meaning, or in the table module of the one table that reads it, and only when no screen, route or Extension reads the list. Tables, schemas, CHECKs, cursors and route text derive from it, so a second copy never drifts. `caseOf` builds a CHECK from a record, and `byteSize` writes a size.

## State, writes and failures

Each rule names the code that shows its shape. Where a doc already states the rule, the rule points there.

- **One module owns the writes of a state.** Every other module calls it, because a second writer closes or moves a row by its own path and skips what the owner does with it: a job closed outside `closeJob` leaves its Grok Bot task running. A job row closes only through the job close module: `closeJob` for the claimed job, `closeItemJobs` for the open `fetch` and `x_verify` jobs of an Item, and `closeRunJobs` for an export or restore. The proposal lifecycle module owns the writes of a Proposal ([Proposals](../proposals.md), The lifecycle).
- **A write that follows an answer names what the answer was about.** Put the session, claim or revision in the same statement as the write, so a late answer about an old one changes nothing: a late reply about an old Reddit session would otherwise expire the new session. See `ofSession` in the Reddit account states and `atRevision` in the proposal lifecycle.
- **States that exclude each other are one value.** Use a discriminated union, because two fields can disagree and the screen then shows both. Bad: `pending: boolean` beside `sent: Note | null`. Good: `NoteAttempt`, the state of a Note save.
- **A cleanup in a `catch` or a `finally` never replaces the error.** Run it through `bestEffort`, `readOrAssume` or `withCleanup` from the failure log module, as `recordingFailure` shows. [Lint and format](../architecture/lint-and-format.md) says what `threadsift/no-await-before-rethrow` misses.
- **Every call that waits for something outside names its deadline.** Derive it from the constant of the side that sets the wait, because a deadline shorter than the longest legitimate wait fails a request that would have landed. When it runs out, the screen reads the state from the server again. [Web app](../architecture/web-app.md), Read and write deadlines, owns the deadlines and names the writes with `NO_DEADLINE`.
- **A write the screen may repeat accepts the answer of its own first try.** The screen cannot know that a timed-out first call did not land. A delete accepts 404 and a create reads the list again. A Note save instead shows the revision conflict panel after a lost answer, even when the texts match. See `revokeToken` in the web app's access calls and `noteReducer`.
- **The database refuses a column that means something in one state only.** A CHECK refuses the column in every other state. See `proposals_accepting_check`.
- **The web app imports server values only from the contract layer.** The bundler follows every value import, so a module that runs server code ships that code to the browser. `threadsift/layer-imports` and `threadsift/no-server-value-import` enforce this ([Lint and format](../architecture/lint-and-format.md)).

## Interface text

The copy script writes every text a user reads in the product: labels, buttons, messages, empty states, errors, onboarding and site prose. Nobody writes one by hand. The script runs the Antigravity CLI (`agy`) with the `humanizer` skill, [the product brief](../../PRODUCT.md) and the [GLOSSARY](../../GLOSSARY.md) as context. The README and the guides are docs and follow Docs, commit messages and PR bodies below.

1. Write a brief to a file outside the repository: where the text shows, what it must say, the facts it may use, length and case limits, and the neighbouring texts it must match.
2. Run `tools/copy/write-copy.sh <brief>`. It prints the text, or exits non-zero with the reason on stderr.
3. Use the text as printed. When it is wrong, fix the brief and run the script again.
4. Quote the brief and the printed text in the commit message and in the report, so the reviewer can check the text came from the script.

The `error` text of the HTTP API is read by agents and `curl` and never shown by the web app, so it is code and stays as written. The script covers only text a person reads in the product.

`agy` must be signed in on the machine. A contributor without it leaves a visible placeholder, `[text needed]`, for the owner to run the script.

A text that tells the owner where to look names only what a run shows there. Bad: a note that says the log has the reason while the line holds only an error class and a code. Good: a note that names the line and what it holds, written after a run of the failure and a read of the log.

## Code

- Load the `ub-mode` skill before you write code. Where it differs from this page or from [Testing](../testing.md), they win: its TDD, Crapper and Mutator sections give way to Testing, and its Commit and Push section gives way to the caller's branch and review flow.
- For TypeScript, follow the `typescript-best-practices` skill: discriminated unions, branded types, schemas before hand-written guards, exhaustive switches.
- Parse outside data with Zod where it enters. `as` assertions fail lint (`typescript/consistent-type-assertions`); `as const` is allowed.

## Docs, commit messages and PR bodies

Write them, the README and the guides included, by the `technical-writing` skill, and apply the `humanizer` skill as that skill says.

- **Name the symbol or the command, never the file path.** A path breaks when a file moves, and a symbol does not. Describe a thing by its role or by its GLOSSARY term: "the Reader's lazy page loader", `announcement`, `SettingsActions`, `pnpm run check`. Name a skill or an agent by its name, and a helper by its symbol. Keep a path only inside a command that needs it, a config key, a route or a URL.
- **Link to another doc with a Markdown link and plain link text**, such as `[Testing](../testing.md)`, never with a path as the link text.
- **Point at the code, and never restate or copy it.** A doc holds only what the code cannot show: the reason for a choice, a constraint, a measured fact with its command, or a procedure.
- **State the present.** A doc holds no history of what the code used to do. A date stays only when it is the date of a check that supports a current status.
- **Update every doc line a change makes untrue, in the same change**, as you update a test.

## Tests

[Testing](../testing.md) governs: real code, a real database and real runtimes, no fakes and no recordings. A change to a requirement that a core test or a smoke test names updates that test. Write a new test only when the owner asks for one.

## Screens and browser code

- For any change to what a screen shows or how it behaves, load the `impeccable` skill. Every value comes from the design system's tokens.
- A value that changes on a timer is not a live region. A screen reader reads each tick aloud, so announce a change once, through the page's announcer: `announcement` in the Proposals page hook, drawn by the `Announcement` component.
- An action that cannot work says why before the press. Show the reason beside the control and tie it with `aria-describedby`. See `SettingsActions`.
- For HTML, CSS and browser APIs, load the `modern-web-guidance` skill (its plugin is enabled in the project's Claude Code settings) and follow the guide it returns. The browser target is Baseline Widely available.

## Finish

1. Run `pnpm lint:fix`. It also applies suggestion fixes, which can change behaviour, so read its diff and keep or revert each one. Dangerous fixes (`--fix-dangerously`) are never applied.
2. Run `devenv tasks run ci:gate`.
3. Judge every comment the diff adds with the `comment-sicko` agent, and act on each verdict.
4. Run `pnpm docs:impact`, with the base of the diff as its argument when that is not `origin/main`, and update or confirm each line it lists. The report names each line kept and why.
   - The tool lists a doc line that names a repository path, or links to a file, that the change touched, and a doc line whose first backticked symbol the change removed from a module's exports. Content edits to a Markdown file never list a line.
   - It cannot list a line that describes a behaviour in words or names a symbol the change only edited. Search the docs, the README and the agent instructions for each symbol and GLOSSARY term the change touched, and read the bullets of [the v1 spec](../spec.md) for the behaviour it changed.
5. Prove the change the way its caller meets it, and keep the command and its output as the artifact. A change that reaches an install target or a screen also gets `devenv tasks run smoke:worker` and `devenv tasks run smoke:container`, as [Testing](../testing.md) says. A change to tooling, config or scripts gets a run of that tool as its caller runs it, such as the edit hook fed a sample payload, a commit through the git hooks, or `devenv test`.

Done when all five pass on the final version of every changed file. [Reviewing code](reviewing-code.md) says what happens next.
