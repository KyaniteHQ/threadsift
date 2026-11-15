# Code quality review (round 7): the prototype's structure

**Verdict:** approve. 0 blockers, 1 major and 4 minors, found in the whole prototype tree before the design system was built (`Library.dc.html` 881 lines, `library.js` 276, `tokens.css` 237, `Reader.dc.html` 479, `Settings.dc.html` 173). The round-6 major (look options held in script tables instead of `tokens.css`) was fixed: every option of the seven look settings was a `[data-*]` block, and the script kept only ids and labels. The five findings below are the reasons for known issues 1 to 5 of Prompt 4 in `docs/design/claude-design-prompts.md`, which holds the fix of each. `design/system/tokens.css` and `design/system/settings-table.ts` carry them out.

Not verified by this pass: runtime cost (the bar refit re-renders the Reader up to 5 times per width change, and the fold measures on every resize), deployment, and the Google Fonts request.

## Major: the ten settings were restated in five lists

The settings table, `SETTING_KEYS`, `LOOK_KEYS`, `SETTINGS_DEFAULT` and `lookAttrs` all listed the same keys, and no list owned the link between a setting and its attribute. Nothing tied them together, so adding an eighth look setting meant editing 9 places: a key missing from `lookAttrs` silently did nothing, and one missing from `LOOK_KEYS` silently survived Reset look. Card images was the odd one. Its option ids were booleans, so `settingValue`, `toBit` and `lookAttrs` each had a branch that turned `true` into the `on` that `tokens.css` needed.

`tokens.css` also never named its plain options (`plex`, `medium`, `compact`, `lines`, `cobalt`, `dots`, `on`). They existed only as the first words of `SETTINGS_DEFAULT`, so no check could tell that the plain block and the default id still agreed.

Decision: one table owns each setting's id, label, attribute and default, and every other list is built from it.

## Minors

- **Side buttons had a fallback that could not run.** The Sheet's side buttons moved into the bar when the gap beside the sheet was under 56px. The gap was `--side-gap: 72px` and the buttons need 56px, so 16px always remained. Measured at app widths 761, 800, 880, 905, 1000 and 1440: the buttons never left the app and the fallback never fired. Meanwhile every update ran 3 `getBoundingClientRect` calls. Decision: put the 56px the buttons need into `--side-gap` and drop the fallback.
- **The accent formula was written four times.** `--acc` was computed in three theme blocks and again in the swatch, because the swatch's `data-accent` changed `--ah` after the app root had already computed `--acc`. Decision: compute `--acc` once, in the block that works out values, so any element with `data-accent` works out its own.
- **Theme and Layout were classes, the other seven settings were attributes, and the class names were not the setting ids.** `layout: 'grid'` meant `.L-cards` and `theme: 'dark'` meant `.th-dark`, so a reader of `tokens.css` needed a lookup table. Decision: `data-theme` and `data-layout` use the setting ids. The reader style stays one derived value, `data-reader`, because it depends on the width as well as on Open items as.
- **Look values and per-element variables sat outside the look blocks.** The phone overrides of Comment style were two sections away from the option, `--sheet-now` was declared in a component file, and the 8 tag hues existed only in a script array. Five variables (`--sheet-now`, `--d`, `--tag-h`, `--progress`, `--fade-to`) were used and declared nowhere in `tokens.css`. Decision: keep each option whole in one place, declare `--sheet-now` beside `--sheet-w`, write the tag hues as `[data-tag]` rules, and name the per-element variables in the file header.

## Other findings

Giving each Compare pane its own iframe would make the breakpoint reading plain `@media` rules. The prototype does not need it, and the design system does not depend on it.

Three correctness bugs seen in passing became known issues 6, 7 and 8 of Prompt 4: Card images Off hid the pictures with `display: none` but still loaded them, so the setting saved no bandwidth; the Reset look explanation was only a `title` tooltip, which touch devices never show; and the word joiner in table number ranges also matched dates and IDs and went along with copied text.
