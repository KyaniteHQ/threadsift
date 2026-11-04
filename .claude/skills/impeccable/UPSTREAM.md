# Upstream

Source: https://github.com/pbakaus/impeccable

Release: `skill-v4.8.0`, commit `414603bf14c7a344edb466bb1f85690c77ce8b7d`

Installed with `npx impeccable install --project --providers=claude -y`, which copied these paths unchanged from that commit:

- `.claude/skills/impeccable/` (this folder), except `scripts/bin/`
- `.claude/agents/impeccable-asset-producer.md`, `impeccable-documenter.md`, `impeccable-finish-reviewer.md` and `impeccable-manual-edit-applier.md`

`LICENSE` (Apache-2.0) and `NOTICE.md` come from the repository root at the same commit. `NOTICE.md` names the MIT work that `reference/ios.md` and `reference/android.md` derive from.

Local changes:

- `scripts/bin/` holds the engine binary for each platform and is gitignored. Without it, `scripts/impeccable` runs the engine from `~/.impeccable/bin/<version>/`, and downloads it there on first use, checked against `scripts/engine-checksums.txt`.
- The installer wrote its hooks into `.claude/settings.local.json`; they live in `.claude/settings.json` instead, so every clone runs them.
- `.impeccable/config.json` is Threadsift's own hook config, not an upstream file.

Update by running the same install command at a newer release, diffing the result against this commit, and moving the release and commit above forward.
