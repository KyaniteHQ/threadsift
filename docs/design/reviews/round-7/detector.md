# Assessment B (round 7): detector and browser evidence

Target: <scratch>/design-v7/ (10 `.dc.html` files plus `tokens.css`), served on 127.0.0.1:8771. Raw evidence is in this folder: `detect-<file>.json` and `.err` (CLI), `overlay-<view>.txt` and `plain-<view>.txt` (console, page errors, network with and without the overlay), `shot-<view>.png` and `shot-<view>-nooverlay.png`, `state-*.txt`, `targets-*.txt` (elements behind findings), `m7-*.txt` and `lab7-*.json` (nested card chain, headings), `strag-*.txt` and `strag.log` (my own last-line measurement), `scroll-straggler-hyper.txt`, `scrollmid-*.txt`, `mtimes-before.txt` and `mtimes-after.txt`, `scripts/` (exact runners).

Net: the straggler findings are gone from every view, because `text-wrap: pretty` is back on summaries, card previews and key points. The rest is the round 6 list: one nested card in Sheet (three with Cards comments), Chips tag padding, the 12 px labels above 20 px headings, and the same false positives. Two things are new: the `repeating-stripes-gradient` CLI finding now appears in every file that links `tokens.css`, and the Teal accent on sepia reads 3.2:1 on `li.cm` (same stripe cause, but see classification). No page error, console warning or failed request on any of 23 views. No Settings-mix produces a finding that the earlier rounds did not already show, apart from the two font findings below.

## 1. CLI scan

`impeccable detect --json` per file (exit 0 = clean in the CLI sense, 2 = findings); `line: 0` on every `.dc.html` finding, as before. `tokens.css` was scanned because you asked, although the reference says not to pass CSS-only files.

| File | Exit | Findings |
| --- | --- | --- |
| Main.dc.html | 2 | 2 |
| Settings.dc.html | 2 | 3 |
| Reader.dc.html | 2 | 7 |
| Filters.dc.html | 2 | 3 |
| Tweaks.dc.html | 2 | 3 |
| tokens.css | 2 | 1 |
| Library.dc.html | 0 | 1 |
| PasteStatus.dc.html | 0 | 1 |
| Inline.dc.html | 0 | 1 |
| Text.dc.html | 0 | 1 |
| Picture.dc.html | 0 | 1 |

- Main: cramped-padding on `.tool` and `.pane-label`. Filters: `.fl-seg` x2. Tweaks: `.tw-seg` x2, `.tw-chip`. Same as round 6.
- Settings: cramped-padding on `.st-head` (new) and `.st-seg`.
- Reader: low-contrast x3 (3.8, 3.7, 3.8:1, text on `#babec3`, "gradient on li.cm"; new in the CLI), cramped-padding on `.rd-bar`, `.media-ph`, `.cm-ctx`.
- repeating-stripes-gradient: reported once in each of the 10 `.dc.html` files (it was Reader only in round 6, and Library read clean). The cause is the two `--cm-guide` variables at `tokens.css` L131 and L143, which every file picks up through `<link rel="stylesheet" href="./tokens.css">`. Library, PasteStatus, Inline, Text and Picture have only this finding, and still exit 0.
- tokens.css (line 1): overused-font "Google Fonts: instrument sans". The `@import` loads all five font pairs the Font setting offers; the default is Plex.
- The grep count of `text-wrap` is 2 in Library.dc.html (L100 `.it-sum`, L101 `.it-snip`) and 2 in Reader.dc.html (L68 `.rd-summary`, L69 `.rd-points`), 0 elsewhere.

## 2. Browser overlay

Session `9a139206-7104-4656-8d25-47a87f500809-detector-b7`, 1440x900 (390x844 for the phone views). Preflight: `document.title` and an appended `<script>` took effect (`["probe-x",1]`). Live server on port 8400, `http://localhost:8400/detect.js` injected per view, 3 s wait. Per view: localStorage cleared and `library:settings` set, page loaded, then loaded again with console, errors and network cleared (plain pass), then the overlay injected. `tw=0` everywhere except the paste view (Tweaks "Paste" then "Failed", then its X) and Compare (`cmp=1`, Tweaks open). Counts are the overlay's group header.

