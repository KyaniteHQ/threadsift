# Reviewing code

Each implemented change gets one review from an agent that did not write it: the owner's global `code-reviewer` agent, which also runs a Codex review of the same change and merges both into one list. Start it with no `model` or `effort` argument, because a per-call value replaces the ones its definition sets. Where that agent is not installed, a Claude Opus session that did not write the change reviews it. The review runs on the owner's machine, never in CI, because OpenAI's CI guide rules out the ChatGPT plan in a public repository (`docs/architecture/ci-releases-and-rollback.md`, Secrets and forks).

The reviewer edits nothing and runs steps 2 to 4. The session that owns the change runs step 1 before the review, and steps 5 and 6 after it.

1. Clean up the diff for reuse, simplification, efficiency and altitude, and keep the cleanups that pass `devenv tasks run ci:gate`. Claude Code runs `/simplify`; Codex runs the `tidy` skill.
2. Judge the diff in its final shape with the `thermo-nuclear-code-quality-review` skill, installed for Claude Code and Codex on the owner's machine. Without it, apply its seven checks:
   1. A reframing that deletes branches, helpers, modes or layers beats one that moves them.
   2. A file stays under 1000 lines.
   3. A path other features share gains no special case, flag or one-off branch.
   4. Direct code beats a wrapper, a pass-through helper or a generic mechanism around a simple shape.
   5. Boundaries are typed: no casts, unnarrowed `unknown`, ad-hoc shapes or silent fallbacks.
   6. Logic sits in the module that owns its concept and calls the helper that already exists.
   7. Independent work runs in parallel, and a multi-step update cannot stop half applied.
3. Judge every comment the diff adds by the keep-list and the hunt in `.claude/agents/comment-sicko.md`, and report a verdict for each.
4. Check the diff against `docs/agents/changing-code.md` and `docs/testing.md`: every source cited, each new or changed module deep and each port backed by two production adapters (the `codebase-design` skill, `.claude/skills/codebase-design/`), TypeScript that follows the `typescript-best-practices` skill (`.claude/skills/typescript-best-practices/`), docs, commit message and PR body that follow the `technical-writing` skill (`.claude/skills/technical-writing/`) with no restated or copied code, every new text a user reads printed by `tools/copy/write-copy.sh`, with its brief and output quoted in the commit message, each suppression justified, each test allowed by `docs/testing.md`, and the Finish artifact present and run on the final files.
5. Fix every finding, low ones included, and every comment verdict, then check the fixes with `git range-diff`. Fixes after review get no second review agent.
6. When the change touches what a screen shows, the gate runs the `design:check` task (`impeccable detect web`, with `--github` under GitHub Actions), and Impeccable Reviews uses the PR deployment from `.github/workflows/pr-preview.yml` (`docs/pr-previews.md`). Do not count a page nobody looked at as reviewed.

Done when every finding is fixed or named in the landing report with the rule that keeps it.
