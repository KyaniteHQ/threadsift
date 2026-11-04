# Upstream

Source: https://github.com/cursor/plugins, folder `pstack/skills/typescript-best-practices/`

Commit: `bb68f2365eceafa0cb2d253112f675acf5f144cc`

`LICENSE` (MIT) is `pstack/LICENSE` at that commit.

Local changes:

- `SKILL.md` drops `disable-model-invocation`, so Claude loads the skill on its own for `.ts` files and the implementer agent can preload it.
- The pointers to pstack's type-system and boundary principle skills point at the matching sections of the vendored `ub-mode` skill.
- The rows and the "Do" examples follow this repository's lint (`oxlint.config.ts`), checked by running oxlint on them:
  - every `as` except `as const` is refused, so `as` leaves the narrowing hierarchy;
  - `typeof` checks are refused, so `typeof` leaves the narrowing hierarchy and the `unknown` example parses with a schema instead;
  - an `unknown` parameter is refused, so the schema examples parse inline where the data enters;
  - parameters must be deeply readonly, so arrays, tuples and parameter types gain `readonly`, and a Readonly parameters row is added;
  - comments after code move into the prose below each example, and a placeholder body becomes a call, because lint refuses comments;
  - `Shape` becomes `Figure`, `_exhaustive` becomes `exhaustive`, and `z.string().uuid()` becomes `z.uuid()`, because lint refuses "shape" in a name, a leading underscore and a deprecated call.
- The time-range example no longer claims a negative duration cannot be written; it says the boundary schema refuses one.
- The Structured telemetry row is removed, because no logger is chosen yet (`docs/architecture.md` names none) and no lint rule bans `console`.
- The Real tests row defers to `docs/testing.md`, which allows no mocks at all.

Update by diffing the upstream folder between the commit above and a newer one, applying what fits on top of the local changes, and moving the commit forward.
