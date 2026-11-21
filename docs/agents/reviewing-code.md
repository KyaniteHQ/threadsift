# Reviewing code

Each implemented change gets one review from an agent that did not write it: the owner's global `code-reviewer` agent, which also runs a Codex review of the same change and merges both into one list. Where that agent is not installed, a Claude Opus session that did not write the change reviews it.

The review runs on the owner's machine, never in CI ([CI, releases and rollback](../architecture/ci-releases-and-rollback.md), Secrets and forks).

The reviewer edits nothing and runs steps 2 to 4. The session that owns the change runs step 1 before the review, and steps 5 and 6 after it.

1. **Clean up the diff** for reuse, simplification, efficiency and altitude, and keep the cleanups that pass `devenv tasks run ci:gate`. Claude Code runs `/simplify`; Codex runs the `tidy` skill.
2. **Judge the diff in its final shape** with the `thermo-nuclear-code-quality-review` skill, installed for Claude Code and Codex on the owner's machine. Without it, check that the diff deletes layers instead of moving them, keeps files under 1000 lines, adds no special case to a shared path, types its boundaries, keeps logic in the module that owns its concept, and runs independent work in parallel.
3. **Judge every comment the diff adds** by the keep-list and the hunt of the `comment-sicko` agent, and report a verdict for each.
4. **Check the diff against the rules**, in [Changing code](changing-code.md) and [Testing](../testing.md):
   - Every source is cited.
   - Each new or changed module is deep, and each port has two production adapters, except the four that Changing code (Design) names. The `codebase-design` skill defines both.
   - TypeScript follows the `typescript-best-practices` skill.
   - Every doc line that `pnpm docs:impact <the diff's base>` lists is still true, and the docs a changed symbol or behaviour touches are updated.
   - Docs, the commit message and the PR body follow the `technical-writing` skill, name no file path, and restate or copy no code.
   - Every new text a user reads in the product comes from the copy script ([Changing code](changing-code.md), Interface text), with its brief and output quoted in the commit message.
   - Each suppression is justified.
   - Each test is allowed by Testing.
   - The Finish artifact exists and ran on the final files.

   When you find a fault once, search the diff and the modules beside it for the same shape before the report, and list each match.
5. **Fix every finding**, low ones included, and every comment verdict, then check the fixes with `git range-diff`. Fixes after review get no second review agent.
6. **Check screens.** When the change touches what a screen shows, the gate runs the `design:check` task (`impeccable detect` on the web app, with `--github` under GitHub Actions, then `pnpm run check:faces`). Check screenshots of each changed part in every theme before landing, as the pull request template asks.
