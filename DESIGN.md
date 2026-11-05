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
  unread-badge:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.r4}"
    padding: "0 8px"
---

# Design System: Threadsift

## Overview

**Creative North Star: "The Reading Room"**

Threadsift is a quiet library room. The saved text leads, and the interface stays in the background. The mood is quiet, bookish and exact. Chrome is drawn in near-white surfaces, cool greys and hairlines, and one accent hue marks state. The reading column holds post and comment text at one size and one line length. The metadata, controls and lists around it are smaller and greyer than that text.

The look is not one preset. Every Look setting is a `data-*` attribute on the app root, and each option swaps a set of tokens. Today these are Font, Text size, Text width, Density, Comment style, Accent, Tag style, Card images and Style, which has the one option Library until the 10 Styles arrive. Theme (Light, Dark, Sepia and Match system, which follows the device) and Layout (List, Grid) are attributes on the same root. With no Theme stored, the app draws Light (`docs/spec.md`, Themes). `design/system/tokens.css` is the source every value is read from, and `design/system/settings.ts` owns which option is the default. The page's `html` element carries the same `data-theme` as the app root, so the page background and `color-scheme` follow the theme past the app's edges. The tokens in this file record the default look: Light theme, the Plex font pair, Cobalt accent, Medium text size, Medium text width, Compact density and the List layout.

Density is compact by default, because a library with hundreds of saves needs many rows on screen, but the reading column never gets denser with it. Components are refined and restrained. Two looks are rejected. One is a social feed: Reddit's or X's own chrome, with vote arrows, avatars ahead of the item title, and engagement counts as the loudest thing on a row. The other is a SaaS dashboard: gradient hero cards, number tiles and icons in coloured circles.

**Key Characteristics:**
- One accent hue on cool or warm neutrals. The theme sets the accent's lightness and chroma.
- One reading size and one capped line length for post, comment and summary text.
- Flat hairline structure in List. Soft shadows sit only on Grid cards and floating layers.
- Every value is a token, and every Look option is a token swap on the app root.
- The app answers to its own width, through `data-bp`, in five bands.

## Colors

The palette is near-white surfaces with a faint cool tint, ink-dark text, and a single accent that carries every selected, unread, focused and linked state.

### Primary
- **Cobalt** (`cobalt`): the default accent. Fills the pressed segment button, the pressed filter chip, the accent button, the unread dot, the unread badge, the reading progress line and the open row's left bar. Rust, Moss, Iris and Teal are the other four accents. Each changes only the hue (`--ah`).
- **Cobalt ink** (`cobalt-ink`): the accent as text and outline. Links, the "show more" links, the focus ring and the focused field's border use it, because it is darker than the fill and holds 4.5:1 as text.
- **Cobalt soft** (`cobalt-soft`): the accent's pale tint. It fills the open list row, the selected filter row, search highlights and the OP label in comments. In Sepia this tint is mixed into the paper colour, so it reads as a warm grey, a cream or a faint sage, never a blue block.
- **On accent** (`on-accent`): text and icons on a full accent fill.

### Neutral
- **Page** (`bg`): the app background and the reader background.
- **Surface** (`surface`): controls, Grid cards, the summary box, the repository block and the settings panel.
- **Sunk surface** (`surface-2`): hover fills, the List sidebar, code blocks, inline code, tag chips and image placeholders.
- **Hairline** (`line`): row dividers, the edges of Grid cards, the summary box and the repository block, and the rule above a level-2 heading in post text.
- **Strong hairline** (`line-2`): the comment indent guides, the blockquote bar, segmented control frames, dashed context stubs, the settings panel and the paste card.
- **Control line** (`ctl-line`): the edge of buttons, fields, selects and the side buttons, and the ring of an empty unread dot.
- **Ink** (`text`): all primary text.
- **Muted ink** (`muted`): metadata, counts, labels, hints and placeholders.
- **Status** (`ok`, `warn`): the paste card's done and failed tones, used as text colour only.

Dark and Sepia redefine every neutral and the accent's lightness and chroma in `design/system/tokens.css`. Grid tilts the greys toward violet (`--nh`, `--nc`), and Sepia ignores that tilt. Tags take one of eight hues at a fixed chroma (`--tag-c`), shown only as a dot before the name in the default Tag style.

### Named Rules
**The One Accent Rule.** The accent is the one colour that marks selection, action and state. The tag hues, the paste card's status tones and the accent swatches in the settings panel are the only other colours in the chrome. A full accent fill covers nothing larger than a control, a dot or a bar. A larger selected area, such as the open row, takes the soft tint.

**The Theme Owns Lightness Rule.** An accent sets hue only. Each theme sets the accent's lightness and chroma (`--acc-l`, `--acc-c`, `--acc-ink`), so every accent meets the contrast floor in every theme without its own per-theme values.

## Typography

**Display Font:** IBM Plex Sans (with system-ui, sans-serif)
**Body Font:** IBM Plex Sans (with system-ui, sans-serif)
**Mono Font:** IBM Plex Mono (with ui-monospace, monospace)

