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

This file describes the app as built. Its last section, Brand Brief, describes the target look and its three candidate directions. Where the two differ, a change to the app follows the earlier sections, and the direction kits in the prototype and the build of the chosen direction follow the Brand Brief.

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

The app measures its own width and writes every band it is under to `data-bp` (`--bp-phone`, `--bp-narrow`, `--bp-medium` and `--bp-wide`). Components read that attribute instead of media queries, so a preview can draw the phone form inside a wide window. Under 480px every control grows to the 44px target (`--target`), with the exceptions the target rule under Do's and Don'ts lists.

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
- **Do** make every target at least 44px under 480px, except the width of a link or a Highlight mark in the text of a rendered post or comment (`.md`), a code block included. Each keeps the width of its text, so two marks side by side never share a tap area, and `--link-pad` sets its height. A mark that wraps a picture has the picture's size (WCAG 2.2 SC 2.5.8, [Inline exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
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

## Brand Brief

This section describes the target look, not the app as built. The sections above describe the app as built. [PRODUCT.md](PRODUCT.md), Brand Brief, holds the idea, the signature element (the kept strip), the voice, and what a Style is. This section holds the visual rules every direction keeps, the tokens a Style may set, the three candidate directions, and the rules above that the brief contradicts.

Chosen direction: not chosen yet.

When the owner chooses, this line names the direction and the other two directions are deleted from this section. The chosen direction's lightness steps become the values of the Light and Dark Themes, and the rest of it (neutral hue and chroma, faces, default accent, corners, hairlines, shadows, button fill, Tag) becomes the Library Style and the brand's components.

### Shape language

- Controls, fields, cards, boxes and panels are square or nearly square: every corner is 0 to 4px (`--r1` to `--r3`). No control, Tag, mark or swatch is a stadium, a shape whose corner is half its height, so the brand draws no pills. 57 of the 60 refero references studied for this brief use pills, so a pill reads as the look of the moment, not as Threadsift.
- Hairlines draw the structure: a row divider, a card edge, the rule under the kept strip. Tone (page, surface, sunk surface) separates regions where a line would be noise.
- Marks are squares: the unread mark, the Tag swatch and the Accent swatch.

### Colour world

- The page is cool or neutral: in Light and Dark the neutrals carry a chroma of 0.008 or less, at the hue the direction names. 27 of the 60 refero references sit on warm paper or cream, so a warm cream page reads as the look of the moment. Sepia stays the one warm Theme, as a reading choice.
- List and Grid share one neutral world, so the Grid's own tilt of the greys goes.
- The One Accent Rule and the Theme Owns Lightness Rule (Colors, above) stay. Each direction names its default accent hue. The Theme sets the accent's lightness and chroma for every hue.

### Faces

- Three roles: a UI face for titles, labels and controls; a reading face for post, comment and summary text, which may be the UI face; and a monospaced face for the kept strip and code.
- Every face is served from the Instance, so its licence must allow self-hosting: each face named below is under the SIL Open Font License 1.1 and is published on Fontsource, where the app takes today's faces from. `pnpm run check:faces` checks that every Font and Style stack in the tokens starts with a face the app loads.
- The Font setting offers three pairs. A Style writes its pair into the setting, and the owner can change it. The Plain Panel Rule (Typography, above) stays.

### Motion

- One orchestrated move: opening an Item grows its row or card into the Reader over `--dur-move` with `--ease-move`, and closing runs it back into the same place. The View Transitions API can carry the card's cover and title into the Reader header.
- Fades and small turns take `--dur-fade`. A card stays still on hover: its edge darkens instead of lifting. Lists never enter in a staggered cascade. Agent work shows as a status word and a 1px line, never as a glow or a sparkle.
- Every move has the reduced-motion form the Motion rule above describes.

### What no Style may change

The wordmark and the icon; the kept strip and the covers; where every pane, bar and control sits in List, Grid and the Reader; the parts of every component (a List row, a Grid card, the Reader header, the summary box, the comment tree, a button, a field, a Tag); the type scale, the One Reading Size Rule and the 12px floor; the shape language above; the Theme's lightness steps and the contrast floor; the motion; and the voice.