| View | Settings | Overlay result |
| --- | --- | --- |
| List light | list, page, light | clean |
| List, Hyper, Mono | list, page, light, mono | 2: low-contrast 3.8:1 and 3.7:1 `li.cm` |
| List, settings panel open | list, page, light | 1: icon-tile-stack "View" |
| Grid Sheet, Agenix, panel from reader bar | grid, sheet, dark | 3: nested-cards x1, low-contrast 4.0:1 `li.cm`, icon-tile-stack "View" |
| Grid Page, Hyper, sepia | grid, page, sepia | 2: low-contrast 3.7:1 x2 `li.cm` |
| Grid Sheet, Agenix, dark, after reload | grid, sheet, dark | 2: nested-cards x1, low-contrast 4.0:1 |
| List, Siftly README | list, page, light | 1: em-dash-overuse "51 em-dashes in body text" |
| Mix 1, no item open | grid, page, mono, roomy, cards, chips, dark | 45: cramped-padding on `span.tag` |
| Mix 1, Hyper in Page | same | 2: cramped-padding on `span.tag` |
| Mix 1, Hyper in Sheet | grid, sheet, same | 50: `span.tag` x47, nested-cards x3 (`aside.rd-agent`, `div.cm-card` x2) |
| Mix 2, no item open | grid, page, Instrument, compact, rail, text, Rust, sepia | 1: overused-font "geist (93% of text)" |
| Mix 2, Hyper in Page | same | 3: overused-font geist 91%, low-contrast 3.9:1 (Rust text `#8c3406`) and 3.7:1 |
| Mix 2, Hyper in Sheet | grid, sheet, same | 4: the three above plus nested-cards x1 |
| Mix 3, no item open | grid, page, Bricolage, comfortable, images off, light | clean |
| Mix 3, Hyper in Page | same | 2: low-contrast 3.8:1 and 3.7:1 `li.cm` |
| Mix 3, Hyper in Sheet | grid, sheet, same | 3: low-contrast x2, nested-cards x1 |
| Mix 4, no item open | grid, page, Newsreader, wide, Teal, sepia | 1: overused-font "instrument sans (87% of text)" |
| Mix 4, Hyper in Page | same | 2: low-contrast 3.7:1 and 3.2:1 (Teal text `#006770`) |
| Mix 4, Hyper in Sheet | grid, sheet, same | 4: overused-font instrument sans 65%, low-contrast x2, nested-cards x1 |
| Settings bottom sheet, List, 390x844, scrolled to the middle | list, page, light | clean |
| Settings bottom sheet, Grid, 390x844, scrolled to the middle | grid, page, light | clean |
| Grid paste failed, 390x844 | grid, page, light | clean |
| Compare (`cmp=1`), 1440 | left list/page/light | clean |

Page errors, console and network:
- `agent-browser errors` was empty on all 23 views, with and without the overlay. The plain console (after `console --clear` and a reload) printed nothing on all 23: no warning, no error. The overlay pass printed only `impeccable` groups and logs, no `warn` or `error` entries.
- Network (no overlay): 0 requests with status 400 to 599 on all 23 views (26 to 39 requests per view).
- `document.documentElement.scrollWidth` equals `innerWidth` on every view (1440 or 390). No sideways page scroll.
- The phone sheet scrolled to the middle (`.st-body` scrollTop 184 of 368 in List, 134 of 267 in Grid): the 56 px header with "Settings" and the Close button, and the footer with "Reset look", both stay on screen (screenshot `shot-list-settings-sheet-m.png`). No overlay finding.
- In List with no `open`, the app opens the first item (`gh-nutlope-gloss`) by itself, so "List light" is the Gloss reader.

Elements behind findings (`targets-*.txt`, `m7-*.txt`):
- icon-tile-stack: the 44x44 gear (`.st-gear`) and `h2.st-gh` "View" in the open popover.
- nested-cards in Sheet: `aside.rd-agent` (1 px border, 14 px radius, 16 px padding, no shadow) inside `div.reader-slot` (1 px border, 14 px radius, shadow). With Cards comments, `div.cm-card` (12 px 16 px padding, opaque) also sits inside it. In Page the chain has only the agent card (no `reader-slot`), so Page does not trip it.
- tags with Chips: `span.tag`, padding `0 8px`, 20.8 px tall, 13 px text, line height 18.85 px, 1 px border. Dots and Text tags have no box (padding 0, border 0, 18.8 px).

## 3. Classification

