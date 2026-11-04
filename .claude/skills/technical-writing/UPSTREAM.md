# Upstream

Source: https://github.com/cursor/plugins, folder `pstack/skills/technical-writing/`

Commit: `bb68f2365eceafa0cb2d253112f675acf5f144cc`

`LICENSE` (MIT) is `pstack/LICENSE` at that commit.

Local changes:

- `SKILL.md` drops `disable-model-invocation`, so Claude loads the skill on its own and the implementer agent can preload it.
- A section "Point at the code, never restate it" is added at the owner's request: docs name the code instead of copying it.
- The Reference mode's "Generate from code where possible" becomes "Point at the code instead of copying it (see below)", and the worked example's "After" text names `budget.mjs` and gives the reason and the procedure instead of narrating what the script does.
- The `unslop` skill becomes the vendored `humanizer` skill, its "slop-pattern catalog" becomes "catalog of AI writing patterns", and the request to propose additions to `unslop` is removed.
- UI strings go to `tools/copy/write-copy.sh`; the tab-indent rule for code snippets is removed, because docs hold no code.

Update by diffing the upstream file between the commit above and a newer one, applying what fits on top of the local changes, and moving the commit forward.
