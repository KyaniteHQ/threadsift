# Assessment A (round 7): design review of the Library prototype, canvas v26

Target: `<scratch>/design-v7/Main.dc.html` at http://127.0.0.1:8771/Main.dc.html (I started no server; the given one is left running). Mode: Operate plus Read. I read the round-6 review, `prompt3h.txt` and `SPEC.md` first. I did not run `impeccable detect` and did not read `review7/detector-b/` or `review7/thermo/`. Browser: only my session `9a139206-7104-4656-8d25-47a87f500809-design-a7`, closed at the end.

Evidence key: M = measured in the page, S = screenshot, C = read in code. Everything is under `<scratch>/review7/design-a/`: `shots/` (single shots), `shots/combos/` (64 shots), `sheets/` (contact sheets), `scripts/`, `logs/`. Before each URL-driven view `scripts/go.sh` clears `localStorage` and writes `library:settings`. The gear, the panel, Reset look, Close, Escape and tap outside used the real UI and the stored state it wrote.

## 1. Readiness verdict

**Ready to be the source for Prompt 4. I found no P0, no P1 and no P2.** All 13 items of `prompt3h.txt` work in the runs below, except item 10 (Sepia tint), which is done as written but is too weak to change how Teal looks on sepia (P3). The two round-6 P2 items (the Mono reader bar, the phone settings sheet) are fixed and I could not break them at any width I tried. The long reads, the comment fold on first render and Agenix after a reload still hold (36 of 36 runs).

Fix before Prompt 4 (small, cheap, each a P3 that changes what the system should say):

1. Sepia selected-row tint: Teal still reads as a cool cyan block on cream (section 4, P3-1).
2. The one unexplained first-load scroll of the app container (P3-2). I saw it once and could not reproduce it in 21 further loads; ask Claude Design to make the first selection scroll only the list.

Can go into the design system as a rule instead of a fix: section 9.

Design specificity: still specific to this archive ("Kept 2 of 14 comments", Context stubs, read and unread as the only state, "Under 760px wide, items always open full screen"). The settings panel is generic, which is right.

Scores: List 33, Grid as Page 32, Grid as Sheet 33 (round 6: 32, 31, 30). Section 7.

## 2. Verification of `prompt3h.txt` (1 to 13)

