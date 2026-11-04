# Upstream

Source: https://github.com/dmmulroy/anti-slop

Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`

Copied `skills/install-anti-slop/assets/anti-slop/` without the opt-in `effect/` folder, which holds rules for the Effect library that Threadsift does not use. The root `LICENSE` (MIT) is included. Update by copying the same folder from a newer commit and moving the commit above forward.

The copied files stay byte-identical to upstream, so an update stays a plain copy. That is why the duplication `dryer` finds between its rules stays, and why `oxlint.config.ts` and `.oxfmtrc.json` ignore this folder.