Real:
- nested-cards in Sheet (x1 with Lines, Rail comments; x3 with Cards in Hyper; Agenix has 9 `cm-card` in the DOM): the agent card is a bordered, rounded, 16 px padded box inside the Sheet's bordered, shadowed container, and with Cards the comment cards nest there too. Real, minor, unchanged since round 5. The Cards option is correct on its own (Mix 1 in Page: no nested-cards); the nesting comes from the Sheet frame.
- cramped-padding on `span.tag` with Chips (45 per grid view, 2 in a Page reader, 47 in a Sheet): the rule is `.tg-chips .tag` with `padding: 0 var(--s2)` and a 1 px border, so there is 1 px of inset above and below an 18.85 px line box. Borderline, low, appears only when Chips is chosen. Same as round 6.
- Straggler-style short last lines in the markdown body, not a detector finding: see section 4.
- Heading label size, not a detector finding: see section 4.
- low-contrast with the Teal accent on sepia, 3.2:1 (`#006770` on `#c2b19c`): the background is again the indent-guide stripe colour (false positive in cause), but the real background of that text is the sepia reader background, so I did not compute the real ratio here. Teal on sepia is the one accent worth a manual contrast check; Rust at 3.9:1 has the same caveat.

False positive:
- low-contrast on `li.cm` (4.0:1 dark, 3.7:1 sepia, 3.8 and 3.7:1 light, 3.9:1 Rust, 3.2:1 Teal): same cause as rounds 1 to 6. The detector takes the colour of the 1 px indent stripe (`--cm-guide`, the first 1 px of a `min(22px, 25%)` tile) as the whole `li` background. The CLI now reports the same thing three times in Reader.
- repeating-stripes-gradient in all 10 files: the threaded-comment indent guide in `tokens.css`, not surface decoration. It only spread across files because they all link `tokens.css`.
- icon-tile-stack "View": the gear button and the first popover group heading are siblings but not an icon above a heading in a card; gone in the 390 sheet.
- em-dash-overuse "51 em-dashes in body text" on the Siftly README: saved product content, not UI copy.
- CLI cramped-padding on `.rd-bar` (padding is a `calc()` the template scan cannot resolve), `.st-head` (padding on a flex header whose children carry the inset; the 56 px header with a 44 px Close renders with 6 px above and below), `.tool`, `.pane-label`, `.media-ph`, `.cm-ctx`, `.fl-seg`, `.st-seg`, `.tw-seg`, `.tw-chip`: none appears in any overlay view; same reasons as round 6.
- overused-font: tokens.css (instrument sans), and the browser findings "geist 91 to 93%" (Instrument font) and "instrument sans 65 to 87%" (Newsreader font, whose sans half is Instrument Sans). Both come from choosing a non-default pair; the default Plex is never flagged. Design choice among five offered pairs; Geist and Instrument Sans are on the detector's overused list.

## 4. Specific checks

Stragglers with `text-wrap: pretty`: the overlay reports none on any of the 23 views (round 6: 8 cases on 8 views). The overlay skips the rule where `text-wrap: pretty` is computed (the served `detect.js` tests `CSS.supports('text-wrap', 'pretty')`). I measured last lines myself (`scripts/strag.js`, first rendered line against the last word of each `p`, `li`, `dd`, `blockquote`, `figcaption`, ignoring clamped previews):
- Elements with `pretty` (`.it-sum`, `.rd-summary`, `.rd-points li`): 0 lone last words at 1440, 600 and 1920 in Grid, in List with Hyper/Mono/Newsreader, in Siftly, in Agenix Sheet and in Compare, with Plex and Instrument. The one exception is `.it-sum` "KWIN_DRM_USE_COLOR_PIPELINE=1." at 390 and 1920 (93 to 100% of the measure): one 30 character unbreakable token, not a straggler. Round 6's cases ("mindmap.", "git.", "replies.", "reply)", "AI", "work.") are fixed.
- Markdown body (`.md p`, `blockquote`, `li`, computed `text-wrap: auto`): 5 to 16 lone last words per reader (Hyper Page sepia 16, Mono 14, Newsreader 12, Bricolage Narrow 12; Siftly 9; Agenix Sheet 5; Compare 7), for example "computed." (17% of the measure), "payloads." (15%), "ZIP" (6%). The overlay does not flag them, also when one is on screen (`scroll-straggler-hyper.txt`: "computed." centred in the viewport, overlay shows only the two low-contrast lines), so the detector never judged them, in round 6 either. They are real by the same measure that made round 6's cases real; adding `text-wrap: pretty` to `.md p, .md li, .md blockquote` would match the rest.

Sheet nested card: one finding with Lines (`aside.rd-agent` inside `div.reader-slot`); with Cards, 3 findings (agent card plus 2 of the cards listed in `cmCardN`). Comments are flat under Lines and Rail (`li.cm` has no border, radius or background).