**Character:** IBM Plex Sans sets titles, lists, labels and reading text, and IBM Plex Mono sets code. The Font setting swaps in four other pairs (Newsreader with Instrument Sans, Bricolage Grotesque with Figtree, Instrument Serif with Geist, JetBrains Mono with Source Serif 4), most with their own display weights and size factors.

### Hierarchy
- **Display** (`--t-display`: 600, 24px in List and 30px in Grid, 1.15): the wordmark, the reader title and the empty-library heading. It scales to 0.85 under 760px.
- **Headline** (`--t-h2`: 600, 20px, 1.25): reader section headings such as Original post, Comments and README.
- **Title** (`--t-title`: 500, 15px at Compact, 1.25): item titles in rows and cards. An unread item's title is 700.
- **Body** (`--t-read`: 400, 17px at Medium text size, 1.6): post and comment text in the reading column, up to 62 average characters a line at Medium text width (56 Narrow, 68 Wide). The reader's summary and key points use the same size at line height 1.5 (`--lh-text`).
- **Body list** (400, 13.5px at Compact, 1.45): row and card summaries. Comfortable and Roomy raise it to 14.5px and 15.5px.
- **Meta** (`--t-meta`: 400, 13px, 1.45): the app's default UI size, for metadata, buttons, filters and bylines.
- **Label** (`--t-label`: 600, 12px, 0.06em, uppercase): names of controls, filter groups, settings groups and data fields such as Stars and Language.
- **Code** (`--t-code`: 400, 14px, 1.5, mono): code blocks. Inline code keeps the size of the text around it.

Type sizes are in rem, so the browser's own font size scales them, and the pixel values above are the ones at its default of 16px. Text size (Small 0.9, Medium 1, Large 1.15) multiplies the title, list body and reading sizes through `--tz`. Reading text keeps its 16px floor (`--t-floor`) at Small, and label and meta text never scale, so no text is under 12px. Under 480px the paste field's text is at least 16px, because iOS Safari zooms the page when a focused field's text is smaller.

### Named Rules
**The One Reading Size Rule.** Post, comment and summary text share one size (`--t-read`). Headings inside a post render at that same size, so the reader's section headings (`--t-h2`) always outrank them and the page reads in outline order.

**The Plain Panel Rule.** The settings panel keeps the Plex pair whatever the Font setting is, so the controls that change the font never move.

## Layout

Spacing runs on six steps (`s1` to `s6`, 4px to 32px). Density multiplies the vertical spacing of list rows and cards (`--k`, 0.75 at Compact) and changes list text size. It never changes the reader.

List is three panes. The sidebar (`--rail-w`, 264px) holds the wordmark, paste box and filter rail, the item list sits between `--list-min` and `--list-w` (300px to 420px), and the reader pane takes the rest. Under `--bp-medium` (1080px) the sidebar becomes a header above the list. Under `--bp-narrow` (760px) everything stacks into one column and items open full page. Grid is a header row (wordmark, search, paste box), a filter bar, then a card grid centred at most `--page-max` (1480px) wide, with 4, 3, 3, 2 and 1 columns from the widest band down. In Grid, an item opens as a full page or as a sheet up to `--sheet-w` (760px) wide over the dimmed grid, with Previous and Next buttons outside the sheet.

The breakpoints are `--bp-phone`, `--bp-narrow`, `--bp-medium` and `--bp-wide` (480, 760, 1080 and 1440px). The app measures its own width and writes every band it is under to `data-bp`. Components read that attribute instead of media queries, so a preview can draw the phone form inside a wide window. Under 480px every control grows to the 44px target (`--target`).

### Named Rules
**The Still Root Rule.** The app root never scrolls. Each pane scrolls itself, and keeping an item in view scrolls only its own pane.

**The Own Width Rule.** Layout responds to the app's width through `data-bp`, never to the window through a media query.

## Elevation & Depth

The system is flat with tonal layering, plus soft ambient shadows on things that sit above the page. List rows, panes, the summary box and the repository block are flat and separated by hairlines and the sunk surface. Grid cards and the sheet's side buttons carry the low shadow. The settings panel, the reader sheet and the floating paste card carry the high shadow, over a dimming scrim where they cover the page. In Dark, the sheet adds a strong hairline edge so it shows against the scrim. Each theme defines its own shadow values in `design/system/tokens.css`.

### Shadow Vocabulary
- **Low** (`--shadow`): two soft layers, a 1px contact shadow and a wide faint blur. Grid cards and the sheet's side buttons.
- **High** (`--shadow-lg`): one deep blur. The settings panel, the reader sheet and the paste card when it floats over the grid.

### Named Rules
**The Lifted Only Rule.** A shadow means the element sits above the page: a card in the grid or a floating layer. Rows, panes and boxes inside the reader stay flat.

## Shapes

Corners follow size. Small inline parts use 4px (`r1`): keys, segment buttons, inline code, highlights and list thumbnails. Controls use 8px (`r2`): buttons, fields, selects, chips, filter rows, code blocks and pictures in the reader. Large containers use 14px (`r3`): Grid cards, the summary box, the repository block, the settings panel and the sheet. Round things use a full pill (`r4`): tag dots and tag chips, the unread dot, accent swatches, avatars, the unread badge and the side buttons. Edges are 1px hairlines, and dashed hairlines mark placeholders and items still being processed. Pictures crop to their top-left corner, where a screenshot's first line starts.