### Tokens a Style may set

| Token | What it sets | Allowed values |
|---|---|---|
| `--nh`, `--nc` | hue and chroma of the neutrals in Light and Dark | chroma 0 to 0.008 |
| `--r1`, `--r2`, `--r3` | corners of small parts, controls and containers | 0 to 4px |
| a hairline weight token, added when the brand is built | the weight of row dividers, card edges and rules | 1px or 2px |
| `--shadow`, `--shadow-lg` | a shadow, or none | the brand's soft shadow, or none with a 1px strong-hairline edge on floating layers |
| button fill tokens, added when the brand is built | how a neutral button is filled | outline, sunk fill or surface fill |
| `--tag-dot`, `--tag-mark`, `--tag-gap`, `--tag-pad`, `--tag-pad-y`, `--tag-box`, `--tag-bg`, `--tag-fg`, `--tag-c` | how a Tag is drawn, inside the brand's one Tag | no pill |

A Style also writes a Font and an Accent into the settings. These are setting values, not tokens. Every other token belongs to the brand or to a Theme: the lightness of every neutral and of the accent belongs to the Theme, so one contrast check covers every Style.

### Rules above that the brief contradicts

These rules describe the app as built and stay until the chosen direction is built. That build changes them.

- Shapes: a 14px corner (`r3`) on large containers, a full pill (`r4`) for tag dots, the unread dot and swatches, and the Chips Tag style as a pill. The brief keeps every corner at 4px or less and draws these marks as squares.
- Colors, Neutral: Grid tilts the greys toward violet (`--nh`, `--nc`). The brief keeps one neutral world for List and Grid.
- Elevation & Depth, and Key Characteristics: Grid cards carry the low shadow. All three directions draw Grid cards flat.
- Typography: IBM Plex Sans and the Font setting's five pairs. The brief gives the faces of each direction and three pairs.
- Overview: a Style other than Library replaces Font and Accent with its own. Under the brief a Style writes them into the settings once, and the owner can change them.
- Components, Chips, and the Comment style setting: three Tag styles and three Comment styles, one of which, Rail, draws an avatar beside each comment. The brand draws one Tag and one comment tree, with no avatars.
- List row: the unread dot sits on the first metadata line. Under Proof Sheet the kept strip is that line, drawn on a dark band, and the unread mark moves to the line below it.
- [PRODUCT.md](PRODUCT.md), Brand Commitments: interface text has no hand-picked voice. The brief sets one.

### Three candidate directions

Each direction is concrete enough to build as a component kit on synthetic Items: buttons, fields, chips, the List row, the Grid card with a cover, the Reader header, the summary box, the comment tree and the Settings panel, in List, Grid and the Reader, Light and Dark. The values meet the contrast floor with each direction's default accent: computed as WCAG ratios from these OKLCH values, ink, muted ink and accent ink measure 5.8:1 or more on the page, the surface, the sunk surface and the accent soft tint, text on the accent fill 5.9:1 or more, the control line 3.5:1 or more against each of those four, and the accent fill 4.9:1 or more as a mark. The other accents are measured when the chosen direction is built.

Two directions grow out of Gemini 4 Neon's design answer for Threadsift (kept in the private docs folder). The third comes from the contact sheet and replaces Gemini's third direction, Commonplace, whose putty page and plum accent sit on the warm side and whose Topic-coloured spine adds a second colour system to every card. Commonplace's legibility face, Atkinson Hyperlegible Next, fits the fourth Font pair instead. No direction copies a reference: each takes a technique, and the Sources line of each direction names the reference it came from.

#### Quarto

A technical monograph: one grotesque family, a ruled matrix of hairlines, and an ink of pine green.