12 px labels above 20 px headings: still present, low, not flagged by the detector (`lab7-*.json`). The outline is H2 (title: 24 px in List, 30 px in Grid Page, 27.6 px in a Mono Sheet) > H3 (Key points, Original post or Repository and README, Comments: 12 px, weight 600, uppercase, letter spacing 0.72 px) > H4 (markdown level 1 and 2: 20 px, weight 700) > H5 (17 px, 700). Hyper: H3 x3, H4 x12. Siftly: H3 x3, H4 x13, H5 x22. No level is skipped. The 12 px H3 sits directly above 20 px H4 headings, so the visual order is the reverse of the outline order, and the H3 is smaller than the 17 px body. The popover repeats the pattern (`h2.st-gh` 12 px above 13 px row labels). It is a consistent small-caps section label with enough weight and contrast; the gap is that a screen reader and a sighted user see different hierarchies.

Chip padding: see section 3. Cards comments nested in Sheet: see the nested-cards bullet. Table cue: Siftly at Medium (477 px column) has 5 tables; the "Setting / Env Var / Description" one is 607 px wide, so it scrolls 130 px and has `tabindex="0"` and `role="region"`; the four that fit have neither (`lab7-siftly-grid-light.json`).

Settings mixes: no new finding beyond the font ones.
- Mix 1 (Mono, Roomy, Cards, Chips, dark): tag cramped-padding (45, 2, 47) and nested-cards x3 in Sheet. No console output, no overflow.
- Mix 2 (Instrument, Compact, Rail, Text tags, Rust, sepia): overused-font geist, `li.cm` low-contrast 3.9 and 3.7:1, nested card in Sheet. Rail, Text tags and the non-default accent add nothing.
- Mix 3 (Bricolage, Comfortable, images off, Grid light): clean with no item open; with Hyper the baseline `li.cm` and Sheet findings. Images off adds nothing.
- Mix 4 (Newsreader, Wide, Teal, sepia): overused-font instrument sans, `li.cm` low-contrast including Teal 3.2:1, nested card in Sheet. Wide adds nothing.

## 5. Comparison with round 6 (<scratch>/review6/detector-b/detector.md)

Gone:
- straggler on `.it-sum`, key points, Siftly summary, Compare and Hyper: gone on all views (pretty is back). Only `.it-sum` with one unbreakable token remains in my measure, not a straggler.
- CLI cramped-padding on `.rd-bar` count unchanged (still false positive); Compare now clean in the overlay (round 6: 3 stragglers).
- Grid and List settings sheets at 390: icon-tile-stack and straggler "replies." gone; both read clean.
- Paste failed at 390: clean (round 6: 1 straggler).

Remaining (same classification):
- nested-cards in Sheet (1, or 3 with Cards): real, minor.
- Chips tags cramped-padding (45 to 47): real, low.
- 12 px labels above 20 px headings: real, low, not detector-flagged.
- low-contrast `li.cm`, em-dash-overuse (51), icon-tile-stack "View" with a popover open, CLI cramped-padding on `.tool`, `.pane-label`, `.media-ph`, `.cm-ctx`, `.fl-seg`, `.st-seg`, `.tw-seg`, `.tw-chip`, `.rd-bar`: false positives.
- overused-font (tokens.css and the Instrument font): user choice.

New:
- repeating-stripes-gradient in every `.dc.html` (false positive; the guide now lives in `tokens.css`, which all files link).
- CLI low-contrast x3 in Reader (false positive, same stripe), CLI cramped-padding on `.st-head` (false positive).
- overused-font "instrument sans" with the Newsreader font (Mix 4; user choice).
- Teal (3.2:1) and Rust (3.9:1) accents on sepia read lower than Cobalt on `li.cm`; same stripe false positive, but worth a manual contrast check.
- Markdown body lone last words (real, low; not detector-flagged, so not new in the page, only newly visible now that previews are fixed).

## 6. Run notes and cleanup

- No skipped steps. Screenshots reviewed: List settings bottom sheet at 390 scrolled to the middle.
- `impeccable live-server stop --keep-inject` printed "Stopped live server on port 8400"; `curl localhost:8400/detect.js` returned 000. The `.impeccable` folder held 0 files (empty `live/sessions`, `live/annotations`, `live`) and was removed with `rmdir`. `ls -l` mtimes of every `.dc.html`, `library.js`, `data.json` and `tokens.css` are identical before and after (`mtimes-before.txt`, `mtimes-after.txt`), and Main.dc.html, Library.dc.html, tokens.css and library.js hold 0 `impeccable` strings.
- Session closed ("Browser closed"). The python server on 8771 still returns 200. localStorage was set and cleared only in my own throwaway session. No file landed in design-v7.
- The Teal contrast and the real ratio of `li.cm` text on the reader background were not computed; I did not check Cobalt, Moss and Iris on sepia either.
