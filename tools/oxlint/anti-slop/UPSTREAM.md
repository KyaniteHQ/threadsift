# Upstream

Source: https://github.com/dmmulroy/anti-slop

Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`

Copied `skills/install-anti-slop/assets/anti-slop/` without the opt-in `effect/` folder, which holds rules for the Effect library that Threadsift does not use. The root `LICENSE` (MIT) is included. To update, copy the same folder from a newer commit, omit `no-chained-type-assertions`, `no-widen-then-assert` and `require-safety-comment-for-type-assertion` and their imports and registrations in `index.ts`, and move the commit above forward. `typescript/consistent-type-assertions` bans assertions, and the safety-comment rule conflicts with the comment policy.

The retained rule files stay byte-identical to upstream; `index.ts` omits the three rules above. That is why the duplication `dryer` finds between its rules stays, and why `oxlint.config.ts` and `.oxfmtrc.json` ignore this folder.