## Components

### Buttons
Quiet framed buttons that sit on the surface like the rest of the page.
- **Shape:** gently rounded (8px), `--ctl-h` (34px) tall, `--target` (44px) under 480px.
- **Default:** surface fill, ink text, control-line edge, meta size at weight 500.
- **Hover / Focus:** hover fills with the sunk surface. Focus draws a 2px accent-ink ring 2px outside the button.
- **Accent:** a full Cobalt fill with on-accent text at weight 600. Hover brightens it slightly. Used for the save button beside the paste box and the main action in a paste card.
- **Plain and icon:** a transparent button with no edge, and a square icon button. Disabled buttons turn muted with a strong hairline edge.

### Chips
- **Filter chips (Grid's filter bar):** surface fill, strong hairline edge, `--ctl-h` (34px) tall. Pressed fills with the accent and turns its count to on-accent.
- **Tag chips:** a pill on the sunk surface, used only when Tag style is Chips. The default Tag style is a coloured dot before the name, and Text style writes "#name".

### Cards / Containers
- **Corner Style:** 14px for Grid cards, the summary box and the repository block, and 8px for the paste card.
- **Background:** surface.
- **Shadow Strategy:** Grid cards take the low shadow, and reader boxes are flat (see Elevation & Depth).
- **Border:** a hairline. The open Grid card draws its edge in the accent, and a card still being processed draws it dashed.
- **Internal Padding:** 16px (`--s4`).
- **In a sheet:** the summary box drops its fill and corners, keeps only a hairline under it, and keeps padding only below (`--s5`).

### Inputs / Fields
- **Style:** surface fill, control-line edge, 8px corners, `--field-h` (40px) tall and `--target` (44px) under 480px, with the input text at list body size.
- **Focus:** the edge turns accent-ink and thickens with a 1px inner ring.

### Navigation
- **Filter rail (List):** segmented Source and Status controls with counts, then collapsible Topic and Tags groups. A selected row or segment takes the soft accent tint and weight 600. The tint measures under 3:1 against the rail, so the change to weight 600 is what shows the state. Counts use tabular figures.
- **Reader bar:** one `--bar-h` (56px) row that sticks to the top of the reader. As it narrows it drops, in order, the key hint, the position text, the button labels, the comments total and the word on Back. A 2px accent line along its bottom edge shows reading progress.
- **Settings panel:** a `--pop-w` (25rem, 400px at the default size) panel under the gear, with segmented controls, a font select and accent swatches. Under 760px it becomes a sheet from the bottom with a fixed header and footer.

### List row (signature)
A row holds the unread dot on the left, the metadata line, the title, a `--thumb` (40px) thumbnail on the right and a two-line summary. The unread dot sits on the first metadata line with a `--dot-hit` (28px) hit area, filled with the accent when unread and drawn as a control-line ring when read. Hover fills the row with the sunk surface. The open row takes the soft accent tint and a 3px accent bar on its left edge, so shape tells it apart from hover. A focused row draws its 2px accent-ink ring inside its own edge, because the pane that scrolls the list clips anything drawn outside a row. On the open row the ring sits just in from the bar, so both stay visible.

### Comment tree (signature)
Kept comments nest with an indent per level that is capped, so deep threads stay readable. Comment style picks the drawing: Indented lines (the default, thin guides and a hairline above each top-level thread), Cards (each comment in a hairline box), or Rail (a small initials avatar on a vertical guide). Long comments fold to six lines behind a fade. Context stubs, dropped parent comments shown as one line so a kept reply under them still reads correctly, are muted, one line, and dashed when they have a box.

### Motion
Opening an item grows its card or row into the reader over `--dur-move` (280ms) with `--ease-move`. Fades and small turns take `--dur-fade` (200ms). Under reduced motion the app skips the grow, the spinner and shimmer stop, and the filter chevron stops turning.

## Do's and Don'ts

### Do:
- **Do** take every value from a token in `design/system/tokens.css`. The only literals are the ones the header of that file lists.
- **Do** add a new Look option as a `data-*` rule on the app root that lists only the tokens it changes, and add the option to the settings table in `design/system/settings.ts`.
- **Do** keep every text and background pair at 4.5:1 or more, and every mark, icon and border a person needs to see a control or its state at 3:1 or more, in every theme with every accent and Style.
- **Do** draw the edge in the control line colour (`--ctl-line`) when the edge is what shows the control, such as a field or an empty unread dot. It measures 3:1 or more against the page, the surfaces and the open row's tint, in every theme with every accent. The hairline colours (`--line`, `--line-2`) measure 1.2 to 2.1:1 against the page and both surfaces, so they only separate regions or edge a control that shows visible text. Both figures are WCAG relative-luminance ratios computed from the OKLCH values in `tokens.css`.
- **Do** make every target at least 44px under 480px.
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
