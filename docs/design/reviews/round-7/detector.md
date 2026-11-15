# Assessment B (round 7): detector and browser evidence

Target: the prototype before Prompt 4 built the design system (10 `.dc.html` files plus `tokens.css`). Method: `impeccable detect --json` on each file, and the detector overlay injected into 23 browser views (List, Grid Page, Grid Sheet, the settings panel, the phone sheet, Compare and 4 settings mixes, each with and without an open item). The CLI reports `line: 0` for every `.dc.html` finding.

Net: the straggler findings (a last line of one short word) are gone from every view, because `text-wrap: pretty` is back on summaries, card previews and key points. The rest is the round-6 list. No page error, console warning or failed request on any of the 23 views, and `scrollWidth` equals `innerWidth` on every view.

## Real findings

- **Nested card in Sheet.** `aside.rd-agent` (1px border, 14px radius, 16px padding) sits inside `div.reader-slot` (1px border, 14px radius, shadow). With Cards comments, 2 `div.cm-card` nest there too (3 findings). Page does not trip it, and Cards is correct on its own, so the nesting comes from the Sheet frame. Minor. This became known issue 10 of Prompt 4.
- **Chips tags have 1px of inset above and below the text.** `.tg-chips .tag` has `padding: 0 var(--s2)` and a 1px border around an 18.85px line box. The detector reports `cramped-padding` on `span.tag` (45 per Grid view, 47 in a Sheet), only when Chips is chosen. Low. This became known issue 11 of Prompt 4.
- **Short last lines in the markdown body.** `.md p`, `blockquote` and `li` computed `text-wrap: auto` and had 5 to 16 lone last words per reader (for example "computed." at 17% of the measure). The detector never flags them, even when one is centred in the viewport, so it never judged them. Low. The same `text-wrap: pretty` as on summaries fixes it, and `.md p, .md li, .md blockquote` now carry it in `design/system/components.css`.
- **12px section labels sit above 20px markdown headings.** The outline is H2 (title) > H3 (Key points, Original post, Comments: 12px, weight 600, uppercase) > H4 (markdown levels 1 and 2: 20px) > H5 (17px). No level is skipped, but a screen reader and a sighted user see different hierarchies, and the 12px H3 is smaller than the 17px body. Low, not flagged by the detector. This became known issue 12 of Prompt 4.
- **Teal and Rust text on sepia need a manual contrast check.** The detector reported 3.2:1 for Teal (`#006770`) and 3.9:1 for Rust (`#8c3406`), but on the wrong background (see the first false positive below). The real ratio against the sepia reader background was not computed. Cobalt, Moss and Iris on sepia were not checked either.
- **A table that scrolls sideways is marked, and one that fits is not.** Siftly at Medium has 5 tables. The 607px "Setting / Env Var / Description" table scrolls 130px and has `tabindex="0"` and `role="region"`. The four that fit have neither.

## False positives, with the cause

- **`low-contrast` on `li.cm` (3.2 to 4.0:1).** The detector reads the colour of the 1px indent stripe (`--cm-guide`, the first 1px of a `min(22px, 25%)` tile) as the whole `li` background. The same cause has produced the finding in every round.
- **`repeating-stripes-gradient` in all 10 files.** It is the threaded-comment indent guide in `tokens.css`, not surface decoration, and it spread to every file because they all link `tokens.css`.
- **`icon-tile-stack` "View".** The 44x44 gear and the first group heading of the open popover are siblings, not an icon above a heading in a card. The finding is gone in the 390px sheet.
- **`em-dash-overuse` (51 em-dashes) on the Siftly README.** It is saved product content, not UI copy.
- **`cramped-padding` on `.rd-bar`, `.st-head`, `.tool`, `.pane-label`, `.media-ph`, `.cm-ctx`, `.fl-seg`, `.st-seg`, `.tw-seg` and `.tw-chip`.** None appears in any overlay view. `.rd-bar` uses a `calc()` padding the template scan cannot resolve, and the 56px `.st-head` with a 44px Close renders with 6px above and below.
- **`overused-font` (`tokens.css` and the Instrument and Newsreader pairs: "geist 91 to 93%", "instrument sans 65 to 87%").** It appears only for a non-default pair among the five offered. Geist and Instrument Sans are on the detector's overused list, and the default, Plex, is never flagged. A design choice, not a defect.

## Straggler check

The overlay skips a rule where `text-wrap: pretty` is computed, so last lines were measured separately (first rendered line against the last word of each `p`, `li`, `dd`, `blockquote` and `figcaption`, ignoring clamped previews). Elements with `pretty` (`.it-sum`, `.rd-summary`, `.rd-points li`) had 0 lone last words at 1440, 600 and 1920. The one exception is `.it-sum` "KWIN_DRM_USE_COLOR_PIPELINE=1." at 390 and 1920, which is one unbreakable 30-character token, not a straggler.