| # | Request | Status | Evidence |
|---|---|---|---|
| 0 | Checkpoint drafts-v6 | Ignored as told | `checkpoints/` has drafts-v1, v2, v3, v5 and no v6 |
| 1 | Measured reader bar | Done | List at 1440 and 1920 with all 5 fonts, light theme: 0 overlaps and 0 clipped children in all 10 runs (M: `logs/bar-list.log`). Mono at 1440: the hint leaves the bar and shows whole under the search field, and it shows in the bar at 1920 (S: `shots/b1-list-1440-mono.png`). Also clean for Mono, Bricolage and Plex at 1100, 1024, 900, 800, 761 (`logs/bar-list-mid.log`), at 600, 480, 390 (`logs/bar-list-phone.log`), and for Grid as Page and Sheet with Mono and Newsreader at 1440, 1100, 600, 480, 390 (`logs/bar-grid.log`; the "rd-nav/rd-pos" overlap lines there are a parent and its child). "Both reader styles": I covered the List bar, the Grid Page bar and the Grid Sheet bar. The hint is in the pane under the search field from 1100 down to 761 for every font, and in the bar only when it fits |
| 2 | Phone sheet | Done | At 390 the panel is 717 px high with a sticky 56 px header ("Settings"), a 44x44 Close button, a body that scrolls (858 in 591 px) and a sticky footer with "Reset look" at y 775 to 844 (M: `scripts/sheet.js`). After scrolling the body to the end, the header, the Close button and the footer are still on screen (S: `shots/p1-phone-panel-open-390.png`, `shots/p2-phone-panel-scrolled-390.png`). Close, a tap outside the sheet and Escape each returned focus to the gear (M: active element "Settings, st-gear" three times, panel gone). On open, focus lands on the pressed option of the first group |
| 3 | Reset look | Done | From Grid, Sheet, Dark, Mono, Wide, Roomy, Cards, Rust, Chips, images off: after one click `library:settings` held layout grid, openAs sheet, theme dark (kept) and plex, medium, compact, lines, cobalt, dots, true (reset). The sheet stayed open, the panel stayed open and focus stayed on the button (M, S: `shots/r1-grid-sheet-panel-before-reset-1440.png`, `shots/r2-after-reset-1440.png`). The label reads "Reset look" |
| 4 | Look options as CSS attributes | Done | `tokens.css` section 2 has every option of Font, Width, Density, Accent, Comments, Tags and Images under `[data-*]`, the default as the plain value on `:root, [data-x]`. `--measure` is computed from `--chars` and `--cw`. The List and Grid variables sit under `.L-rows` and `.L-cards`. The app root carries `data-font`, `data-width`, `data-density`, `data-accent`, `data-comments`, `data-tags`, `data-images` (C: `Library.dc.html` line 210). `library.js` tables hold ids and labels only (C). The 16 mixes in section 3 render correctly through these attributes |
| 5 | Breakpoints in tokens.css | Done | `--bp-phone/narrow/medium/wide` and `--cols-*` in `tokens.css` lines 227 to 228; `breakpoints()` in `library.js` reads them and the app marks its root with `data-bp`. `narrowNote()` in `Settings.dc.html` builds "Under 760px wide..." from the token (C; the note shows at 600 and 390 in M). Media queries cannot read `var()`, so the system uses `data-bp` plus JavaScript; `tokens.css` says a real build should use container queries |
| 6 | Missing tokens | Done | `--ic-*` (5 sizes), `--pop-w`, `--tag-c`, `--ls-label`, `--dur-move`, `--dur-fade`, `--loop-spin`, `--loop-pulse` exist and each has 1 to 2 uses in the component files (C: grep). The literals that stay (1 px lines, the 3 px ring, 180 px media placeholder, the 85% sheet height and the em-based ones) are listed in the header of `tokens.css` and match what is in the files |
| 7 | Card images | Done | Images off in List and Grid: 0 of 4 `.it-media` boxes visible. Garmin opened in Grid with Card images off still shows its 475x469 picture in the reader (M, S: `shots/i2-reader-image-with-cards-off-1440.png`). One mechanism only: `--card-media` in `tokens.css` and one `display: var(--card-media)` rule (C). One text-card rule also reads `[data-images="off"]` to give the summary more lines; that is layout, not a second way to hide the picture |
| 8 | Panel keeps its own font | Done | With Mono chosen the panel computes to IBM Plex Sans for the dialog, the buttons and the select (M), and "Match system" stays on the Theme row (S: `shots/r1-...`). The panel sets `data-font` itself (C: `Settings.dc.html` line 71) |
| 9 | Open items as disabled under 760 | Done | At 600 and 390 the Page and Sheet buttons are `aria-disabled`, muted, with the note under the row (M, S: `shots/o1-grid-panel-600.png`, `shots/o1-grid-panel-390.png`) |
| 10 | Sepia tint | Partly | Done as written: sepia `--acc-soft` went from `oklch(0.895 0.045 h)` (drafts-v5) to `oklch(0.895 0.03 h)`, a third less chroma. The result is small to the eye: the selected row for Teal moved from rgb(187,230,232) to rgb(198,227,228) on a cream page of rgb(246,237,219), still a cyan block (S: `sheets/c07-v6-vs-v7.png`). Moss (`sheets/d8.png`, c15) is acceptable, Cobalt (c11) is acceptable. See P3-1 |
| 11 | 44 px fields under 480 | Done | At 479: 0 controls under 44 px in List and Grid, excluding the card title buttons that sit under the whole-card link (M: `scripts/t7.js`; at 390 the same, and 0 in the readers at 390). At 480 the fields are 40 px, as designed |
| 12 | Sheet hint pinned, side buttons outside | Done | Scrolling the sheet body to 1500 keeps the hint at y 876 = the sheet's bottom edge (M, S: `shots/sh1-sheet-scrolled-hint-1440.png`). The side buttons sit at x 16 to 60 and 701 to 745 for a sheet at 72 to 689 (761 wide), and 285 to 327 for a sheet from 340 at 1440: 0 px overlap with the sheet at 761, 800, 905, 1000 and 1440 (M). They still float over the dimmed cards, which is normal for a modal |
| 13 | `text-wrap: pretty` | Done | Computed `pretty` on the list summary, the reader summary and the key points; the card preview rule sets it in `Library.dc.html` line 101 (M, C) |

## 3. Regressions from moving the look into tokens.css (16 mixes, 1440 and 390)