| Token | Light | Dark |
|---|---|---|
| Page (`--bg`) | `oklch(0.968 0.004 115)` | `oklch(0.155 0.006 165)` |
| Surface | `oklch(0.996 0.002 115)` | `oklch(0.195 0.007 165)` |
| Sunk surface | `oklch(0.938 0.005 115)` | `oklch(0.235 0.008 165)` |
| Hairline | `oklch(0.875 0.006 115)` | `oklch(0.29 0.008 165)` |
| Strong hairline | `oklch(0.78 0.006 115)` | `oklch(0.38 0.008 165)` |
| Control line | `oklch(0.55 0.008 115)` | `oklch(0.58 0.01 165)` |
| Ink | `oklch(0.17 0.006 140)` | `oklch(0.94 0.005 115)` |
| Muted ink | `oklch(0.45 0.008 130)` | `oklch(0.72 0.008 135)` |
| Accent fill | `oklch(0.46 0.115 162)` | `oklch(0.74 0.11 162)` |
| Accent ink | `oklch(0.42 0.115 162)` | `oklch(0.79 0.105 162)` |
| Accent soft | `oklch(0.935 0.028 162)` | `oklch(0.27 0.04 162)` |
| On accent | `oklch(0.99 0 0)` | `oklch(0.17 0.02 162)` |

- **Neutral world:** cool limestone, a grey with almost no colour (chroma 0.004 to 0.008).
- **Accent:** Pine, hue 162.
- **Faces:** Schibsted Grotesk for display, UI, titles and reading text, and Commit Mono for the kept strip and code. Schibsted Grotesk: SIL OFL 1.1, from Google Fonts (`github.com/google/fonts`), on Fontsource as a variable font. Commit Mono: SIL OFL 1.1, from `github.com/eigilnikolajsen/commit-mono`, on Fontsource in static weights 200 to 700.
- **Corners:** 2px on controls and small parts. 0 on cards, which are cells of the grid.
- **Hairlines:** 1px everywhere. Grid cards share their rules, with no gap between cells, so the grid reads as one ruled table.
- **Shadows:** none on the page. The settings panel and the reader sheet keep a 1px strong-hairline edge and the brand's soft high shadow.
- **Buttons:** a neutral button has no fill and a 1px control-line outline, and takes the sunk fill on hover. The main action is a solid accent fill.
- **Tags:** a 6px square in the Tag's hue before the name, in muted ink.
- **Unread mark:** an 8px solid accent square. A read Item shows the square as a control-line outline.
- **Kept strip:** Commit Mono at 12px in muted ink at the top of each cell, under a top rule that holds a 3px bar: the accent part of the bar is the Kept share of the saved comments, and the rest is hairline.
- **Room for the other Styles:** Broadsheet sets 0 corners, the 2px hairline and a serif reading face. Workbench sets Commit Mono for the UI face and chroma 0.
- **Sources:** the direction, its faces, palette and the sift bar in the top rule come from Gemini's Quarto. The grey 1px line that organizes the whole page comes from [Exhibition Magazine](https://styles.refero.design/style/597355de-6167-4f37-8f14-b3897919a94c). Depth from tonal steps instead of shadows, and small mono metadata, come from [Vercel](https://styles.refero.design/style/f24daf3a-d43f-4dec-85a9-8ac1d5148a03). Small squared buttons with a hairline outline variant come from [Stripe](https://styles.refero.design/style/48e5de76-05d5-4c4e-a269-c7c245b291ec). Cards with no radius and thin borders come from [Nofilter.space](https://styles.refero.design/style/4235ebdc-a070-46ef-abbf-692151449bea).
- **Risk:** it can read as austere and close to developer tools, and a reader who wants warmth finds none in Light.

#### Index Room

A library catalogue: every Item is a card filed in a reading room, headed by its catalogue line and stamped while unread.

