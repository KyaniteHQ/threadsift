---
name: Threadsift
description: A reading library where saved threads, posts, repos and articles read as their useful part.
colors:
  cobalt: "oklch(0.50 0.14 258)"
  cobalt-ink: "oklch(0.47 0.14 258)"
  cobalt-soft: "oklch(0.935 0.035 258)"
  on-accent: "oklch(0.99 0 0)"
  bg: "oklch(0.976 0.008 255)"
  surface: "oklch(0.995 0.004 255)"
  surface-2: "oklch(0.948 0.008 255)"
  press: "oklch(0.919 0.008 255)"
  line: "oklch(0.89 0.008 255)"
  line-2: "oklch(0.80 0.008 255)"
  ctl-line: "oklch(0.60 0.008 255)"
  text: "oklch(0.22 0.008 255)"
  muted: "oklch(0.46 0.008 255)"
  ok: "oklch(0.47 0.12 150)"
  warn: "oklch(0.50 0.16 35)"
typography:
  display:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  body-list:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
  code:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  r1: "4px"
  r2: "8px"
  r3: "14px"
  r4: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "0 12px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.surface-2}"
  button-press:
    backgroundColor: "{colors.press}"
  button-accent:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.r2}"
    padding: "0 12px"
    height: "34px"
  button-plain:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    height: "34px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "0 12px"
    height: "40px"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "0 12px"
    height: "34px"
  filter-chip-pressed:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
  segment-pressed:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.r1}"
    height: "30px"
  filter-row-pressed:
    backgroundColor: "{colors.cobalt-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    height: "32px"
  list-row:
    textColor: "{colors.text}"
    padding: "9px 16px 9px 12px"
  list-row-hover:
    backgroundColor: "{colors.surface-2}"
  list-row-press:
    backgroundColor: "{colors.press}"
  list-row-open:
    backgroundColor: "{colors.cobalt-soft}"
  grid-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.r3}"
  summary-box:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.r3}"
    padding: "16px"
  tag-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.r4}"
    padding: "2px 8px"
---

# Design System: Threadsift

## Overview

**Creative North Star: "The Reading Room"**

Threadsift is a quiet library room. The saved text leads, and the interface stays in the background. The mood is quiet, bookish and exact. Chrome is drawn in near-white surfaces, cool greys and hairlines, and one accent hue marks state. The reading column holds post and comment text at one size and one line length. The metadata, controls and lists around it are smaller and greyer than that text.

The look is not one preset. Every Look setting is a `data-*` attribute on the app root, and each option swaps a set of tokens; Theme and Layout are attributes on the same root. `design/system/tokens.css` is the source every value is read from, except the literal values its header lists, and `design/system/settings-table.ts` owns the list of settings and which option is the default. The tokens in this file record the default look: Light theme, the Plex font pair, Cobalt accent, Medium text size, Medium text width, Compact density and the List layout.

Density is compact by default, because a library with hundreds of saves needs many rows on screen, but the reading column never gets denser with it. Components are refined and restrained. Two looks are rejected. One is a social feed: Reddit's or X's own chrome, with vote arrows, avatars ahead of the item title, and engagement counts as the loudest thing on a row. The other is a SaaS dashboard: gradient hero cards, number tiles and icons in coloured circles.

**Key Characteristics:**
- One accent hue on cool or warm neutrals. The theme sets the accent's lightness and chroma.
- One reading size and one capped line length for post, comment and summary text.
- Flat hairline structure in List. Soft shadows sit only on Grid cards and floating layers.
- Every value is a token, except the literal values the `design/system/tokens.css` header lists, and every Look option is a token swap on the app root.
- The app answers to its own width, through `data-bp`, in five bands.

## Colors

The palette is near-white surfaces with a faint cool tint, ink-dark text, and a single accent that carries every selected, unread, focused and linked state.

