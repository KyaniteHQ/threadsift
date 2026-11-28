---
name: Threadsift
description: A reading library where saved threads, posts, repos and articles read as their useful part.
colors:
  moss: "oklch(0.50 0.14 145)"
  moss-ink: "oklch(0.47 0.14 145)"
  moss-soft: "oklch(0.935 0.035 145)"
  on-accent: "oklch(0.99 0 0)"
  bg: "oklch(0.976 0.005 180)"
  surface: "oklch(0.995 0.0025 180)"
  surface-2: "oklch(0.948 0.005 180)"
  press: "oklch(0.919 0.005 180)"
  line: "oklch(0.89 0.005 180)"
  line-2: "oklch(0.80 0.005 180)"
  ctl-line: "oklch(0.60 0.005 180)"
  text: "oklch(0.22 0.005 180)"
  muted: "oklch(0.46 0.005 180)"
  ok: "oklch(0.47 0.12 150)"
  warn: "oklch(0.50 0.16 35)"
typography:
  display:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  wordmark:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', 'Schibsted Grotesk Fallback', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 560
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  body-list:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
  code:
    fontFamily: "'Commit Mono', ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  strip:
    fontFamily: "'Commit Mono', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  r1: "2px"
  r2: "2px"
  r3: "2px"
  r4: "2px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "0 12px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.surface-2}"
  button-press:
    backgroundColor: "{colors.press}"
  button-accent:
    backgroundColor: "{colors.moss}"
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
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "0 12px"
    height: "34px"
  filter-chip-pressed:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.on-accent}"
  segment-pressed:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.r1}"
    height: "30px"
  filter-row-pressed:
    backgroundColor: "{colors.moss-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    height: "32px"
  list-row:
    textColor: "{colors.text}"
    padding: "0 16px 9px"
  list-row-hover:
    backgroundColor: "{colors.surface-2}"
  list-row-press:
    backgroundColor: "{colors.press}"
  list-row-open:
    backgroundColor: "{colors.moss-soft}"
  grid-card:
    backgroundColor: "{colors.surface}"
    rounded: "0px"
  grid-card-open:
    backgroundColor: "{colors.moss-soft}"
  kept-strip:
    textColor: "{colors.muted}"
    typography: "{typography.strip}"
  summary-box:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.r3}"
    padding: "16px"
  tag-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "999px"
    padding: "2px 8px"
---

# Design System: Threadsift

## Overview

**Creative North Star: "The Reading Room"**

Threadsift is a quiet library room. The saved text leads, and the interface stays in the background. The mood is quiet, bookish and exact. Chrome is drawn in near-white surfaces, cool greys and hairlines, and one accent hue marks state. The reading column holds post and comment text at one size and one line length. The metadata, controls and lists around it are smaller and greyer than that text.

This file describes the app as built. Its last section, Brand Brief, describes the target look, the Quarto direction. Where the two differ, a change to the app follows the earlier sections, and the Quarto kit in the prototype and the build of Quarto follow the Brand Brief.

The look is not one preset. Every Look setting is a `data-*` attribute on the app root, and each option swaps a set of tokens; Theme and Layout are attributes on the same root. `design/system/tokens.css` is the source every value is read from, except the literal values its header lists, and `design/system/settings-table.ts` owns the list of settings and which option is the default. The tokens in this file record the default look: the Library Style, Light theme, the Library font pair (Schibsted Grotesk and Commit Mono), Moss accent, Medium text size, Medium text width, Compact density and the List layout.

Density is compact by default, because a library with hundreds of saves needs many rows on screen, but the reading column never gets denser with it. Components are refined and restrained. Two looks are rejected. One is a social feed: Reddit's or X's own chrome, with vote arrows, avatars ahead of the item title, and engagement counts as the loudest thing on a row. The other is a SaaS dashboard: gradient hero cards, number tiles and icons in coloured circles.

**Key Characteristics:**
- One accent hue on neutrals with almost no colour, the same in List and Grid; Sepia is the one warm Theme. The theme sets the accent's lightness and chroma.
- One reading size and one capped line length for post, comment and summary text.
- Flat hairline structure in List and Grid: a Grid card is a cell of one ruled table. Soft shadows sit only on floating layers.
- Every value is a token, except the literal values the `design/system/tokens.css` header lists, and every Look option is a token swap on the app root.
- The app answers to its own width, through `data-bp`, in five bands.

## Colors

The palette is near-white surfaces with almost no colour, ink-dark text, and a single accent that carries every selected, unread, focused and linked state.

