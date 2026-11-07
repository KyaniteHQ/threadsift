# Reviewing code

Each implemented change gets one review from an agent that did not write it: the main session on Claude Opus, or gpt-6.1-sol at medium effort. The review runs on the owner's machine, never in CI, because OpenAI's CI guide rules out the ChatGPT plan in a public repository (`docs/architecture.md`, Testing).

1. Clean up the diff for reuse, simplification, efficiency and altitude, and keep the cleanups that pass `pnpm check`. Claude Code runs `/simplify`; Codex runs the `tidy` skill.
2. Judge the diff in its final shape with the `thermo-nuclear-code-quality-review` skill, installed for Claude Code and Codex on the owner's machine. Without it, apply its seven checks:
   1. A reframing that deletes branches, helpers, modes or layers beats one that moves them.
   2. A file stays under 1000 lines.
   3. A path other features share gains no special case, flag or one-off branch.
   4. Direct code beats a wrapper, a pass-through helper or a generic mechanism around a simple shape.
   5. Boundaries are typed: no casts, unnarrowed `unknown`, ad-hoc shapes or silent fallbacks.
   6. Logic sits in the module that owns its concept and calls the helper that already exists.
   7. Independent work runs in parallel, and a multi-step update cannot stop half applied.
3. Judge every comment the diff adds. Claude Code runs the `no-comments` skill (`.claude/skills/no-comments/`); Codex follows `.claude/agents/comment-sicko.md` itself.
4. Check the diff against `docs/agents/changing-code.md` and `docs/testing.md`: every source cited, each new or changed module deep and each port backed by two production adapters (the `codebase-design` skill, `.claude/skills/codebase-design/`), TypeScript that follows the `typescript-best-practices` skill (`.claude/skills/typescript-best-practices/`), docs, commit message and PR body that follow the `technical-writing` skill (`.claude/skills/technical-writing/`) with no restated or copied code, every new text a user reads printed by `tools/copy/write-copy.sh`, with its brief and output quoted in the commit message, each suppression justified, each test allowed by `docs/testing.md`, and the Finish artifact present and run on the final files.
5. Fix every finding, low ones included, then check the fixes with `git range-diff`. Fixes after review get no second review agent.
6. When the change touches `src/targets/`, `src/core/passwords.ts`, `src/targets/shared/crypto.ts`, `src/core/article.ts`, `src/core/jobs.ts`, `src/core/job-finish.ts`, `src/core/tick.ts`, `src/core/job-rows.ts`, the fetch cap, `wrangler.jsonc` or `tools/pr-copy/`, or updates Defuddle, linkedom or wrangler, dispatch the copy checks once the gate has passed and the copy is at the head: `gh workflow run copy-checks.yml -f pr=<n> -f head=<sha>`. Read the run's summary and its artifact. A check that fails or ends inconclusive is a finding (`docs/architecture.md`, Pull request copies, Copy checks).
7. After the gate passes and the code review fixes are in, mark the pull request ready with `gh pr ready <n>`, then run `tools/impeccable-wait.sh <n>`. Read the result, the linked review comment and the pages it did not see; fix each finding and rerun the affected checks. A push restarts the wait on the new head. The script is read-only. If it exits 3, read its reason and run the printed `gh pr comment` command to request the review, then rerun the waiter. When the script reports a failed copy, fix that deployment first; when it reports a timeout or API failure, resolve that cause and rerun. Exit 7 means the deploy job succeeded but no deployment appeared after one more poll; inspect that run’s no-change reason before rerunning. A completed check that skipped the design review proves no screen was inspected. Do not count an unseen page as reviewed.

Done when every finding is fixed or named in the landing report with the rule that keeps it.