### Primary
- **Cobalt** (`cobalt`): the default accent. Rust, Moss, Iris and Teal are the other four accents. Each changes only the hue (`--ah`).
- **Cobalt ink** (`cobalt-ink`): the accent as text and outline (links, the focus ring, the focused field's border), because it holds 4.5:1 as text. It is darker than the fill in Light and Sepia and lighter than it in Dark.
- **Cobalt soft** (`cobalt-soft`): the accent's pale tint, for selected areas such as the open row and the selected filter row. In Sepia this tint is mixed into the paper colour, so it reads as a warm grey, a cream or a faint sage, never a blue block.
- **On accent** (`on-accent`): text and icons on a full accent fill.

### Neutral
- **Page** (`bg`), **Surface** (`surface`) and **Sunk surface** (`surface-2`): the app background; controls, cards and boxes; and hover fills, the List sidebar, code and tag chips.
- **Press fill** (`press`): the fill of a control while it is pressed, one step past the hover fill. Outside forced colours, a pressed selected filter row, filter segment or List row mixes the same step into the accent tint.
- **Hairline** (`line`) and **Strong hairline** (`line-2`): row dividers and container edges; the heavier lines (comment indent guides, segmented control frames, the settings panel and the paste card).
- **Control line** (`ctl-line`): the edge of buttons, fields and selects, and the ring of an empty unread dot.
- **Ink** (`text`) and **Muted ink** (`muted`): primary text; metadata, counts, labels, hints and placeholders.
- **Status** (`ok`, `warn`): the paste card's done and failed tones, used as text colour only. A saved Item that carries a note, such as a missing title, uses the warn tone and icon instead of the done check.

Dark and Sepia redefine every neutral and the accent's lightness and chroma in `design/system/tokens.css`. Grid tilts the greys toward violet (`--nh`, `--nc`), and Sepia ignores that tilt. Tags take one of eight hues at a fixed chroma (`--tag-c`), shown only as a dot before the name in the default Tag style.

### Named Rules
**The One Accent Rule.** The accent is the one colour that marks selection, action and state. The tag hues, the paste card's status tones, the `warn` colour of field errors, delete buttons and the failure mark on an Item row, and the accent swatches in the settings panel are the only other colours in the chrome. A full accent fill covers nothing larger than a control, a dot or a bar. A larger selected area, such as the open row, takes the soft tint.

**The Theme Owns Lightness Rule.** An accent sets hue only. Each theme sets the accent's lightness and chroma (`--acc-l`, `--acc-c`, `--acc-ink`), so every accent meets the contrast floor in every theme without its own per-theme values.

## Typography

IBM Plex Sans sets titles, lists, labels and reading text, and IBM Plex Mono sets code. The Font setting swaps in four other pairs.

### Hierarchy
- **Display** (`--t-display`): the wordmark (in the app bar and on the sign-in screen), the reader title, the page headings such as Settings and Import, and the empty-library heading. It scales to 0.85 under 760px, except that the reader title and the page headings never go under `--rd-title-min` (1.1) times Headline, 22px at the default 16px browser font, so the reader title stays the largest heading in the Reader and a page heading stays above the section headings on its page, in every Font and Style. The two wordmarks and the empty-library heading keep the 0.85 scale. These three have no minimum against Headline, because they are not reading headings, so at a very small browser font they can fall under it; only the 12px text floor holds them.
- **Headline** (`--t-h2`): reader section headings such as Original post, Comments and README, and the heading of each sign-in and setup screen. It is never under the 16px reading floor divided by `--post-h-cap`, about 16.84px, so a heading inside a post keeps the floor too.
- **Title** (`--t-title`): item titles in rows and cards. An unread item's title takes `--dw-strong`, which each Font and Style sets: 700 in the default Plex pair. Instrument Serif and the Cal.com Style have one display weight, so there an unread title keeps the read weight and the unread dot alone marks it, in the Item list, in Grid and on a Topic page. A row with no title shows its link in the title slot on one line with an end ellipsis; the paste card shows the pasted link in full, wrapped.
- **Body** (`--t-read`): post and comment text in the reading column, up to 62 average characters a line at Medium text width (56 Narrow, 68 Wide). The reader's summary and key points use the same size at line height 1.5 (`--lh-text`).
- **Body list**: the interface text of fields, dialogs, page sections and the Highlights and Proposals lists. Comfortable and Roomy density raise it.
- **Meta** (`--t-meta`): the app's default UI size, for metadata, buttons, filters and bylines.
- **Label** (`--t-label`, uppercase): names of controls, filter groups, settings groups and data fields such as Stars and Language.
- **Code** (`--t-code`): code blocks. Inline code keeps the size of the text around it.

Type sizes are in rem, so the browser's own font size scales them, and the pixel values above are the ones at its default of 16px. Text size (`--tz`) multiplies the title, list body and reading sizes. Reading text keeps its 16px floor (`--t-floor`) at Small, and Headline keeps the floor divided by `--post-h-cap` (about 16.84px), so a heading inside a post is never under 16px; the minimum only takes effect at a browser font under about 13.5px. Label and meta text never scale with Text size, and every text size (`--t-label`, `--t-meta`, `--t-code`, `--t-body`, `--t-title` and `--t-display`) keeps a 12px floor (`--t-floor-ui`), so no text is under 12px at any browser font. Under 480px the text of the paste field and selects is at least 16px, because iOS Safari zooms the page when a focused field's text is smaller.

### Named Rules
**The One Reading Size Rule.** Post, comment and summary text share one size (`--t-read`). Headings inside a post render at that same size, but never over `--post-h-cap` (0.95) times Headline, so the reader's section headings (`--t-h2`) always outrank them, at a Large Text size too, and the page reads in outline order.

**The Plain Panel Rule.** The settings panel keeps the Plex pair whatever the Font setting is, so the controls that change the font never move.

## Layout

Spacing runs on six steps (`s1` to `s6`). Density multiplies the vertical spacing of list rows and cards (`--k`) and changes list text size. It never changes the Reader's post, comment and summary text (`--t-read`). The Highlights list and the Note box in the Reader, and the Highlights page, follow it.

List is three panes: the sidebar (wordmark, paste box and filter rail), the item list and the reader pane. Under `--bp-medium` the sidebar becomes a header above the list. Under `--bp-narrow` everything stacks into one column and items open full page. Grid is a header row (wordmark, search, paste box), a filter bar, then a card grid centred at most `--page-max` wide. In Grid, an item opens as a full page or as a sheet over the dimmed grid, with Previous and Next buttons outside the sheet.

The app measures its own width and writes every band it is under to `data-bp` (`--bp-phone`, `--bp-narrow`, `--bp-medium` and `--bp-wide`). Components read that attribute instead of media queries, so a preview can draw the phone form inside a wide window. Under 480px every control grows to the 44px target (`--target`).

### Named Rules
**The Still Root Rule.** The app root never scrolls. Each pane scrolls itself, and keeping an item in view scrolls only its own pane.

**The Own Width Rule.** Layout responds to the app's width through `data-bp`, never to the window through a media query.

## Elevation & Depth

The system is flat with tonal layering, plus soft ambient shadows on things that sit above the page. List rows, panes, the summary box and the repository block are flat and separated by hairlines and the sunk surface. Grid cards, the sheet's side buttons and the focused skip button carry the low shadow (`--shadow`). The settings panel, the reader sheet and the floating paste card carry the high shadow (`--shadow-lg`), over a dimming scrim where they cover the page. In Dark, the sheet adds a strong hairline edge so it shows against the scrim.

The paste card floats under the paste box in List's sidebar from `--bp-medium` (1080px) up, and under the Grid header from 760px up. Below those widths it sits in the page flow between the paste box and the list, with no shadow, so the list moves down while it shows and no row is ever under it. In the sidebar it adds to the sidebar's scroll height, so a window shorter than the card scrolls the sidebar.

### Named Rules
**The Lifted Only Rule.** A shadow means the element sits above the page: a card in the grid or a floating layer. Rows, panes and boxes inside the reader stay flat.

## Shapes

Corners follow size: `r1` for small inline parts, `r2` for controls, `r3` for large containers, and a full pill (`r4`) for round things such as tag dots, the unread dot and swatches. Edges are 1px hairlines, and dashed hairlines mark placeholders and items still being processed. Pictures crop to their top-left corner, where a screenshot's first line starts.

## Components

### Buttons
Quiet framed buttons that sit on the surface like the rest of the page. The accent button (a full Cobalt fill with on-accent text) is for the save button beside the paste box and the main action in a paste card. Focus draws a 2px accent-ink ring 2px outside the button. A press fills a neutral button with the press fill; an accent-filled button, a checked segment and a pressed chip keep their fill and show a 1px inner ring in the text colour of the fill. The danger button and the Read state dot keep the hover fill and show a 1px inner ring, because their marks lose contrast on the press fill. While a List row, Topic page row or open Grid card is pressed, its Read state mark takes the muted colour, or the accent ink when unread, for the same reason. A plain Grid card keeps its mark colours. In forced colours, selected filters keep their system colours and open Grid cards keep their system border while pressed. Disabled buttons show no press. The names ending in pressed in the front matter mean the toggled state, and button-press and list-row-press mean the moment of the press.

### Chips
- **Tag chips:** a pill on the sunk surface, used only when Tag style is Chips. The default Tag style is a coloured dot before the name, and Text style writes "#name". A name too long for its row wraps inside its own box in the Reader, in every Tag style, with the dot or the "#" beside the first line, and a Chips pill keeps its corner at half the height of one line so a wrapped name stays inside it. A name in a filter row of the rail wraps the same way and the count stays at the row's end. The Grid filter bar uses a native select instead, which stays inside the bar and clips a long name, both in the closed control and in the open list.

### Inputs / Fields
- **Hint:** a field's hint sits between its label and the field, so the browser's suggestion list does not cover it, and it stays while an error shows.
- **Required:** in a form that mixes required and optional fields, a required field's label ends with `*` and one line above the fields says what it means. A form whose fields are all required, or that has one field, keeps plain labels.
- **Focus:** the field's edge turns accent-ink and thickens with a 1px ring outside the border.
- **Invalid:** once a person has used a field and the browser holds its value invalid, the field's edge thickens with a 1px ring in the control line colour. An empty required field also gets a line in the `warn` tone that says it is required, and a screen reader hears that line with the field's label when the field is left empty. The edge never turns `warn`.

### Navigation
- **Filter rail (List):** a selected row or segment takes the soft accent tint and weight 600. The tint measures under 3:1 against the rail, so the change to weight 600 is what shows the state.
- **Reader bar:** one row that sticks to the top of the reader. As it narrows it drops, in order, the key hint, the button labels, the comments total and the word on Back. A 2px accent line along its bottom edge shows reading progress.

### List row (signature)
The unread dot sits on the first metadata line with a `--dot-hit` hit area, filled with the accent when unread and drawn as a control-line ring when read. A Topic page row draws the same dot at the start of its metadata line as a mark with no hit area, because that page sets no read state. The open row takes the soft accent tint and a 3px accent bar on its left edge, so shape tells it apart from hover. A focused row draws its 2px accent-ink ring inside its own edge, because the pane that scrolls the list clips anything drawn outside a row. On the open row the ring sits just in from the bar, so both stay visible.

### Comment tree (signature)
Kept comments nest with an indent per level that is capped, so deep threads stay readable. Context stubs, dropped parent comments shown as one line so a kept reply under them still reads correctly, are muted, one line, and dashed when they have a box.

### Motion
Opening an item grows its card or row into the reader over `--dur-move` with `--ease-move`. Fades and small turns take `--dur-fade`. Under reduced motion the app skips the grow, the spinner and shimmer stop, and the filter chevron stops turning.

## Do's and Don'ts

### Do:
- **Do** take every value from a token in `design/system/tokens.css`. The only literals are the ones the header of that file lists.
- **Do** add a new Look option as a `data-*` rule on the app root that lists only the tokens it changes, and add the option to the settings table in `design/system/settings-table.ts`.
- **Do** keep every text and background pair at 4.5:1 or more, and every mark, icon and border a person needs to see a control or its state at 3:1 or more, in every theme with every accent and Style.
- **Do** draw the edge in the control line colour (`--ctl-line`) when the edge is what shows the control, such as a field or an empty unread dot. It measures 3:1 or more against the page, the surfaces and the open row's tint, in every theme with every accent. The hairline colours (`--line`, `--line-2`) measure 1.2 to 2.1:1 against the page and both surfaces, so they only separate regions or edge a control that shows visible text. Both figures are WCAG relative-luminance ratios computed from the OKLCH values in `tokens.css`.
- **Do** make every target at least 44px under 480px, except the width of a link inside rendered post or comment text (`.md`). That link keeps the width of its text, and `--link-pad` sets its height (WCAG 2.2 SC 2.5.8, [Inline exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- **Do** mark the open row with its 3px bar as well as its tint.
- **Do** give every animation a reduced-motion form.
- **Do** keep the reading column at the Text width setting's measure, and keep the unread dot on the first metadata line, never on a picture.

### Don't:
- **Don't** set any text under 12px.
- **Don't** build a social feed's chrome: vote arrows, avatars ahead of an item's title in the list, or engagement counts as the loudest thing on a row.
- **Don't** build a SaaS dashboard: gradient hero cards, number tiles, or icons in coloured circles.
- **Don't** fill an area larger than a control with the full accent. Use the soft tint.
- **Don't** scroll the app root, and don't use media queries for width. Read `data-bp`.
- **Don't** give list rows, panes or reader boxes an elevation shadow.