### Primary
- **Moss** (`moss`): the default accent. Cobalt, Rust, Iris and Teal are the other four accents. Each changes only the hue (`--ah`).
- **Moss ink** (`moss-ink`): the accent as text and outline (links, the focus ring, the focused field's border), because it holds 4.5:1 as text. It is darker than the fill in Light and Sepia and lighter than it in Dark.
- **Moss soft** (`moss-soft`): the accent's pale tint, for selected areas such as the open row and the selected filter row. In Sepia this tint is mixed into the paper colour, so it reads as a warm grey, a cream or a faint sage, never a blue block.
- **On accent** (`on-accent`): text and icons on a full accent fill.

### Neutral
- **Page** (`bg`), **Surface** (`surface`) and **Sunk surface** (`surface-2`): the app background; controls, cards and boxes; and hover fills, the List sidebar, code and tag chips.
- **Press fill** (`press`): the fill of a control while it is pressed, one step past the hover fill. Outside forced colours, a pressed selected filter row or List row mixes the same step into the accent tint.
- **Hairline** (`line`) and **Strong hairline** (`line-2`): row dividers and container edges; the heavier lines (comment indent guides, segmented control frames, the Look panel, the Instance menu and the paste card).
- **Control line** (`ctl-line`): the edge of buttons, fields and selects, and the outline of a read Item's Read state mark.
- **Ink** (`text`) and **Muted ink** (`muted`): primary text; metadata, counts, labels, hints and placeholders.
- **Status** (`ok`, `warn`): the paste card's done and failed tones, used as text colour only. A saved Item that carries a note, such as a missing title, uses the warn tone and icon instead of the done check.

Dark and Sepia redefine every neutral and the accent's lightness and chroma in `design/system/tokens.css`. The Style sets the hue and chroma of the Light and Dark neutrals (`--nh`, `--nc`; 180 and 0.005 in Library), so List and Grid share one neutral world, and Sepia ignores them. Tags take one of eight hues at a fixed chroma (`--tag-c`), shown only as a dot before the name in the default Tag style.

### Named Rules
**The One Accent Rule.** The accent is the one colour that marks selection, action and state. The tag hues, the paste card's status tones, the `warn` colour of field errors, delete buttons and the failure mark on an Item row, and the accent swatches in the Look panel are the only other colours in the chrome. A full accent fill covers nothing larger than a control, a dot or a bar. A larger selected area, such as the open row, takes the soft tint.

**The Theme Owns Lightness Rule.** An accent sets hue only. Each theme sets the accent's lightness and chroma (`--acc-l`, `--acc-c`, `--acc-ink`), so every accent meets the contrast floor in every theme without its own per-theme values.

## Typography

Schibsted Grotesk sets titles, lists, labels and reading text, and Commit Mono sets code. The Font setting swaps in five other pairs. The wordmark keeps Schibsted Grotesk, the brand's face, under every Font and Style.

### Hierarchy
- **Wordmark** (`--t-brand`): "Thread" in ink and "sift" in the accent ink, in the masthead and on the sign-in screen, in Schibsted Grotesk at weight 600 and -0.015em tracking (`--f-brand`, `--brand-w`, `--brand-ls`). Its size is the Display size of the layout with the 0.85 scale under 760px (`--display-x`) and without the Font's display factor, so no Font or Style changes the wordmark. It has no minimum against Headline; only the 12px text floor holds it. Until Schibsted Grotesk loads, a local Arial Bold, scaled to the same width, stands in (`Schibsted Grotesk Fallback`).
- **Display** (`--t-display`): the reader title, the page headings such as Settings and Import, and the empty-library heading. It scales to 0.85 under 760px, except that the reader title and the page headings never go under `--rd-title-min` (1.1) times Headline, 22px at the default 16px browser font, so the reader title stays the largest heading in the Reader and a page heading stays above the section headings on its page, in every Font and Style. The empty-library heading keeps the 0.85 scale and has no minimum against Headline, because it is not a reading heading, so at a very small browser font it can fall under it; only the 12px text floor holds it.
- **Headline** (`--t-h2`): reader section headings such as Original post, Comments and README, and the heading of each sign-in and setup screen. It is never under the 16px reading floor divided by `--post-h-cap`, about 16.84px, so a heading inside a post keeps the floor too.
- **Title** (`--t-title`): item titles in rows and cards. An item's title takes `--dw-soft` (560 in the default Library pair), and an unread item's title takes `--dw-strong`, which each Font and Style sets: 700 in the default Library pair. Instrument Serif and the Cal.com Style have one display weight, so there an unread title keeps the read weight and the Read state mark alone marks it, in the Item list, in Grid and on a Topic page. A row with no title shows its link in the title slot on one line with an end ellipsis; the paste card shows the pasted link in full, wrapped.
- **Body** (`--t-read`): post and comment text in the reading column, up to 62 average characters a line at Medium text width (56 Narrow, 68 Wide). The reader's summary and key points use the same size at line height 1.5 (`--lh-text`).
- **Body list**: the interface text of fields, dialogs, page sections and the Highlights and Proposals lists. Comfortable and Roomy density raise it.
- **Meta** (`--t-meta`): the app's default UI size, for metadata, buttons, filters and bylines.
- **Label** (`--t-label`, uppercase): names of controls, filter groups, settings groups and data fields such as Stars and Language.
- **Code** (`--t-code`): code blocks. Inline code keeps the size of the text around it.

Type sizes are in rem, so the browser's own font size scales them, and the pixel values above are the ones at its default of 16px. Text size (`--tz`) multiplies the title, list body and reading sizes. Reading text keeps its 16px floor (`--t-floor`) at Small, and Headline keeps the floor divided by `--post-h-cap` (about 16.84px), so a heading inside a post is never under 16px; the minimum only takes effect at a browser font under about 13.5px. Label and meta text never scale with Text size, and every text size (`--t-label`, `--t-meta`, `--t-code`, `--t-body`, `--t-title` and `--t-display`) keeps a 12px floor (`--t-floor-ui`), so no text is under 12px at any browser font. Under 480px the text of the paste field and selects is at least 16px, because iOS Safari zooms the page when a focused field's text is smaller.

### Named Rules
**The One Reading Size Rule.** Post, comment and summary text share one size (`--t-read`). Headings inside a post render at that same size, but never over `--post-h-cap` (0.95) times Headline, so the reader's section headings (`--t-h2`) always outrank them, at a Large Text size too, and the page reads in outline order.

**The Plain Panel Rule.** The Look panel keeps the Library pair whatever the Font setting is, so the controls that change the font never move.

**The Open Word Rule.** Display, page and section headings and item titles take the Font's display letter and word spacing (`--dls`, `--dws`). The Library pair tightens the letters by 0.015em and opens each word space by 0.05em, so a tight grotesque title still reads as separate words.

## Layout

Spacing runs on six steps (`s1` to `s6`). Density multiplies the vertical spacing of list rows and cards (`--k`) and changes list text size. It never changes the Reader's post, comment and summary text (`--t-read`). The Highlights list and the Note box in the Reader, and the Highlights page, follow it.

Every signed-in screen opens with the masthead, a fixed row `--mast-h` (48px) tall, and the screen under it scrolls in its own panes. List is three panes: the sidebar (paste box and filter rail), the item list with the search row on top, and the reader pane. The owner sizes the sidebar and the item list with a handle on the hairline at each one's end edge. The sidebar goes from `--rail-min` to `--rail-max` (200px to 400px, default `--rail-w`, 264px), the item list from `--list-min` to `--list-max` (300px to 640px, default `--list-w`, 420px), and the reader pane keeps at least `--reader-min` (480px); the library's script writes the width it draws into `--rail-w` and `--list-w` on the app root. Under `--bp-medium` the sidebar becomes a header above the list, and only the item list's handle stays. Under `--bp-narrow` everything stacks into one column and items open full page, covering the masthead. Grid is a header row (search, the Layout toggle, paste box), a filter bar, then a card grid whose columns are at least `--card-min` (320px) wide and fill the row (`auto-fill`), centred at most `--grid-max` (2560px) wide; the header, the filter bar and the list head share that width. The other pages put their heading and content in one centred column, `--page-col` (880px) wide, or `--page-settings` (1120px) on Settings, with `--s5` at the sides (`--s4` under `--bp-narrow`), and their prose keeps the reading measure. In the Library Style the grid is one ruled table: the cards share their hairlines, with no gap and no corner (`--grid-gap`, `--grid-rule`, `--card-hw`, `--card-r`), and the cards of a row stretch to one height (`--grid-align`). The other Styles keep separate cards with the Style's own radius and shadow, and a gap. In Grid, an item opens as a full page or as a sheet over the dimmed grid, with Previous and Next buttons outside the sheet.

The Reader is one column at the reading measure, centred in its pane. A pane or page wider than the measure, `--s6`, the `--margin-w` (320px) margin column and the side padding together puts the margin column beside it: the summary box, the Related Items, the Highlights list and the Note box, top to bottom. The two columns are centred together. The margin column sticks under the Reader bar, `--s5` below it, and scrolls on its own when it is taller than the visible area. The sheet always shows one column.

The app measures its own width and writes every band it is under to `data-bp` (`--bp-phone`, `--bp-narrow`, `--bp-medium` and `--bp-wide`). Components read that attribute instead of media queries, so a preview can draw the phone form inside a wide window. Under 480px every control grows to the 44px target (`--target`), with the exceptions the target rule under Do's and Don'ts lists, and so do the controls of the Look panel and Instance menu sheets under 760px.

### Named Rules
**The Still Root Rule.** The app root never scrolls. Each pane scrolls itself, and keeping an item in view scrolls only its own pane.

**The Own Width Rule.** Layout responds to the app's width through `data-bp`, never to the window through a media query.

## Elevation & Depth

The system is flat with tonal layering, plus soft ambient shadows on things that sit above the page. List rows, Library Grid cards, panes, the summary box and the repository block are flat and separated by hairlines and the sunk surface; a Grid card answers hover by darkening its edge, never by lifting. The sheet's side buttons and the focused skip button carry the low shadow (`--shadow`), and the Grid cards of the Styles other than Library carry their Style's own shadow (`--card-shadow`). The Look panel, the Instance menu, the reader sheet and the floating paste card carry the high shadow (`--shadow-lg`), over a dimming scrim where they cover the page; the two panels also carry a strong-hairline edge. The masthead has no shadow: a hairline parts it from the screen. In Dark, the sheet adds a strong hairline edge so it shows against the scrim.

The paste card floats under the paste box in List's sidebar from `--bp-medium` (1080px) up, and under the Grid header from 760px up. Below those widths it sits in the page flow between the paste box and the list, with no shadow, so the list moves down while it shows and no row is ever under it. In the sidebar it adds to the sidebar's scroll height, so a window shorter than the card scrolls the sidebar.

### Named Rules
**The Lifted Only Rule.** A shadow means the element sits above the page: a floating layer. Rows, Library Grid cards, panes and boxes inside the reader stay flat.

## Shapes

Corners follow size: `r1` for small parts, `r4` for marks (tag dots, the Read state mark, swatches, the sheet's side buttons, comment avatars), `r2` for controls and `r3` for large containers. The Style sets all four, 2px in Library, so no control, mark or swatch is a pill; a Library Grid card has no corner, because it is a cell of the grid; the Chips Tag style keeps its pill until the Tag is built. Edges are hairlines of the Style's weight (`--hw`, 1px in Library), and dashed hairlines mark placeholders and items still being processed. Pictures crop to their top-left corner, where a screenshot's first line starts.

## Components

### Buttons
A neutral button has no fill and a hairline outline in the control line colour, and takes the sunk fill on hover; `--btn-bg` holds the fill. The accent button (a full accent fill with on-accent text) is for the save button beside the paste box and the main action in a paste card; on hover it mixes 10% of the ink into its fill (`--acc-hover`). A disabled or busy button draws its outline dashed (`--off-edge`) in the strong hairline colour, with muted text. Fills and edges change over `--dur-fade`, and at once under reduced motion. Focus draws a 2px accent-ink ring 2px outside the button. A heading that a script focuses (`tabindex="-1"`), such as a page heading on arrival, a Settings section heading or the Reader's Comments heading, draws no ring, because it is not a control; one rule in the design system holds this for every such heading. A press fills a neutral button with the press fill; an accent-filled button, a checked segment and a pressed chip keep their fill and show a 1px inner ring in the text colour of the fill. The danger button keeps the hover fill and shows a 1px inner ring, because its mark loses contrast on the press fill; the Read state mark of an item instead takes a ring in the text colour round its square while pressed. While a List row, Topic page row or open Grid card is pressed, its Read state mark takes the muted colour, or the accent ink when unread, for the same reason. A plain Grid card keeps its mark colours. In forced colours, selected filters keep their system colours and open Grid cards keep their system border while pressed. Disabled buttons show no press. The names ending in pressed in the front matter mean the toggled state, and button-press and list-row-press mean the moment of the press.

### Chips
- **Filter chips:** Grid's filter bar draws each choice as a neutral button with its count; a pressed chip takes the full accent fill with on-accent text.
- **Tag chips:** a pill on the sunk surface, used only when Tag style is Chips. The default Tag style is a coloured dot before the name, and Text style writes "#name". A name too long for its row wraps inside its own box in the Reader, in every Tag style, with the dot or the "#" beside the first line, and a Chips pill keeps its corner at half the height of one line so a wrapped name stays inside it. A name in a filter row of the rail wraps the same way and the count stays at the row's end. The Grid filter bar uses a native select instead, which stays inside the bar and clips a long name, both in the closed control and in the open list.

### Inputs / Fields
- **Hint:** a field's hint sits between its label and the field, so the browser's suggestion list does not cover it, and it stays while an error shows.
- **Required:** in a form that mixes required and optional fields, a required field's label ends with `*` and one line above the fields says what it means. A form whose fields are all required, or that has one field, keeps plain labels.
- **Focus:** the field's edge turns accent-ink and thickens with a 1px ring outside the border.
- **Invalid:** once a person has used a field and the browser holds its value invalid, the field's edge thickens with a 1px ring in the control line colour. An empty required field also gets a line in the `warn` tone that says it is required, and a screen reader hears that line with the field's label when the field is left empty. The edge never turns `warn`.

### Navigation
- **Filter rail (List):** a selected row takes the soft accent tint and weight 600. The tint measures under 3:1 against the rail, so the change to weight 600 is what shows the state. The Source and Read state rows are segmented controls: like every segmented control, the selected segment takes the full accent fill with on-accent text. The Source control is a grid of at most 3 equal columns, each at least 5.5em wide, so the rail's width alone sets its rows: 2 columns in a narrow rail and 3 from about 254px, whatever the counts read.
- **Segmented controls:** a hairline frame in the strong hairline colour on the surface; a segment takes the sunk fill on hover, and the checked one the full accent fill with on-accent text.
- **Masthead:** the wordmark, then the page links Library, Index, Highlights, Proposals and Log in muted Meta text at weight 500, then the Look button and the Instance menu button at the row's end, on the page ground with a hairline under it. A link turns ink on hover; the current page's link (`aria-current="page"`) is ink at weight 600 with a 2px accent-ink line on the bar's bottom edge. On the library the wordmark is the page's `h1`; elsewhere it is a link to the library. The Look button shows "Aa" in the wordmark's face. The Instance menu button shows the Instance's address, cut at `--host-max` (22 characters), and a chevron, and drops the address when the row does not fit. Under `--bp-narrow`, and at any width where the row still does not fit without the address, the links and the address leave, and a Menu button (three lines) takes the Instance menu button's place.
- **Instance menu:** a panel `--menu-w` wide, aligned to the Instance menu button's right edge, on the surface with `--r3` corners: a muted line that names the address the owner is signed in to, the links Instance settings, Agent tokens, Backup and Import, a hairline, and Sign out. Each row spans the panel, is `--ctl-h` tall (44px under 760px, where the menu is a sheet), and takes the sunk fill on hover and the focus ring inside its edge. The Menu button opens it with the five page links first, the current one in the accent tint at weight 600 with a hairline accent-ink edge round the row; under `--bp-narrow` it opens as a sheet from the bottom.
- **Look panel:** the Look settings in three groups (Reading; Overall look; Items, tags and comments), with Reset look in its footer. From 760px it is a popover under the Look button; under 760px it is a sheet from the bottom.
- **Layout toggle:** a segmented control of two square icon segments (rows for List, a grid for Grid) at the end of the search row, each `--ctl-h` wide and tall. Under 480px the segments draw without the control's frame, each with its own hairline edge, so the toggle stands as tall as the 44px search field.
- **Page head:** a page's `h1` at Display size, left-aligned, with `--s6` above and `--s5` below and no bar; a Topic page puts a link back to the Index above it, Obsidian a link back to Settings. The heading takes focus when the page opens.
- **Index row:** the Topic's name at Title weight, its overview line in muted text on one line with an ellipsis, and the Item count at the end in tabular figures; under `--bp-narrow` the overview drops under the name.
- **Settings rail:** from `--bp-medium` up, a `--settings-rail` (200px) column of links to the sections, in page order, that stays in view while the sections scroll. Under `--bp-medium` it is one row of links that scrolls sideways above the sections, and each edge that hides more links fades into the page. The link of the section that crosses a line at a fifth of the page's height (`aria-current="location"`) is ink at weight 600 with a 2px accent-ink line under it, as the masthead draws its current page. The last section is at least the page's visible height tall, so every link can bring its section to the top. From `--bp-wide` up, each section puts its heading and description in a `--sec-head-w` (280px) column beside its fields (at most `--sec-body-w`, 560px); below that the heading sits above the fields. Sections are parted by a hairline with `--s6` above and below.
- **Pane handle (List):** a 9px hit area (`--split-hit`, 24px for a coarse pointer) that starts on the hairline it moves and lies over the pane after it, so it never covers the scrollbar at the end of the pane before it, with a resize cursor. At rest it draws nothing beyond that hairline. On hover, keyboard focus and during a drag the line draws 2px wide in the accent ink for the pane's full height, fading in over `--dur-fade`; under forced colours it draws in Highlight, and keyboard focus adds the 2px CanvasText ring. While a handle is dragged the root carries `data-resizing`, which shows the resize cursor everywhere and turns off text selection.
- **Reader bar:** one row that sticks to the top of the reader. Its hairline and background span the pane, and its contents keep to the width of the Reader content below: the reading column, or the reading column and the margin column, so in a pane wider than that the buttons end at the content's right edge and Back starts at its left edge. As it narrows it drops, in order, the key hint, the button labels, the comments total and the word on Back. A 2px accent line along its bottom edge shows reading progress.

### Page parts
- **Page empty state:** a page with nothing to list puts, at the page column's left edge and under the page head, a heading at Headline size, one muted line at the body size that says what will show there, and one link that leads to where it starts. It has no icon. The library's own empty list and its "Select an item" pane keep their centred form.
- **Flat note:** a note, a skipped-lines list or a quoted Highlight is a box with a full hairline edge on the surface, `--r3` corners and body text, or plain muted text with its link under it. No note, quote or box carries a bar down one side. A comment tree's indent guide and a rendered post's blockquote rule are structure and keep their line.
- **Log table:** the Log is a ruled table in the page column: a header row of Labels (Time, Change, Subject, Details), then for each local day a row that holds the date in the mono face, then the entries. A row shows its time in the mono face with tabular figures and muted ink, the change in plain words, the subject and the details, where Tags take their Tag style. Hairlines part the rows. Under `--bp-narrow` the header row is hidden from sight but stays for screen readers, and each row stacks: time and change on one line, the subject under it, then the details.
- **Command (Settings):** a shell command is one line in the mono face on the sunk surface with a strong-hairline edge. A command wider than its box scrolls sideways, fades at each edge that hides more, and becomes a keyboard stop named Command followed by the command's text; it never breaks inside a word or a flag. Code blocks and wide tables in the Reader scroll and fade the same way.
- **Ruled list (Settings):** a short list of name and value, such as the X posts states or the token scopes, is a hairline-ruled list with the name in a `--sec-name-w` (140px) column: the X posts states take the Label style for the name and Meta for the state; a scope row takes its checkbox and its name at weight 600, with its description in the hint style beside it, or under it from `--bp-narrow` down.
- **Import form:** at most `--import-form-w` (640px) wide, in two parts parted by a hairline: the Links field with its hint, its count and the start button, then the file part with its label, its hint and the Choose file button. The progress, counts and refusals of a run use the page column; the Provider and Reddit notes keep the form's width.

### List row (signature)
A List row opens with the kept bar and the kept strip. The kept bar is a 3px line of accent along the row's top edge, as wide as the ratio the kept strip's count reads once a Digest covers the thread (`--kept`; Kept 5 of 100 draws a 5% bar), and empty before that or on an Item without comments. The kept strip follows: the Read state mark, then the Source, the place (a community, a handle, a repository or a domain) and the comment count, in the mono face at the label size in muted ink, parted by small squares. A Reddit Item whose community is known names the community without the Source. The strip wraps between its parts and is never cut, and no wrapped line of the strip or the byline starts with a square: each square sits in the gap before its part, out of the text flow, and the line's start edge clips it (`overflow-x: clip`). The title follows, then the byline: the author (not when the strip already names it: an X post whose link names its author, or a GitHub repository), the saved time, the Topic and a repository's stars. Beside the title and byline sits the 40px stored picture, or, with no stored picture and Card images On, a tile of the Topic tint (`--tint` of the Topic's hue in the sunk surface; the hue comes from the Tag hues, hashed from the Topic's name, at the Style's Tag chroma, so a Style whose Tags carry no colour, such as Cal.com, draws an untinted tile) with the Source mark and no text, at every Density.

The Read state mark is an 8px square (`--mark`) at the start of the strip, filled with the accent when unread and drawn as a control-line outline when read, with a `--dot-hit` hit area. The strip keeps room above and below its line for that hit area (44px on a phone), so a tap on the title or on the row above never flips Read state. Hover rings it in the control line, and keyboard focus rings it in accent ink. A Topic page row draws its own round-cornered dot at the start of its metadata line as a mark with no hit area, because that page sets no read state. The open row takes the soft accent tint and a 1px accent-ink edge round the whole row, so shape tells it apart from hover. A focused row draws its 2px accent-ink ring inside its own edge, because the pane that scrolls the list clips anything drawn outside a row; on the open row the ring sits just in from the edge, so both stay visible. Under forced colours the open row keeps a 1px Highlight edge and its focus ring sits inside that edge, and the open Grid card takes a 3px Highlight border.

### Grid card
A Grid card holds the same parts as a List row in a column: the kept bar and the kept strip, the stored picture in a 16:10 box, the title and the byline. A card with no stored picture draws no picture box. On hover its edge darkens to the control line; the open card takes the soft accent tint and the 1px accent-ink edge, like the open row, and keyboard focus draws the 2px ring inside the card.

### Comment tree (signature)
Kept comments nest with an indent per level that is capped, so deep threads stay readable. Context stubs, dropped parent comments shown as one line so a kept reply under them still reads correctly, are muted, one line, and dashed when they have a box.

### Motion
Opening an item grows its card or row into the reader over `--dur-move` with `--ease-move`. Fades and small turns take `--dur-fade`. Under reduced motion the app skips the grow, the spinner and shimmer stop, and the filter chevron stops turning.

## Do's and Don'ts

### Do:
- **Do** take every value from a token in `design/system/tokens.css`. The only literals are the ones the header of that file lists.
- **Do** add a new Look option as a `data-*` rule on the app root that lists only the tokens it changes, and add the option to the settings table in `design/system/settings-table.ts`.
- **Do** keep every text and background pair at 4.5:1 or more, and every mark, icon and border a person needs to see a control or its state at 3:1 or more, in every theme with every accent and Style.
- **Do** draw the edge in the control line colour (`--ctl-line`) when the edge is what shows the control, such as a field or a read Item's Read state mark. It measures 3:1 or more against the page, the surfaces and the open row's tint, in every theme with every accent. The hairline colours (`--line`, `--line-2`) measure 1.2 to 2.1:1 against the page and both surfaces, so they only separate regions or edge a control that shows visible text. Both figures are WCAG relative-luminance ratios computed from the OKLCH values in `tokens.css`.
- **Do** make every target at least 44px under 480px, except the width of a link or a Highlight mark in the text of a rendered post or comment (`.md`), a code block included. Each keeps the width of its text, so two marks side by side never share a tap area, and `--link-pad` sets its height. A mark that wraps a picture has the picture's size (WCAG 2.2 SC 2.5.8, [Inline exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- **Do** mark the open row and the open Grid card with their accent-ink edge as well as their tint.
- **Do** give every animation a reduced-motion form.
- **Do** keep the reading column at the Text width setting's measure, and keep the Read state mark at the start of the kept strip, never on a picture.

### Don't:
- **Don't** set any text under 12px.
- **Don't** build a social feed's chrome: vote arrows, avatars ahead of an item's title in the list, or engagement counts as the loudest thing on a row.
- **Don't** build a SaaS dashboard: gradient hero cards, number tiles, or icons in coloured circles.
- **Don't** fill an area larger than a control with the full accent. Use the soft tint.
- **Don't** scroll the app root, and don't use media queries for width. Read `data-bp`.
- **Don't** give List rows, Library Grid cards, panes or reader boxes an elevation shadow.

## Brand Brief

This section describes the target look, not the app as built. The sections before it describe the app as built. [The product brief](PRODUCT.md), Brand Brief, holds the idea, the signature element (the kept strip), the voice and what a Style is. This section holds the visual rules of the brand, the tokens a Style may set, the chosen direction, and the rules of this file and of other docs that the Brand Brief contradicts.

Chosen direction: Quarto. [Brand direction](docs/design/brand-direction.md) gives the reasons.

Quarto's neutral hue and chroma, faces, default accent, corners, hairlines, shadows, button fill and Tag drawing become the Library Style and the brand's components. The Light and Dark Themes keep the lightness steps they have today, and Quarto's table below is built on them. Sepia keeps its own warm paper and ink and its own accent lightness and chroma, so it ignores Quarto's neutral hue and chroma. It takes the rest of Quarto: the faces, the default accent's hue, the corners, the hairlines, the shadows, the button fill and the Tag drawing.

### Shape language

- Controls, fields, cards, boxes and panels are square or nearly square: every corner is 0 to 4px (`--r1` to `--r3`). No control, Tag, mark or swatch is a stadium, a shape whose corner is half its height, so the brand draws no pills. Pills are the common shape of product sites today, so a pill would not mark a screen as Threadsift.
- Hairlines draw the structure: a row divider, a card edge, the rule above the kept strip. Tone (page, surface, sunk surface) separates regions where a line would be noise.
- Marks are squares: the unread mark, the Accent swatch and a Tag's colour mark.
- No row, card or box carries a bar down one side. A selected or open part shows its state through its fill, its text weight or an edge round the whole part.

### Colour world

- The page is cool or neutral. The brand names one neutral hue and chroma (`--nh`, `--nc`), and a Style keeps the chroma at 0.008 or less. Every neutral of Light and Dark is the Theme's lightness step at that hue and chroma, and the Light surface takes half the chroma, the way the tokens derive the neutrals today. Warm paper and cream are a common look of product sites today, so a cream page would not mark a screen as Threadsift. Sepia stays the one warm Theme, as a reading choice.
- List and Grid share one neutral world, so the Grid's own tilt of the greys goes.
- The One Accent Rule and the Theme Owns Lightness Rule (Colors, above) stay. The brand names its default accent hue, and the Theme sets the accent's lightness and chroma for every hue.

### Faces

- Three roles: a UI face for titles, labels and controls; a reading face for post, comment and summary text, which may be the UI face; and a monospaced face for the kept strip and code.
- Every face is served from the Instance, so its licence must allow self-hosting: each face named in the Brand Brief is under the SIL Open Font License 1.1 and is published on Fontsource, where the app takes today's faces from. `pnpm run check:faces` checks that every Font and Style stack in the tokens, and the wordmark's, starts with a face the app loads.
- The Font setting offers four pairs. Three are the pairs of the three Styles, and choosing a Style writes its pair into the setting. The fourth is chosen for legibility: Atkinson Hyperlegible Next for the UI and reading text, and Atkinson Hyperlegible Mono for the kept strip and code. Both are under the SIL OFL 1.1, from [Google Fonts](https://github.com/google/fonts), and on Fontsource as variable fonts with weights 200 to 800 and an italic. The owner can choose any of the four under any Style. The Plain Panel Rule (Typography, above) stays.

### Motion

- One orchestrated move: opening an Item grows its row or card into the Reader over `--dur-move` with `--ease-move`, and closing runs it back into the same place. The View Transitions API can carry the card's cover and title into the Reader header.
- Fades and small turns take `--dur-fade`. A card stays still on hover: its edge darkens instead of lifting. Lists never enter in a staggered cascade. Agent work shows as a status word and a 1px line, never as a glow or a sparkle.
- Every move has the reduced-motion form the Motion rule above describes.

### Covers

- An Item with no stored picture gets a cover in the Grid card, in the same 16:10 box as a stored picture. The cover holds the Item's own first lines in the reading face, top left, fading out at the bottom, the Topic tint and the Source mark, and nothing else.
- A cover draws no strip of its own. The kept strip directly above it in the card already names the community or the Source, the handle, the language or the domain, and counts a thread's comments.
- A repository's stars and an Article's reading time sit on the card's line under the title, with the author and the date.
- A List row of an Item with no stored picture shows a 40px tile in place of the picture, with the Topic tint and the Source mark and no text, at every Density.
- A cover never repeats the title and never shows vote arrows or counts of likes, and its text never goes under 12px.

### What no Style may change

This is the one list of what makes the brand. The wordmark and the icon; the kept strip; where a cover sits and how it is drawn, wherever Card images shows one; where every pane, bar and control sits in List, Grid and the Reader; the parts of every component (a List row, a Grid card, the Reader header, the summary box, the comment tree, a button, a field, a Tag); the type scale, the One Reading Size Rule and the 12px floor; the shape language above; the Theme's lightness steps and the contrast floor; the motion; and the voice.

A setting still changes what it names. With Card images Off, a List row and a Grid card draw no cover and load none, and the kept strip stays: it opens the row, and it opens the card above the title.

### Tokens a Style may set

| Token | What it sets | Allowed values |
|---|---|---|
| `--nh`, `--nc` | hue and chroma of the neutrals in Light and Dark | chroma 0 to 0.008 |
| `--r1`, `--r2`, `--r3`, `--r4` | corners of small parts, controls, containers and marks | 0 to 4px |
| `--hw` | the weight of row dividers, card edges and rules | 1px or 2px |
| `--shadow`, `--shadow-lg` | a shadow, or none | the brand's soft shadow, or none with a 1px strong-hairline edge on floating layers |
| `--btn-bg`, `--chip-edge`, `--chip-hover`, `--chip-w`, `--off-edge` | how a neutral button and a filter chip are drawn | outline, sunk fill or surface fill; a dashed or solid disabled outline |
| `--acc-hover`, `--acc-lift` | how the accent button answers hover | its fill mixed toward the ink, or a brightness lift; the label keeps 4.5:1 |
| `--seg-bg`, `--seg-lift`, `--rail-seg-bg`, `--seg-on`, `--seg-on-fg`, `--seg-on-press`, `--seg-on-ring` | the ground, hover fill and selected look of segmented controls | the full accent fill with on-accent text, or the accent tint |
| `--tag-dot`, `--tag-mark`, `--tag-gap`, `--tag-pad`, `--tag-pad-y`, `--tag-box`, `--tag-bg`, `--tag-fg`, `--tag-c` | how a Tag is drawn, inside the brand's one Tag | no pill; the Tag's text keeps 4.5:1 on its ground in every Theme |

A Style also writes a Font and an Accent into the settings. These are setting values, not tokens. Every other token belongs to the brand or to a Theme, and the lightness of every neutral and of the accent belongs to the Theme. A Style can still set the colours of a Tag's text and ground, so the contrast check runs for every combination of Style, Theme, Accent and Font.

### Rules of this design system that the Brand Brief contradicts

These rules describe the app as built and stay until Quarto is built. That build changes them.

- Shapes, and Components, Chips: the Chips Tag style as a pill. Quarto draws no pill.
- Colors, Neutral, and Components, Chips: three Tag styles, with a coloured dot before the name by default. Quarto draws one Tag: a square swatch before the name.
- Shapes, Components and Colors: the ten Styles other than Library keep pill marks, filled neutral buttons and filter chips, solid disabled outlines, the accent tint on a pressed List filter segment, an unchanged accent button hover, no fades, and the browser's own text selection and native control colours. The Library values reach only Library.
- Typography: the Font setting's six pairs. Under the Brand Brief the Font setting offers four.
- Typography, Title: the Cal.com Style, one of the Styles the app has today. Under the Brand Brief the app has three Styles: Library and the two the product brief names.
- Layout: in Grid an Item opens as a full page or as a sheet, as the owner chooses. Under the Brand Brief, Grid opens a sheet from `--bp-medium` (1080px) up, with a button that expands it to a full page, and a full page below that width.
- Elevation & Depth: the reader sheet and the floating paste card carry the high shadow with no edge in Light. Quarto gives the reader sheet a 1px strong-hairline edge as well.
- The Reader header: the source line opens the header above the title. Under the Brand Brief the strip and the unread mark open the line under the title, before the author and the date.

### Rules of other docs that the Brand Brief contradicts

- [The spec](docs/spec.md), Style, and [the glossary](GLOSSARY.md), Style: Library plus 10 Styles, and a Style other than Library replaces Font and Accent, whose controls are disabled, with the note "{style} sets Font and Accent. Choose Library to change them." under Style Under the Brand Brief the app has three Styles, choosing one writes its Font and Accent into the settings once, the owner can change either, and no control is disabled.
- The spec, Look settings, and the glossary, Look settings: Tag style (Chips, Text, Dots) and Comment style (Indented lines, Cards, Rail), where Rail draws an avatar beside each comment. The brand draws one Tag and one comment tree, with no avatars, so both settings go.
- The spec, Look settings: Font offers 6 pairs. Under the Brand Brief it offers four.
- The spec, Look settings: Density offers Compact, Comfortable and Roomy. Under the Brand Brief it offers Compact and Comfortable.
- The spec, Layout and reader, Reset look and Storage, and the glossary, Reader style: the "Open items as" setting (Page or Sheet). Under the Brand Brief, Grid opens a sheet from 1080px up and a full page below that, so the setting goes.

### Quarto

A technical monograph: one grotesque family, a ruled matrix of hairlines, and a green ink.

Quarto is drawn as a whole component kit on synthetic Items in the prototype ([the kits README](design/prototype/kits/README.md)): buttons, fields, chips, the List row, the Grid card with a cover, the Reader header, the summary box, the comment tree and the Settings panel, in List, Grid and the Reader, in every Theme. It also says what the two other Styles set on it; Broadsheet and Workbench are their working names, which the owner may change when they are built. Quarto copies no reference: it takes techniques, and its Sources line names the public page each came from.

The table below is the Theme's lightness steps at Quarto's neutral hue and chroma and default accent hue. Each contrast figure is a WCAG 2 ratio of relative luminance, computed from the OKLCH value converted to sRGB. In Light and Dark, ink measures 10.8:1 or more and muted ink 5.6:1 or more on the page, the surface, the sunk surface and the accent soft tint. Accent ink measures 5.3:1 or more on those four, the control line 3.2:1 or more against them, text on the accent fill 5.4:1 or more, and the accent fill 4.8:1 or more as a mark on the page and both surfaces. Every value in the table lies inside sRGB. The other accents are measured when Quarto is built.

| Token | Light | Dark |
|---|---|---|
| Page (`--bg`) | `oklch(0.976 0.005 180)` | `oklch(0.175 0.005 180)` |
| Surface | `oklch(0.995 0.0025 180)` | `oklch(0.215 0.005 180)` |
| Sunk surface | `oklch(0.948 0.005 180)` | `oklch(0.25 0.005 180)` |
| Hairline | `oklch(0.89 0.005 180)` | `oklch(0.31 0.005 180)` |
| Strong hairline | `oklch(0.80 0.005 180)` | `oklch(0.40 0.005 180)` |
| Control line | `oklch(0.60 0.005 180)` | `oklch(0.60 0.005 180)` |
| Ink | `oklch(0.22 0.005 180)` | `oklch(0.94 0.005 180)` |
| Muted ink | `oklch(0.46 0.005 180)` | `oklch(0.74 0.005 180)` |
| Accent fill | `oklch(0.50 0.14 145)` | `oklch(0.75 0.12 145)` |
| Accent ink | `oklch(0.47 0.14 145)` | `oklch(0.79 0.11 145)` |
| Accent soft | `oklch(0.935 0.035 145)` | `oklch(0.31 0.05 145)` |
| On accent | `oklch(0.99 0 0)` | `oklch(0.19 0.02 145)` |

- **Neutral world:** cool limestone, a grey with almost no colour: `--nh` 180, `--nc` 0.005.
- **Accent:** Moss, hue 145, one of today's five accents, read here as a pine-green ink.
- **Wordmark and icon:** the wordmark is "Thread" in ink and "sift" in the accent ink, in Schibsted Grotesk at weight 600, as the kit's masthead draws it. The icon is a square of the Moss accent fill with corners of 2 in 64, holding a nested thread in the on-accent colour: three kept rows that step in one level each, with a hairline above each reply for a comment that was dropped. The rows sit 4 in 64 left of centre, so the mark's weight is centred. It reads at 16px as three white rows on green, and stands on Light and Dark surfaces without an edge. The design system's icon source holds the drawing, and `pnpm run build:icons` writes the favicon, the manifest's icons, the Apple touch icon and the Extension's icons from it, with the colours of the Light Theme and the Moss accent in the tokens. The maskable icon scales the mark until its farthest corner lies 1px of the 512px icon inside the circle of radius 40% that every mask keeps, so no antialiased pixel of the mark falls outside it.
- **Faces:** Schibsted Grotesk for display, UI, titles and reading text, and Commit Mono for the kept strip and code. Schibsted Grotesk: SIL OFL 1.1, from [Google Fonts](https://github.com/google/fonts), on Fontsource as a variable font. Commit Mono: SIL OFL 1.1, from [the Commit Mono repository](https://github.com/eigilnikolajsen/commit-mono), on Fontsource in static weights 200 to 700.
- **Corners:** 2px on controls and small parts. 0 on cards, which are cells of the grid.
- **Hairlines:** 1px everywhere. Grid cards share their rules, with no gap between cells, so the grid reads as one ruled table.
- **Shadows:** none on the page. The Look panel, the Instance menu and the reader sheet keep a 1px strong-hairline edge and the brand's soft high shadow.
- **Buttons:** a neutral button has no fill and a 1px control-line outline, and takes the sunk fill on hover. The main action is a solid accent fill.
- **Tags:** a 6px square in the Tag's hue before the name, in muted ink.
- **Unread mark:** an 8px solid accent square at the start of the kept strip. A read Item shows the square as a control-line outline.
- **Kept strip:** Commit Mono at 12px in muted ink. In a List row and a Grid card it is the first line of the cell, under a top rule that holds a 3px bar. Once a Digest covers the thread, the accent part of the bar is the ratio the strip's count reads (shown over total, where total is the larger of the count the source reports and the comments saved), and the rest is hairline. Before that, and on an Item without comments, the rule is all hairline. In the Reader the header opens with the same rule and then the title, and the strip sits under the title, at the start of the line with the author and the date.
- **Covers:** the cover of the Covers section above, with the Topic tint mixed at 9% into the sunk surface.
- **Room for the other Styles:** Broadsheet sets 0 corners, the 2px hairline, no shadow on floating layers and a serif reading face, Source Serif 4. Workbench sets Commit Mono for the UI face and chroma 0.
- **Sources:** the grey 1px line that organizes the whole page comes from [Exhibition Magazine](https://styles.refero.design/style/597355de-6167-4f37-8f14-b3897919a94c). Depth from tonal steps instead of shadows, and small mono metadata, come from [Vercel](https://styles.refero.design/style/f24daf3a-d43f-4dec-85a9-8ac1d5148a03). Small squared buttons with a hairline outline variant come from [Stripe](https://styles.refero.design/style/48e5de76-05d5-4c4e-a269-c7c245b291ec). Cards with no radius and thin borders come from [Nofilter.space](https://styles.refero.design/style/4235ebdc-a070-46ef-abbf-692151449bea).
- **Risk:** it can read as austere and close to developer tools, and a reader who wants warmth finds none in Light.