I ran the 14 mixes of round 6 (same settings, `scripts/combos7.sh`) plus two new ones (c15 List, Sepia, Bricolage, Wide, Comfortable, Cards, Moss, Chips; c16 Grid, Light, Plex, Narrow, Roomy, Rail, Cobalt, Chips). For each I took four shots (List with Hyper's comments at 1440, Grid at 1440, List at 390, reader comments at 390) and measured contrast, 12 px text, sideways scroll and clipped text. Settings, numbers and shots: `scripts/combos7.sh`, `logs/combos.log`, `shots/combos/`, `sheets/d1..d8.png` (1440), `sheets/p1..p4.png` (390).

| Run | Mix | Result |
|---|---|---|
| c01 | List, Mono, Roomy, Lines, Dots, Cobalt, light | Works. The round-6 clipped hint is gone; it sits under the search field (`sheets/d1.png`) |
| c02 | Grid, Mono, Roomy, Cards, Chips, Rust, dark | Works; the same as round 6 |
| c03 | List, News, Compact, Cards, Chips, Moss, dark | Works; the moss selected row is a dark green block, legible |
| c04 | List, Instrument, Roomy, Rail, Text, Iris, sepia | Works; rail avatars fit |
| c05 | Grid, Bricolage, Comfortable, Cards, Text, Teal, light, images off | Works; text cards read 6 to 8 lines, even across the row |
| c06 | Grid, Plex, Compact, Rail, Chips, Rust, dark, images off | Works |
| c07 | List, Mono, Narrow, Compact, Cards, Teal, sepia | The hint is fixed. The selected row is still a cyan block on cream (P3-1) |
| c08 | Grid Sheet, Instrument, Wide, Roomy, Lines, Chips, Iris, dark | Works |
| c09 | Grid, News, Roomy, Cards, Dots, Rust, sepia | Works; salmon selected row |
| c10 | List, Bricolage, Wide, Compact, Rail, Text, Moss, dark | Works |
| c11 | Grid Sheet, Mono, Comfortable, Rail, Cobalt, Chips, sepia, images off | Works |
| c12 | List, Plex, Roomy, Cards, Chips, Iris, dark | Works |
| c13 | Grid, News, Narrow, Comfortable, Lines, Text, Teal, dark, images off | Works; the long KDE token still wraps with an ellipsis |
| c14 | List, Instrument, Compact, Cards, Dots, Moss, light | Works |
| c15 | List, Bricolage, Wide, Comfortable, Cards, Moss, Chips, sepia | Works; the moss row is a soft sage, reads warm enough |
| c16 | Grid, Plex, Narrow, Roomy, Rail, Cobalt, Chips, light | Works |

Across the 64 shots: 0 contrast failures (lowest 5.01, matching the coordinator's accent figures, which have a lowest pair of 4.89 for `--acc-ink` on `--acc-soft` for Teal in light and sepia; that pair is a link or label on the selected row and is still over 4.5), minimum text 12 px, `scrollWidth` equals the window in all 64, and no clipped text. The `R:sc-interp` clip entries in the log also appear 47 times in the round-6 log; they are a measuring artifact of the framework's wrapper element, not clipped text. Compared with the round-6 shots under `review6/design-a/shots/combos/`, the 14 shared mixes look the same except for the hint move in the Mono mixes and the slightly paler sepia tint, so the token move changed no look. 15 of 16 mixes look intended; c07 is the one that does not (Sepia plus Teal).

## 4. Priority issues

No P0, P1 or P2.

**P3-1 The Sepia selected-row tint is still cool for Teal**
Why: the third-less chroma was applied (0.045 to 0.03), but at lightness 0.895 and hue 200 the row is still rgb(198,227,228) on a cream page; it reads as a cyan block (S: `sheets/c07-v6-vs-v7.png`, `shots/combos/c07-a-list1440.png`). The comment in `tokens.css` line 203 says the tint has "a third less chroma than light's", but light's is 0.035, so it is 14% less than light's (the third was against sepia's old value). The comment is wrong.
Fix to paste: "In Sepia, build `--acc-soft` by mixing the accent with the sepia surface, for example `color-mix(in oklch, oklch(0.895 0.03 var(--ah)) 45%, var(--surface-2))`, so the selected row stays warm for Teal, Moss and Cobalt. Check List at 1440 in Sepia with Teal, Moss and Cobalt, and keep `--acc-ink` on `--acc-soft` at 4.5:1 or more. Fix the comment on `.th-sepia` to say what the value is."

**P3-2 The app container scrolled itself 217 px on one cold first load**
Why: on my first load of the List (nothing stored, 1440x900) the `.app` element had `scrollTop` 217 of 3050, so the selected Nutlope row, the "18 items" line and the top of the list were hidden above the search field (S: `shots/00-list-default-1440.png`; the round-6 first shot shows the correct state). In more than 20 later loads (fresh storage, 1440 and 1920, 6 with a blank page in between) it did not repeat (M: `scripts/sc.js`). It looks like a focus or scroll-into-view call that runs before the layout settles on a cold cache. I could not find the call in code (`Library.dc.html` has no `scrollIntoView`).
Fix to paste: "On the first render, never scroll the `.app` element. The auto-selected row must be kept visible by scrolling the list pane only, after fonts and layout are ready; set `overflow: clip` on `.app` so nothing can scroll it. Check by loading List at 1440 with an empty cache 10 times: `.app.scrollTop` must be 0 in all of them."

**P3-3 The two default sets are still written twice**
Why: `SETTINGS_DEFAULT` in `library.js` (ids) and the plain values in `tokens.css` (`plex`, `medium`, `compact`, `lines`, `cobalt`, `dots`, `on`) must agree. Round 6 noted it; the plain-value rule narrows it but does not remove it.
Fix to paste: "In the design-system document, say that `tokens.css` owns what each default option looks like and `library.js` owns which option is the default, and add one check that the option named in `SETTINGS_DEFAULT` is the one drawn when no `data-*` attribute is set."

### Fix first, before Prompt 4

1. P3-1, the Sepia tint (and its wrong comment).
2. P3-2, the first-load scroll, only because a design system should not start from a state I saw once and could not explain.

## 5. The settings panel as a product feature

| Check | Result | Evidence |
|---|---|---|
| Groups and counts | View (Layout, Open items as in Grid), Reading (Theme, Font, Text width, Density, Comment style), Cards and tags (Accent, Tag style, Card images). 4 segments at most per control | S: `shots/p1-...`, `shots/r1-...` |
| Reset look | Look keys only; Layout, Open items as and Theme stay; panel stays open | M, see item 3 |
| Phone sheet | Header, Close, footer always visible; focus returns to the gear after Close, tap outside and Escape | M, see item 2 |
| Panel font | Fixed to the default UI stack whatever Font is | M |
| Open items as under 760 | Disabled, muted, with the note | M, S |
| Compare shell | `?cmp=1` at 1920: both apps render, the Tweaks panel keeps its own look, no sideways scroll; each side keeps its own look settings | S: `shots/cmp-1920.png` |
| Hint place by width | In List the key hint is in the reader bar when it fits (1440 Plex, 1920 all fonts) and under the search field otherwise (1440 Mono, and every font from 1100 to 761). In Grid Page it is in the bar, in Grid Sheet it is pinned at the sheet's bottom edge | M: `logs/bar-list-mid.log`; S: `shots/h1-list-900.png` |

## 6. Long reads and constraints

Hyper, Agenix and Siftly each loaded from a URL, in List, Grid as Page and Grid as Sheet, at 390, 600, 1440 and 1920, rotating light, dark and sepia: 36 runs (`logs/matrix7.log`, `scripts/matrix7.sh`). Siftly alone, all 3 themes at 4 widths: 12 more runs (`logs/longread-siftly.log`).

| Check | Result |
|---|---|
| Comment fold on first render | 0 mismatches against the 8-line rule in 36 of 36 runs. Agenix after `open=` and a reload at 1440: 9 comments, 4 with a fold button, 0 bad (M) |
| Siftly tables | The 607 px settings table and the 456 px first table scroll inside their own `tabindex=0` box (456 of 358 and 607 of 358 at 390; 607 of 477 at 600 and up), with the right-edge fade (S: `shots/lr1-siftly-table-390.png`, `shots/lr2-siftly-table-1440.png`) |
| Number ranges | 3 word joiners in the Siftly text; ranges do not break across lines in the tables. Copying them includes the joiner, as Claude Design said. I did not test pasting into another app |
| Code | 14 px mono in all runs; blocks of 10, 4, 3, 7, 2 lines unfolded and the 61-line block folded with a button (the "60FB" entry in 12 runs) |
| Contrast | 0 failures in 72 readings (reader at the top and at Comments); lowest 5.7 |
| Smallest text | 12 px (13 px in 8 runs); 0 elements under 12 px |
| Targets under 480 | 0 under 44 px in the List, Grid and reader views at 390 and 479 (card title buttons excluded, because the whole-card link covers them) |
| Sideways scroll | None: `scrollWidth` equals the window in all 36 runs at 390, 600, 1440 and 1920 |
| Broken words | 1 per Siftly run in 12 runs ("Anthropic-compatible" at its hyphen), 0 elsewhere |

Not done: the full 108-combination matrix (I ran 36 rotated plus 12 Siftly plus 16 mixes plus the bar sweeps), non-text contrast, 200% zoom, a screen reader, a real phone, the open and close transitions in real time, pasting copied table cells into another app, and the 5-font check of Grid as Page and Sheet (I ran Mono and Newsreader at 1440, 1100, 600, 480 and 390, and not at 1920). Claude Design said the font reload moves the hint once; I could not see a second move in headless Chrome with the fonts cached.

## 7. Heuristic scores

Round 6's Grid as Sheet column added up to 29 from its own rows but was reported as 30; I score from the rows.

| # | Heuristic | List | Grid Page | Grid Sheet | Reason |
|---|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | 3 | Counts, progress line, paste card, "Match system · dark now" |
| 2 | Match with real world | 3 | 3 | 3 | Documents read like documents |
| 3 | User control and freedom | 4 | 4 | 4 | Close on the phone sheet, focus back to the gear, Escape in two steps, Reset look limited to the look. Sheet was 3 |
| 4 | Consistency and standards | 4 | 4 | 4 | Open items as is disabled with a note; the reset label names its scope; gear in one place. Was 3 |
| 5 | Error prevention | 3 | 3 | 3 | Reset look still has no undo (it loses only look settings) |
| 6 | Recognition over recall | 3 | 3 | 3 | Swatches still have names only in `title` and `aria-label` |
| 7 | Flexibility and efficiency | 4 | 3 | 3 | List has j, k, Enter, m, `/`; nothing opens the panel by key; Page and Sheet have no next-unread key |
| 8 | Aesthetic and minimalist | 3 | 3 | 3 | Bar and sheet buttons fixed (Sheet was 2); Sepia Teal row is still cool |
| 9 | Error recovery | 3 | 3 | 3 | Failed card stays, Escape dismisses |
| 10 | Help and documentation | 3 | 3 | 4 | The Sheet hint is pinned and always visible (was 3); in List and Page it depends on width |
| Total | | 33 | 32 | 33 | Round 6: 32, 31, 30 |

Cognitive load: the panel shows at most 9 rows in 3 groups and no control has more than 5 options. Two checklist failures remain, as in round 6: Minimal choices (the Grid filter bar shows 5 sources, 3 statuses and 2 selects at once) and Working memory (List and phone readers depend on the list). Moderate, unchanged; the new panel adds none.

Emotional journey: the start is strong (the summary card). The phone valley of round 6 (a settings sheet with no exit) is gone. The ending is still flat: there is no end-of-comments cue.

Strengths: (1) a settings panel that keeps the open item, the scroll and the reading place and now has a phone sheet that is easy to leave; (2) `tokens.css` as one source, with every look option an attribute, the breakpoints named and no fallbacks, so the system can be read from the file; (3) a reader bar that measures itself, held through 5 fonts, 3 reader styles and widths from 1920 to 390.

## 8. Persona red flags

**Alex (power user, keyboard)**
- Good: Escape closes the panel first, then the reader; focus returns to the gear; the hint is always visible in Sheet.
- No key opens the settings and no key goes to the next unread item in Page and Sheet (unchanged since round 6).
- The List hint changes place with width (bar or under the search field); a keyboard user will not mind, but the system should say so.

**Sam (accessibility)**
- Good: 0 contrast failures (lowest 5.01 in 64 mixes, 5.7 in the reader matrix), 12 px floor, focusable scrollable tables with a ring, Open items as is `aria-disabled` with its note, the sheet has a titled header (`aria-labelledby`), focus returns to the gear.
- The panel is `role="dialog"` and on a phone dims the page like a modal, but I did not test a focus trap, and did not test a screen reader.
- Accent swatches are named only by `title` and `aria-label`; the selected name is not shown on screen.
- The word joiner inside table number ranges ends up in copied text.

**Casey (phone, one thumb)**
- Good: gear and Close are 44 px, the sheet scrolls between a pinned header and footer, Reset look is always in reach, the Paste and Search fields are 44 px at 479 and below.
- A tap on the dim strip above the sheet still closes it, and the footer button sits at the bottom edge where a thumb reaches.
- The key hint does not show on a phone (no keyboard), which is right.

## 9. Can go into the design system as a rule

- A look setting is a `data-*` attribute on the app root. `tokens.css` owns what each option looks like; the default is the plain value; the script owns only ids and labels.
- Reading width = characters per line x the font's character width (`--chars` x `--cw`), in CSS.
- Breakpoints are tokens read by script into `data-bp`; a real build uses container queries.
- The reader bar measures itself and drops the hint, then the position text, then the button labels until nothing overflows; the hint moves whole or not at all; in List it is under the search field when the bar has no room.
- Under 760px the panel is a bottom sheet with a sticky 56 px header and Close, a scrolling body and a sticky footer; focus returns to the gear.
- Reset look resets the look settings only; Layout, Open items as and Theme stay; the panel stays open.
- Card images hides the card picture only, with one mechanism (`--card-media`); the reader always shows the picture.
- The panel keeps the default UI font whatever the Font setting is.
- 44 px controls under 480; 12 px smallest text; 14 px code; prose 16 px or more; `text-wrap: pretty` on summaries, previews and key points.
- A scrollable region (table, code) has `tabindex=0`, an edge fade that goes away at the end and a 2 px focus ring.
- In Sheet, the key hint is pinned at the bottom edge and the side buttons sit outside the sheet (the sheet shrinks to keep a 72 px gap).
- Fonts come from one Google Fonts `@import` at the top of `tokens.css`; a real build should self-host them (the page needs the network for all 5 pairs).
- Instrument Serif at the compact 15 px list title is thin; the system may want a minimum title size for it.

## 10. Minor observations

- The Tweaks note in Compare still says "T panel" (prototype only).
- `README.md` in the export lists only drafts-v3 and drafts-v5 checkpoints and still names `Main.dc.html` as the artboard; it does not describe `tokens.css`.
- The Siftly "Priority order" table scrolls its first column out of view at 390; a sticky first column would keep the labels.
- Mono makes the list titles in List wrap to 4 lines (the Hyper title), which is expected for a wide font.

## 11. Questions

1. Should the Sepia tint stay a lowered-chroma accent, or become a mix with the sepia surface (P3-1)?
2. Should the settings panel get a key (for example `,`) for the keyboard user?
3. Should the hint under the search field in List have its own row on every width below the bar fit, as it does now, or always live in the bar and drop at narrow widths?

## 12. Screenshots

All under `<scratch>/review7/design-a/shots/` unless noted.

- Bar fit: `b1-list-{1440,1920}-{plex,news,brico,inst,mono}.png`, `b2-sheet-1440-mono.png`, `b2-gridpage-1440-mono.png`, `b2-gridpage-390-mono.png`, `h1-list-900.png`
- Phone sheet and panel: `p1-phone-panel-open-390.png`, `p2-phone-panel-scrolled-390.png`, `o1-grid-panel-600.png`, `o1-grid-panel-390.png`, `r1-grid-sheet-panel-before-reset-1440.png`, `r2-after-reset-1440.png`
- Card images: `i1-list-images-off-1440.png`, `i1-grid-images-off-1440.png`, `i2-reader-image-with-cards-off-1440.png`
- Sheet hint: `sh1-sheet-scrolled-hint-1440.png`
- Long reads: `lr1-siftly-table-390.png`, `lr2-siftly-table-1440.png`
- Compare and first load: `cmp-1920.png`, `00-list-default-1440.png`, `f1-grid-390.png`, `empty-390.png`
- Mixes: `combos/c01..c16-{a-list1440,b-grid1440,c-list390,d-read390}.png`; contact sheets `../sheets/d1..d8.png` (1440) and `../sheets/p1..p4.png` (390); the Sepia comparison `../sheets/c07-v6-vs-v7.png`
- Scripts and logs: `../scripts/` (`go.sh`, `combo.sh`, `combos7.sh`, `matrix7.sh`, `bar.js`, `sheet.js`, `t7.js`, `lr.js`, `sc.js`), `../logs/` (`bar-list.log`, `bar-list-mid.log`, `bar-list-phone.log`, `bar-grid.log`, `combos.log`, `matrix7.log`, `longread-siftly.log`)