| Token | Light | Dark |
|---|---|---|
| Page (`--bg`) | `oklch(0.962 0.003 250)` | `oklch(0.17 0.005 250)` |
| Surface | `oklch(0.993 0.002 250)` | `oklch(0.21 0.006 250)` |
| Sunk surface | `oklch(0.934 0.004 250)` | `oklch(0.25 0.006 250)` |
| Hairline | `oklch(0.87 0.004 250)` | `oklch(0.31 0.006 250)` |
| Strong hairline | `oklch(0.78 0.004 250)` | `oklch(0.40 0.006 250)` |
| Control line | `oklch(0.57 0.005 250)` | `oklch(0.60 0.006 250)` |
| Ink | `oklch(0.20 0.006 250)` | `oklch(0.94 0.004 250)` |
| Muted ink | `oklch(0.45 0.006 250)` | `oklch(0.74 0.006 250)` |
| Accent fill | `oklch(0.48 0.16 298)` | `oklch(0.74 0.12 298)` |
| Accent ink | `oklch(0.45 0.16 298)` | `oklch(0.79 0.11 298)` |
| Accent soft | `oklch(0.93 0.03 298)` | `oklch(0.30 0.05 298)` |
| On accent | `oklch(0.99 0 0)` | `oklch(0.17 0.02 298)` |

- **Neutral world:** archival grey board, a near-colourless grey (chroma 0.003 to 0.006). Gemini's Index Room used a warm rag paper (hue 85) and a cinnabar accent. This direction keeps its faces and its catalogue line and moves the page to grey board and the accent to stamp-pad violet, because a warm page with a red-orange accent is the common look the shape and colour rules above set aside.
- **Accent:** Stamp violet, hue 298, the ink of a library's date stamp.
- **Faces:** Libre Franklin for display, UI and titles; Literata for reading text; Fragment Mono for the kept strip and code. Libre Franklin and Literata: SIL OFL 1.1, from Google Fonts, on Fontsource as variable fonts. Literata has an optical-size axis for screen reading. Fragment Mono: SIL OFL 1.1, from Google Fonts, on Fontsource in one weight, 400, with an italic.
- **Corners:** a card has one eased corner, 4px at its top left, and 0 at the others, like a catalogue card. Controls take 2px.
- **Hairlines:** 1px. A strong hairline runs under the kept strip of every card and Reader header, as the rule under a catalogue card's heading.
- **Shadows:** none on cards. Floating layers keep the brand's soft shadow.
- **Buttons:** a neutral button is filled with the surface, like card stock, with a 1px control-line edge. The main action is a solid accent fill.
- **Tags:** the name in a square label with a 1px hairline edge and no fill, whose left edge is 3px in the Tag's hue, like a subject tab.
- **Unread mark:** a 10px solid accent square, the stamp, at the right end of the kept strip. A read Item shows the square as a control-line outline.
- **Kept strip:** Fragment Mono at 12px in muted ink across the top of the card, with the stamp at its right end and the strong hairline under it. Section labels such as filter groups and Topic page headings use the same mono face in tracked capitals.
- **Room for the other Styles:** Broadsheet sets 0 corners on every card, the 2px rule under the strip and no fill on buttons. Workbench sets Fragment Mono for titles and chroma 0.
- **Sources:** the direction, its faces, the catalogue line with the kept count and the stamp come from Gemini's Index Room. A titled strip at the head of every content area, square corners and no shadow come from [PostHog](https://styles.refero.design/style/56cd3725-3ff0-459e-894d-5da58d1fc549). Thin rules, minimal radii and tracked capital section labels with one signal accent come from [Monocle](https://styles.refero.design/style/9165ecb1-f068-4093-8783-1f3c98898b8a). Mono capitals as section eyebrows come from [User Interviews](https://styles.refero.design/style/376baf20-9ace-405d-bf4a-086016f2b1e3). A card with one soft corner and sharp others comes from [Ventriloc](https://styles.refero.design/style/f99aca3e-5289-4595-a7cc-77a72052f4b8).
- **Risk:** a serif reading face, hairline rules and small mono labels together are a common editorial look, so the stamp and the grey board carry the difference. Violet can read as decoration if it shows anywhere but state.

#### Proof Sheet

A photographer's contact sheet: every frame is shown, and a china marker picks the keepers. The kept strip is printed like the edge of a film strip.

