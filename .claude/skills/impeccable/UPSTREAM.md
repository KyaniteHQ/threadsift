# Upstream

Source: https://github.com/pbakaus/impeccable

Release: `skill-v4.11.0`, commit `88cfafae649164e6dc48b88d3c0c1bf6662eaade`

Installed with `npx impeccable install --project --providers=claude -y` (npm `impeccable` 4.11.0), which copied these paths unchanged from that commit:

- `.claude/skills/impeccable/` (this folder), except `scripts/bin/`
- `.claude/agents/`: the agents `impeccable-asset-producer`, `impeccable-documenter`, `impeccable-finish-reviewer`, `impeccable-manual-edit-applier` and `impeccable-motion-reviewer`, one `<name>.md` file each

`LICENSE` (Apache-2.0) and `NOTICE.md` come from the repository root at the same commit. `NOTICE.md` names the third-party work that the skill's references and the upstream browser extension use; the extension is not part of this copy.

The copied files stay as upstream wrote them, so the repository's no-comments rule does not apply to them.

Local changes:

- `scripts/bin/` holds the engine binary for each platform and is gitignored. Without it, `scripts/impeccable` runs the engine from `~/.impeccable/bin/<version>/`, and downloads it there on first use, checked against `scripts/engine-checksums.txt`.
- The installer wrote its hooks into `.claude/settings.local.json`; they live in `.claude/settings.json` instead, so every clone runs them.
- `.impeccable/config.json` is Threadsift's own hook config, not an upstream file. Its `"telemetry": false` turns off every upload the engine makes once someone signs in to an Impeccable account: the design-health counts and `DESIGN.md` contents of a full `detect`, saved critiques and audits with their screenshots, accepted prototypes, the setup report, and the roll API's records.
- The `env` of `.claude/settings.json`, the hook commands of `.codex/hooks.json` and the `shell_environment_policy` of `.codex/config.toml` set three engine switches that the telemetry setting does not cover. `IMPECCABLE_NO_SWITCH_SYNC=1` stops `impeccable context` from writing a managed block into each agent's user-level rule file, such as `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. `IMPECCABLE_PRO=off` keeps the hooks on the open engine, so they never download the Pro build or refresh its lease. `IMPECCABLE_NO_TASTE=1` stops `impeccable context` from fetching the account's design preferences for this repository. Each switch acts only once someone signs in.
- Codex reads this folder through the symlink `.agents/skills/impeccable`, and `.codex/hooks.json` calls `.agents/skills/impeccable/scripts/impeccable` from the repository root, where the release's Codex hooks call a separate copy under `.codex/skills/`.

Update by running the same install command at a newer release, diffing the result against this commit, and moving the release and commit above forward. The installer deletes `LICENSE`, `NOTICE.md` and this file, so copy the first two again from the repository root at the new commit and restore this one. Check the new engine's opt-out variables (`docs/RUNTIME-ENV.md` upstream) against the switches above.
