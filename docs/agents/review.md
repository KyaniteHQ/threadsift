# Review

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
4. Check the diff against `docs/agents/implementing.md` and `docs/testing.md`: every source cited, each suppression justified, each test allowed by `docs/testing.md`, and the Finish artifact present and run on the final files.
5. Fix every finding, low ones included, then check the fixes with `git range-diff`. Fixes after review get no second review agent.

Done when every finding is fixed or named in the landing report with the rule that keeps it.
