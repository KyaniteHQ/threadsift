# Upstream

Source: https://github.com/mattpocock/skills, folder `skills/engineering/codebase-design/`

Commit: `7739eaed7f8f3915437a8def198a6d0d7206dbc7`

`LICENSE` (MIT) is the repository root's licence at that commit. The upstream folder's `agents/openai.yaml` is left out: it holds only a display name and a short description for OpenAI's agent skill listing, which this repository does not use.

Local changes:

- `SKILL.md`: a shorter description; the examples of a shallow adapter and of internal parts name no fakes or mocks; no internal seams for tests; "Accept dependencies" becomes "take a dependency in only where two production adapters vary", because `docs/testing.md` forbids test-only seams; the surface-area point counts callers and end-to-end runs instead of unit tests.
- `DEEPENING.md`: every dependency category is tested against the real dependency, as `docs/testing.md` asks; a port needs two production adapters, because a test adapter does not count; no internal seams for tests; a deepened module is proven end to end, with unit tests only when the owner asks.

Update by diffing the upstream folder between the commit above and a newer one, applying what fits on top of the local changes, and moving the commit forward.
