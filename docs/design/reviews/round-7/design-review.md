# Assessment A (round 7): design review of the Library prototype

Target: the prototype at canvas v26, before Prompt 4 built the design system. Method: the live page in a browser (measured values), screenshots, and the code. The round-6 review, the round-6 prompt (3h in `docs/design/claude-design-prompts.md`) and the spec were read first.

## Verdict

Ready to be the source for Prompt 4: no P0, P1 or P2. All 13 items of the round-6 prompt work, except item 10 (the Sepia tint), which is done as written but too weak to change how Teal looks on sepia (P3-1). The two round-6 P2 items (the Mono reader bar and the phone settings sheet) were fixed and could not be broken at any width tried.

What was measured:

- 16 settings mixes at 1440 and 390 (64 shots): 0 contrast failures (lowest 5.01:1), 12px minimum text, no sideways scroll, no clipped text. 15 of 16 looked intended; the one that did not was Sepia with Teal.
- Hyper Solutions, Agenix and Siftly in List, Grid as Page and Grid as Sheet at 390, 600, 1440 and 1920 (36 runs): the comment fold matched the 8-line rule in all 36 runs, including first render and reload. 0 contrast failures in 72 readings (lowest 5.7:1), 0 targets under 44px at 390 and 479, `scrollWidth` equal to the window in all runs.
- The reader bar in List with all 5 fonts at 1440 and 1920, and with Mono, Bricolage and Plex down to 390: 0 overlaps and 0 clipped children. In List the key hint shows in the bar when it fits and under the search field otherwise. Grid as Page keeps it in the bar, and Grid as Sheet pins it to the sheet's bottom edge.

## P3 findings

**P3-1: the Sepia selected-row tint is still cool for Teal.** The chroma went from 0.045 to 0.03, but at lightness 0.895 and hue 200 the selected row moved only from rgb(187,230,232) to rgb(198,227,228) on a cream page of rgb(246,237,219), which still reads as a cyan block. Moss and Cobalt were acceptable. The comment in `tokens.css` said "a third less chroma than light's", but light's value is 0.035, so the new value is 14% less than light's (the third was against sepia's old value). This became known issue 13 of Prompt 4: mix the accent tint with the sepia surface.

**P3-2: the app container scrolled itself 217px on one cold first load.** On the first load of List (nothing stored, 1440x900) `.app` had `scrollTop` 217 of 3050, which hid the selected row and the top of the list. It did not repeat in 21 further loads, and no `scrollIntoView` call was found in the code. This became known issue 14 of Prompt 4: scroll only the list pane, and set `overflow: clip` on the app root.

**P3-3: the default option was written twice.** `SETTINGS_DEFAULT` in `library.js` and the plain values in `tokens.css` must agree, and the plain-value rule narrows the risk without removing it. This became known issue 15 of Prompt 4: `tokens.css` owns what each default looks like, the settings table owns which option is the default, and one check confirms they agree.

## Weaknesses the review recorded and Prompt 4 did not take

- **Reset look has no undo.** It loses only look settings, so the review scored it a low risk.
- **The accent swatches are named only by `title` and `aria-label`.** The selected name is not shown on screen.
- **No key opens the settings panel, and Page and Sheet have no next-unread key.** List has j, k, Enter, m and `/`.
- **The Filters bar in Grid shows 5 sources, 3 statuses and 2 selects at once** (the checklist item "Minimal choices"), and the List and phone readers depend on the list (the checklist item "Working memory").
- **There is no end-of-comments cue.**
- **The Siftly "Priority order" table scrolls its first column out of view at 390.** A sticky first column would keep the labels.
- **Instrument Serif at the compact 15px list title is thin.** The system may want a minimum title size for it.
- **The panel is `role="dialog"` and dims the page on a phone like a modal, but no focus trap or screen reader was tested.**

## Not done

The full 108-combination matrix, non-text contrast, 200% zoom, a screen reader, a real phone, the open and close transitions in real time, pasting copied table cells into another app, and the 5-font check of Grid as Page and Sheet at 1920.

## Questions the review asked

1. Should the Sepia tint stay a lowered-chroma accent, or become a mix with the sepia surface? (Prompt 4 chose the mix.)
2. Should the settings panel get a key (for example `,`) for the keyboard user?
3. Should the List hint under the search field have its own row on every width below the bar fit, as it does, or always live in the bar and drop at narrow widths?