| Token | Light | Dark |
|---|---|---|
| Page (`--bg`) | `oklch(0.955 0.006 230)` | `oklch(0.16 0.007 230)` |
| Surface | `oklch(0.995 0.002 230)` | `oklch(0.20 0.008 230)` |
| Sunk surface | `oklch(0.925 0.007 230)` | `oklch(0.24 0.008 230)` |
| Hairline | `oklch(0.86 0.007 230)` | `oklch(0.30 0.008 230)` |
| Strong hairline | `oklch(0.76 0.007 230)` | `oklch(0.39 0.008 230)` |
| Control line | `oklch(0.56 0.008 230)` | `oklch(0.60 0.008 230)` |
| Ink | `oklch(0.19 0.008 230)` | `oklch(0.94 0.004 230)` |
| Muted ink | `oklch(0.44 0.008 230)` | `oklch(0.73 0.007 230)` |
| Accent fill | `oklch(0.52 0.19 25)` | `oklch(0.72 0.15 25)` |
| Accent ink | `oklch(0.48 0.18 25)` | `oklch(0.78 0.13 25)` |
| Accent soft | `oklch(0.93 0.03 25)` | `oklch(0.30 0.06 25)` |
| On accent | `oklch(0.99 0 0)` | `oklch(0.17 0.02 25)` |

- **Neutral world:** silver proof paper on a light table, a cool grey at hue 230 (chroma 0.002 to 0.008). Prints (surfaces) sit on the table (page) with no edge.
- **Accent:** China-marker red, hue 25. This keeps a red accent because the china marker is the tool that marks a keeper on a real contact sheet. On a cool grey page with square shapes and no pills it does not form the warm cream, rust and pill look the counts above set aside. The Accent setting can change it.
- **Faces:** Archivo for display, UI and titles; Source Serif 4 for reading text; JetBrains Mono for the kept strip and code. All three: SIL OFL 1.1, from Google Fonts, on Fontsource as variable fonts. Archivo has a width axis, so titles can narrow in a dense grid. The app serves Source Serif 4 and JetBrains Mono today.
- **Corners:** 0 everywhere.
- **Hairlines:** 1px, used sparingly: fields take an ink edge, and rows are divided by hairlines, but cards are separated by tone and a narrow gutter.
- **Shadows:** none, including floating layers, which take a 1px strong-hairline edge over the scrim.
- **Buttons:** a neutral button is filled with the sunk surface and has no edge. The main action is a solid accent fill. Fields carry a 1px ink edge, so the place to type is the strongest frame on the screen.
- **Tags:** the name in ink with a 2px underline in the Tag's hue, like a marker stroke.
- **Unread mark:** an 8px solid accent square at the start of the line under the kept strip. A read Item shows a control-line outline. It sits off the band because the accent measures 2.2:1 against the band in Dark.
- **Kept strip:** JetBrains Mono at 12px in tracked capitals, page-coloured on an ink band across the top of each Grid card, cover and Reader header, like a film's edge print. The band inverts with the Theme. In a List row the strip is the same text without the band, so a long list does not stripe.
- **Room for the other Styles:** Broadsheet keeps the band and adds hairline edges to cards. Workbench sets JetBrains Mono for titles and chroma 0.
- **Sources:** the contact sheet world was dealt by the `impeccable` skill's direction roll (seed reference `4f295b53f22e566e`) from seven worlds of the audience's reading and archiving habits. Rank carried by reversal and rule instead of size comes from the timetable world of the `impeccable` catalogue (`rw-timetable-slide-rack`). The kept count in a mono strip comes from Gemini's Index Room. An inverted near-black plate inside a tonal stack comes from [Vercel](https://styles.refero.design/style/f24daf3a-d43f-4dec-85a9-8ac1d5148a03). Zero radius with thin borders comes from [Nofilter.space](https://styles.refero.design/style/4235ebdc-a070-46ef-abbf-692151449bea). Fields with an ink edge come from [Dub](https://styles.refero.design/style/b0d80806-b724-4ed1-a1d1-074edd3c9bc9).
- **Risk:** a grid of four ink bands per row can feel heavy, and a red accent is one step from the common look if the page drifts warm.
