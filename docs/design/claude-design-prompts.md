# Claude Design prompts for the Library app

Attach `<scratch>/library-sample-data.json` to prompt 1.

## Prompt 1: four drafts in one file, with a Tweaks panel

```text
Design a personal reading library web app called "Library". It is a single page where I keep things I saved elsewhere: Reddit posts, single Reddit comments, X posts with their threads, GitHub repos, and web articles. Desktop first, and it must also work at phone width.

How the product works (fixed, do not redesign these rules):
- I add items by pasting one link at a time into a paste box. An agent then fetches the item and fills it in, which takes up to about a minute, so an item shows a "processing" state first.
- An agent sets every topic and tag. There is no tag editing, no manual tagging, and no drag-to-organize anywhere. The only thing I change by hand is read or unread.
- Each item has: one topic, up to 3 tags, a 2-line summary, a few key points, the original post, and only the useful comments (the agent drops the noise). When a kept reply sits under a dropped comment, the dropped one shows as a one-line stub so the tree still reads correctly. Show "kept 6 of 142 comments"-style counts.
- Full-text search over everything, plus filters by source (Reddit, X, GitHub, article), topic, tag, and read/unread.

Use the attached library-sample-data.json as the content. It holds 18 real items. Topics, tags, summaries, key points, and which comments are kept are not in the file: invent them plausibly from each item's own content, the way the agent would. Do not write any other marketing or filler copy; interface labels are fine.

Screens and states to show:
1. Library view with the paste box, search, filters, and the item list.
2. Reader for a Reddit post with images and a kept-comment tree, including one stub.
3. Reader for an X post with its quoted post and kept replies.
4. Reader for a GitHub repo.
5. Paste box states: idle, processing, done, failed (for example "Reddit blocked the request"), and "already saved, refreshed".
6. Empty library.

I want to compare directions before choosing, so make 4 drafts that differ in direction, not just colour: different layout, type pairing, colour, density, and how the list and the reader relate. For example: a three-pane mail-style layout, a single scrolling feed with inline expanding cards, a visual card grid with the reader as an overlay, and one bolder idea of your own. Put all 4 drafts in one file, switched from a Tweaks panel.

Tweaks panel requirements:
- Floating, bottom-right, titled "Tweaks", toggled with the T key, and fully hidden when off, so the design looks final.
- First control: draft switch A, B, C, D (keys 1 to 4).
- Then 6 to 8 independent axes that work on top of any draft: theme (light, dark, sepia), density (compact, comfortable, roomy), type pairing (at least 4), accent colour (at least 4), reader width, comment tree style (indented lines, cards, threaded rail), tag style (chips, plain text, coloured dots), and images on or off.
- Show only the axes that change the current screen.
- Write every value to the URL query string as well as localStorage, so any combination can be bookmarked and reopened exactly.
- A "Save preset" button that names the current combination, a list of saved presets to reload or delete, and a "Shuffle" button that picks a random combination.
- A "Compare" mode that shows two presets side by side on the same screen with the same data, so I can judge two directions at once.
- Keep the panel compact: grouped controls, no tabs, no scrolling.

Check contrast and keyboard focus in every draft and theme before showing it to me.
```

## Prompt 2: after the first result

```text
Before I review: save this version as a checkpoint named "drafts-v1" and tell me where it is stored. Then list what each draft A to D is trying to do in one line each, and anything from my brief you could not do.
```

## Prompt 3: narrowing down (fill in after review)

```text
Keep drafts <X> and <Y>, drop the others. Make 2 new variations of each kept draft that push it further in different directions, as drafts <X>1, <X>2, <Y>1, <Y>2 in the same Tweaks panel. Keep every axis and the Compare mode working.
```

## Prompt 4: design system (final, after round 7; Omer: P0-P2 do not gate)

Where: the "Design System" session (claude.ai/design, Design systems), with library-design-system.zip attached in its chat.

```text
Build the design system for "Library" from the attached library-design-system.zip. Library is my personal reading library: I paste one link at a time (Reddit, X, GitHub, articles), an agent sets the topic, up to 3 tags, a 2-line summary and key points, and keeps only the useful comments; read or unread is the only thing I set by hand.

The zip is the working prototype plus screenshots. Use its files in this order:
1. tokens.css is the source for every token. Take each value as written, keep its names, and add no value it does not have. The default of each setting is the plain value; every other option is a [data-*] rule on the app root.
2. The .dc.html components and library.js show how the tokens are used and every state; open Main.dc.html to see the app work. support.js and vendor/ are the tool's runtime, img/ and data.json are sample content.
3. screenshots/ shows List, Grid, Grid as Page and Grid as Sheet in Light, Dark and Sepia at 1440, a GitHub README, the settings panel, the phone views at 390 and the phone settings sheet.

Cover both layouts (List and Grid), both reader styles (Page and Sheet), all three themes (Light, Dark, Sepia) and every look setting: Font (5 pairs), Text width, Density, Comment style, Accent, Tag style and Card images. For each setting show its options side by side, the tokens each option changes with their values, and mark the default. "Reset look" resets only these seven; Layout, Open items as and Theme stay.

Colors: every colour token with its role in each theme (surface, text, muted, line, accent, focus, read and unread, success and failure, the tag colours), and each text and background pair with its contrast ratio.
Typography: the five font pairs and the type scale as tokens.css defines it (label, meta, code, h2, body, title, reading size, display), how Density and Font scale the body, title and reading sizes, and the reading width in characters per line.
Spacing, Corner radius, Shadows: the tokens as written, plus control heights, icon sizes, layers, the breakpoints (480, 760, 1080, 1440) with the grid column counts, and motion (the two durations, the easing and the reduced-motion form).

Components, each with its states and its phone form: settings gear and settings panel (three groups, Reset look, the phone sheet with its header and footer), paste box with its card (reading the link, added, already saved and refreshed, failed), filter (sources, status, topics, tags), list row, grid card (with image, text only, read, unread, new), reader bar (List, Page, Sheet, phone), reader header with posted and saved dates, summary block with key points, post text (paragraph, heading levels, quote, list, code block with fold, table, rule, link), GitHub repository block with README, comment tree (kept comment, OP badge, Context stub, fold, nesting, in each comment style), read or unread toggle, empty state, key hint.

On the Overview page write the principles, the keyboard map and the accessibility rules (44px targets under 480px, 12px minimum text, the focus ring, nothing shown by colour alone). Main.dc.html's Compare view and the Tweaks panel are prototype tools; leave them out of the system.

Known issues in the prototype; fix them in the system instead of copying them:
1. Settings: let one table own each setting's id, label, attribute and default, and build the key lists, the defaults and the root attributes from it. Card images uses the ids "on" and "off". Each look block in tokens.css names its plain option in a comment (for example `/* plain: plex */`).
2. Theme and Layout are attributes like the other settings, with the setting ids: `data-theme="dark"`, `data-layout="grid"`. The reader style that depends on width as well as on Open items as becomes `data-reader` (pane, page, sheet).
3. Write the accent formula once, in the block that works out values, and let any element with `data-accent` work out its own `--acc`; the swatch then uses `var(--acc)`.
4. Make `--side-gap` hold the 56px the Previous and Next buttons need plus a margin, and drop the fallback that moves them into the bar, which never runs.
5. Put every value in tokens.css: the 8 tag hues as `[data-tag="0"]` to `"7"` rules, `--sheet-now` next to `--sheet-w`, the phone Comment style overrides next to their option, and a header line that names the per-element variables (`--d`, `--tag-h`, `--progress`, `--fade-to`).
6. Card images Off must not load the card pictures, only hide them.
7. The Reset look footer says in visible text that Layout, Open items as and Theme stay; today it is only a tooltip, which touch devices never show.
8. Keep a number range such as "30–40" together in a table cell with a no-wrap span, not an invisible word joiner that copies along and also catches dates.
9. Add `text-wrap: pretty` to post text paragraphs, list items and quotes, as summaries and key points have.
10. In Grid as Sheet the summary card is a bordered box inside the bordered sheet, and with Cards comments the comment cards nest there too; give the summary block a flat form inside the sheet.
11. Chips tags have 1px of space above and below the text; give them vertical padding that fits.
12. The 12px uppercase section labels (Key points, Original post, Comments) are h3 above 20px markdown headings that are h4, so the visual order is the reverse of the outline; make the section labels the stronger heading or the post headings smaller, so both orders agree.
13. In Sepia the selected-row tint still reads as a cyan block with Teal: build Sepia's `--acc-soft` by mixing the accent tint with the sepia surface (for example `color-mix(in oklch, oklch(0.895 0.03 var(--ah)) 45%, var(--surface-2))`) so Teal, Moss and Cobalt stay warm, keep `--acc-ink` on it at 4.5:1 or more, and make the comment on `.th-sepia` state the real value.
14. Nothing may scroll the app root: keep the selected row visible by scrolling the list pane only, after fonts and layout are ready, and set `overflow: clip` on the app root (one cold first load scrolled it 217px).
15. Say in the system who owns defaults: tokens.css owns what each default option looks like, the settings table owns which option is the default, and one check confirms the option named as default is the one drawn when no attribute is set.

Tell me what you could not take from the attachments.
```

## Prompt 2b: counter prompt after the review of drafts-v1 (keeps A and D)

```text
First save the current version as a checkpoint named "drafts-v1" and tell me where it is stored.

Then keep drafts A (Mail) and D (Index) and drop B and C. Steal from them: B's reading type (Newsreader-style serif at 17-18px for post and comment text) and C's sticky reader header on phone.

Fix these in both kept drafts:
1. Paste status, phone: under 480px wide, lay out every paste status card as a column: icon and title, then the URL wrapped (no clipping), then Try again, Open and Dismiss as full-width 44px buttons. Today "Try again" sits past the right edge at 390px, so a blocked link cannot be retried.
2. Paste status, draft A desktop: the failed, done and refreshed cards are drawn behind the list pane and cannot be seen. Put the card inside the sidebar under the Add button, full width.
3. Touch targets under 480px: every button, filter and link at least 44px high. Minimum text size 12px at every density (some meta lines are 10.5-11px today).
4. Kept comments end in "..." mid-sentence. Show the full comment, folded after 6 lines with a "Show full comment" control.
5. Rename the stub label "Not kept" to "Context", with the tooltip "Removed comment shown so the replies below make sense".
6. GitHub reader: show the repository's own topics as plain muted text labelled "Topics on GitHub", not as pills that look like our tags. Add a README section; where the data has no README text, show the visible placeholder "[README excerpt]".
7. Keyboard: j/k move through the list, Enter opens, m toggles read, / focuses search. Show these keys as a small hint near Mark read.
8. Summaries must say what the kept comments concluded, not only what the post says. Redo the Garmin, Proschi, Hyper Solutions and Agenix summaries; the Agenix one states OP's original worry as fact although OP's SOLVED note and the kept replies retract it. Apply the high-pass filter strictly: drop replies that only agree, thank, or repeat the post (for example the CapMonster and ZennoLab replies on the Hyper Solutions thread), so the "kept N of M" counts drop.
9. In dark theme set images to 90% brightness with a 1px border.

Draft A only:
- Show the 2-line summary under each list title (2 lines, not 1); shrink the thumbnail to 40px.
- On desktop, open the first unread item in the reader on load; keep "Select an item to read" only when the filtered list is empty.
- Source and Status become two compact segmented rows at the top of the sidebar. Topic and Tags become collapsible groups (Topic open, Tags closed) showing 5 rows plus "All N", with live counts.

Draft D only:
- With a reader open, collapse the masthead to a 48px bar (small wordmark left, paste icon button right) and make the Index / Mark read / Open bar sticky. Keep the large wordmark on the library screen.
- Show the 2-line summary under each index entry (14px, muted).
- Move the unread marker into the numeral column left of "01" (filled for unread, ring for read).
- At 1440 widen the margin column to 320px and centre the spread. Keep the reader text measure at about 70 characters (it is about 105 today).
- Keep the condensed serif as the only headline face for D; other type pairings change only body and UI text.

Then make two variations that push further, as drafts A1 and D1 in the same Tweaks panel:
- A1: draft A with D's reader, where topic, tags, summary and key points sit in a margin column beside the original post.
- D1: draft D where the reader opens on the digest (summary, key points, kept comments) and the original post is folded below it.

Tweaks panel: in Compare mode, render each side at its full desktop layout scaled to 50% instead of narrowing it to 720px, and move the panel so it does not cover the right side. A URL without cmp or tw must not inherit Compare mode or a hidden panel from storage. Hide the Images axis on the GitHub reader.

Clean up the file structure so it stays easy to change:
- Put everything that differs between drafts in one table at the top of the script, one row per draft (reader type, grouping, back control, focus target, which list parts show). No `s.d === 'B'`-style checks anywhere else, and do not render a draft's elements in the other drafts.
- One type scale as named variables (label, meta, body, title, brand), about 6 spacing steps, 4 corner radii, and the layout breakpoints defined once and also used by the script. No component rule writes its own pixel size; a draft may only change a variable's value.
- One reusable text renderer (paragraph, heading, quote, lists, code, bold, link) used by the post body, the quoted post and every comment. Remove the three pasted copies.
- One state object with one function that writes it to the URL and storage and one that reads it back, with the same rule for every key (defaults, then saved, then URL). Derive the screen from what is open. Do not refer to items by numeric id.
- Define each accent and type pairing once in a data table and generate the CSS variables and the Tweaks swatches from it.
- Put the Tweaks panel, Compare labels and loading text in a section marked "prototype tool only" with its own variables, separate from the app's design values.
- Store the item images as files in the project, referenced by relative path, so the HTML export includes them (the last export had none).

Fix these bugs:
- The Reddit reader in B and D logs "TypeError: Cannot read properties of undefined (reading 'openId')" from componentDidUpdate on every update; guard against a missing previous state.
- Choosing a paste state in Tweaks within about 2.4 seconds of a real paste is overwritten by the paste timer; cancel the timer when the screen or paste state changes.
- Reloading after opening an item restores a different item.
- In Compare, focus and scroll reset target the left pane only.
- In D, the first topic heading gets a top margin when the processing row comes first.

Finally, check contrast, keyboard focus and 390px width again for A, A1, D and D1 in light, dark and sepia, and tell me what you could not do.
```

## Prompt 2c: counter prompt with Omer's pick (keep A and C, drop B and D, new reader for C)

```text
First save the current version as a checkpoint named "drafts-v1" and tell me where it is stored.

Then keep drafts A (Mail) and C (Grid) and drop B and D.

Draft C: I like the grid, but not the reader sliding in from the right. Make three variations of C that each open an item differently, as C1, C2 and C3 in the same Tweaks panel, all with the fixes below:
- C1, open in place: the clicked card expands into a full-width reader inside the grid, directly under the card's row, and the rows below move down. Close collapses it and keeps the scroll position.
- C2, full page: the card grows into a full-page reader (a short shared-element transition from the card). Back returns to the grid at the same scroll position with the card highlighted. Left and right arrow keys go to the previous and next item.
- C3, centred sheet: a centred reading sheet about 760px wide over the dimmed grid, with previous and next buttons on its sides. On phone it becomes a full screen.
Keep the current right-side drawer as plain C so I can compare against it.

Fix these in A and all C variations:
1. Paste status, phone: under 480px wide, lay out every paste status card as a column: icon and title, then the URL wrapped (no clipping), then Try again, Open and Dismiss as full-width 44px buttons. Today "Try again" sits past the right edge at 390px, so a blocked link cannot be retried.
2. Touch targets under 480px: every button, filter and link at least 44px high. Minimum text size 12px at every density (some meta lines are 10.5-11px today).
3. Kept comments end in "..." mid-sentence. Show the full comment, folded after 6 lines with a "Show full comment" control.
4. Rename the stub label "Not kept" to "Context", with the tooltip "Removed comment shown so the replies below make sense".
5. GitHub reader: show the repository's own topics as plain muted text labelled "Topics on GitHub", not as pills that look like our tags. Add a README section; where the data has no README text, show the visible placeholder "[README excerpt]".
6. Keyboard: j/k move through the list or grid, Enter opens, m toggles read, / focuses search. Show these keys as a small hint near Mark read.
7. Summaries must say what the kept comments concluded, not only what the post says. Redo the Garmin, Proschi, Hyper Solutions and Agenix summaries; the Agenix one states OP's original worry as fact although OP's SOLVED note and the kept replies retract it. Apply the high-pass filter strictly: drop replies that only agree, thank, or repeat the post (for example the CapMonster and ZennoLab replies on the Hyper Solutions thread), so the "kept N of M" counts drop.
8. In dark theme set images to 90% brightness with a 1px border.

Draft A only:
- The failed, done and refreshed paste cards are drawn behind the list pane at desktop width and cannot be seen. Put the card inside the sidebar under the Add button, full width.
- Show the 2-line summary under each list title (2 lines, not 1); shrink the thumbnail to 40px.
- On desktop, open the first unread item in the reader on load; keep "Select an item to read" only when the filtered list is empty.
- Source and Status become two compact segmented rows at the top of the sidebar. Topic and Tags become collapsible groups (Topic open, Tags closed) showing 5 rows plus "All N", with live counts.

Draft C (and C1-C3) only:
- The empty state is broken at desktop: "Library" drops below the paste box, the search box disappears, and the sentence is split into three pieces across the row. Make it one centred block under the header.
- The masonry columns make the date order read wrong (row 1 shows 1d, Oct 25, Oct 12, Sep 7). Keep newest first reading left to right, row by row.
- Most items have no useful image. Design the text-only card on purpose (larger summary, source and kept count) instead of an image card with the image missing. For screenshots, crop from the top so the card shows the start of the image, not a fragment from the middle.
- Put the unread marker in the same place on every card, in the card body next to the source, never on top of an image.
- On phone, nested comment cards take about 40% of the width by the third level; cap the indent so text keeps at least 75% of the width.

Tweaks panel: in Compare mode, render each side at its full desktop layout scaled to 50% instead of narrowing it to 720px, and move the panel so it does not cover the right side. A URL without cmp or tw must not inherit Compare mode or a hidden panel from storage. Hide the Images axis on the GitHub reader.

Clean up the file structure so it stays easy to change:
- Put everything that differs between drafts in one table at the top of the script, one row per draft (reader type, back control, focus target, which list parts show). No `s.d === 'B'`-style checks anywhere else, and do not render a draft's elements in the other drafts.
- One type scale as named variables (label, meta, body, title, brand), about 6 spacing steps, 4 corner radii, and the layout breakpoints defined once and also used by the script. No component rule writes its own pixel size; a draft may only change a variable's value. Draft A must follow the Type tweak for list titles too.
- One reusable text renderer (paragraph, heading, quote, lists, code, bold, link) used by the post body, the quoted post and every comment. Remove the three pasted copies.
- One state object with one function that writes it to the URL and storage and one that reads it back, with the same rule for every key (defaults, then saved, then URL). Derive the screen from what is open. Do not refer to items by numeric id.
- Define each accent and type pairing once in a data table and generate the CSS variables and the Tweaks swatches from it.
- Put the Tweaks panel, Compare labels and loading text in a section marked "prototype tool only" with its own variables, separate from the app's design values.
- Store the item images as files in the project, referenced by relative path, so the HTML export includes them (the last export had none).

Fix these bugs:
- The reader logs "TypeError: Cannot read properties of undefined (reading 'openId')" from componentDidUpdate on every update; guard against a missing previous state.
- Choosing a paste state in Tweaks within about 2.4 seconds of a real paste is overwritten by the paste timer; cancel the timer when the screen or paste state changes.
- Reloading after opening an item restores a different item.
- In Compare, focus and scroll reset target the left pane only.

Finally, check contrast, keyboard focus and 390px width again for A, C, C1, C2 and C3 in light, dark and sepia, and tell me what you could not do.
```

## Prompt 3: counter prompt after the review of drafts-v2 (keep A and C2)

```text
First save the current version as a checkpoint named "drafts-v2" and tell me where it is stored.

Then keep draft A (Mail) and draft C2 (Grid with the full-page reader). Drop C, C1 and C3. From now on call C2 just "C · Grid".

Fix in draft A:
1. The paste status card (failed, done, refreshed) is still hidden behind the list pane at 1280, 1440 and 1920 wide; only 49px of it shows and Try again is invisible. The cause: in the sidebar, `.paste` is a wrapping column and `.ps` (flex-basis 100%) wraps into a second column. Make the card sit under the Add button at the sidebar's full width, with the URL wrapped and the buttons stacked. Check 1280, 1440 and 1920 in all three states.
2. While a paste state shows, keep the reader open on the current item instead of "Select an item to read".
3. j and k open the next or previous item directly in the reader pane, as they do in C, so one key moves one item.
4. At 390, when a paste card shows, let it span the full row under the wordmark (today it is 256 of 390px wide next to an empty 100px column).

Fix in C (the old C2):
5. Show the position between Previous and Next ("5 of 18"), with the left and right arrow keys named in the button tooltips.
6. On Back, play the open animation in reverse into the card.
7. Image cards: crop from the top left so the first line of a screenshot is whole ("PrimeFoldTools/ ndon" and "asone32/llama.cpp-" are cut today). When an image is mostly one dark or flat colour (the Proschi terminal reads as a black box), use the text-only card instead.

Fix in both:
8. Reader text: post and comment body at least 16px at every density, with a text column capped at about 68 characters (lines are 108 to 119 characters today). Density changes list spacing and list text only.
9. Reader bar at widths under 480px: one 56px row (Back, Previous and Next where they exist, Mark read and Open as 44px icon buttons with labels for screen readers). Today it is two rows and 107px high.
10. Nested comments at 390: comment text keeps at least 75% of the screen width at depth 2 and 3 in the lines, cards and rail styles (today 73%, 66% and 59%). Cap the total indent at 16px and show deeper levels with a thin rail only.
11. Key hint: show "j k move · Enter open · m read · / search" in 12px muted text next to Mark read, hidden under 480px. The hint must not live only in the Tweaks panel.
12. Headings: item titles in the list are h2 under the h1 "Library", not h3.
13. Inline links in reader text are 18px high; under 480px give them at least 44px of tap area with padding.
14. With a search active, hide topic rows whose count is 0.
15. Empty library: say "Paste a Reddit, X, GitHub or article link in the box" and add one line: "The agent files it with a topic, up to 3 tags and a short summary."
16. Sort the list by the date I saved the item, newest first, and say so with a small "Newest saved first" label above the list. The date on each row stays the post date; label it "posted 1d ago".

Content fixes in data:
17. Proschi key point 2 says load, latency, availability and cost show "on each card"; the post says only the load shows on each card. Fix it.
18. Garmin summary: "Replies point out", not "Replies conclude", because one kept reply says Garmin's own policy looks clean.
19. Drop James-w07's thank-you reply on the Hyper Solutions thread, and show the Proschi parent "How does this compare to mermaid and plantuml?" as a Context stub.
20. In the Agenix thread, OP's own replies (including the retraction "I now consider it entirely incorrect") are useful: keep them as comments with an OP badge, not Context stubs.
21. The GitHub reader must show `repo.readme` when the data has it, and the "[README excerpt]" placeholder only when it is empty.

Structure, so the file stays easy to change:
22. In Compare, each pane uses its own draft's rules for open, close, keys, scroll and focus. Add one helper that returns the draft of a pane and use it everywhere instead of the current Tweaks draft.
23. Write each draft as its own complete row in the draft table with about 8 fields (list, reader, back, nav, autoOpen, neutral, vars, look), with no shared helper object. Remove fields that are the same in every row or follow from another field (scrim, modal, arrows, grow, slot, stackStatus, focus, the parts flags). Put the rule "is the list hidden while the reader is open" in the table once.
24. One small Inline component renders plain, bold, link and code spans once; paragraphs, headings, quotes, both list types and table cells use it.
25. Define breakpoints and card column counts in one table; set one data-bp attribute per pane from a ResizeObserver on the panes only. Remove the MutationObserver on the body and do not read column counts or text overflow back from the page. Add one note that this exists because Compare scales panes inside the page, and a real build should use container queries.
26. Keep the paste box state in one object (mode, the link being added, the timer) changed only through one function that cancels the timer and updates everything in one step. The generic state setter must not know about paste. This also fixes a bug: opening an item within 2.4 seconds of a paste leaves the Processing spinner running forever.
27. Move the Tweaks panel, the reader styles, the filters and the paste status card into their own component files with their own styles, and the tables into a separate script file if globals reach the component; keep Main for layout and the draft table. Tell me if a split is not possible.
28. data.json holds facts only (kind, ISO dates, score, counts, block and span types). Build template flags and display strings ("1d ago", "Kept 4 of 142 comments") in one place in the script.
29. At most 6 type sizes (merge lead, read and comment sizes), one uppercase label style, 44px touch targets set only by changing the size variables on phone, no unused classes (im-on, has-pic, is-new, read, kept, kids), one table of paste messages, booleans instead of "1"/"0" strings inside the state, tag dot and swatch colours computed in CSS from variables, one img element in Picture with the file name from the data, one back icon element and one read-dot button placed by CSS, and Tweaks rows described by one kind value.
30. Bugs: on first render every pane is treated as 1440px wide, so a phone starts in the desktop layout; a hand-written ?d=C URL gets the saved look of the last draft instead of C's own look.

Finally, check contrast, keyboard focus, 44px targets, 12px minimum text and 390px width for A and C in light, dark and sepia, and tell me what you could not do.
```


## Prompt 3b: same as Prompt 3, but keeps both C2 and C3 for Omer to choose

```text
First save the current version as a checkpoint named "drafts-v2" and tell me where it is stored.

Then keep draft A (Mail) and the two grid variants C2 (full-page reader) and C3 (centred sheet). Drop C (drawer) and C1 (in place). I will choose between C2 and C3 myself, so make both equally finished.

Fix in draft A:
1. The paste status card (failed, done, refreshed) is still hidden behind the list pane at 1280, 1440 and 1920 wide; only 49px of it shows and Try again is invisible. The cause: in the sidebar, `.paste` is a wrapping column and `.ps` (flex-basis 100%) wraps into a second column. Make the card sit under the Add button at the sidebar's full width, with the URL wrapped and the buttons stacked. Check 1280, 1440 and 1920 in all three states.
2. While a paste state shows, keep the reader open on the current item instead of "Select an item to read".
3. j and k open the next or previous item directly in the reader pane, as they do in C2, so one key moves one item.
4. At 390, when a paste card shows, let it span the full row under the wordmark (today it is 256 of 390px wide next to an empty 100px column).

Fix in C2 and C3:
5. Show the position between Previous and Next ("5 of 18"), with the left and right arrow keys named in the button tooltips.
6. C2 only: on Back, play the open animation in reverse into the card.
6b. C3 only: while the sheet is open, j and k go to the previous or next item inside the sheet (as in C2), m toggles the open item, and focus never moves to the cards behind the dimmed grid. Today j moves focus to a hidden card and m then changes that card's read state while the sheet still shows another item. Also add a short open and close animation (the sheet scales up from the card), so C2 and C3 are compared fairly.
7. Image cards: crop from the top left so the first line of a screenshot is whole ("PrimeFoldTools/ ndon" and "asone32/llama.cpp-" are cut today). When an image is mostly one dark or flat colour (the Proschi terminal reads as a black box), use the text-only card instead.

Fix in both:
8. Reader text: post and comment body at least 16px at every density, with a text column capped at about 68 characters (lines are 108 to 119 characters today). Density changes list spacing and list text only.
9. Reader bar at widths under 480px: one 56px row (Back, Previous and Next where they exist, Mark read and Open as 44px icon buttons with labels for screen readers). Today it is two rows and 107px high.
10. Nested comments at 390: comment text keeps at least 75% of the screen width at depth 2 and 3 in the lines, cards and rail styles (today 73%, 66% and 59%). Cap the total indent at 16px and show deeper levels with a thin rail only.
11. Key hint: show "j k move · Enter open · m read · / search" in 12px muted text next to Mark read, hidden under 480px. The hint must not live only in the Tweaks panel.
12. Headings: item titles in the list are h2 under the h1 "Library", not h3.
13. Inline links in reader text are 18px high; under 480px give them at least 44px of tap area with padding.
14. With a search active, hide topic rows whose count is 0.
15. Empty library: say "Paste a Reddit, X, GitHub or article link in the box" and add one line: "The agent files it with a topic, up to 3 tags and a short summary."
16. Sort the list by the date I saved the item, newest first, and say so with a small "Newest saved first" label above the list. The date on each row stays the post date; label it "posted 1d ago".

Content fixes in data:
17. Proschi key point 2 says load, latency, availability and cost show "on each card"; the post says only the load shows on each card. Fix it.
18. Garmin summary: "Replies point out", not "Replies conclude", because one kept reply says Garmin's own policy looks clean.
19. Drop James-w07's thank-you reply on the Hyper Solutions thread, and show the Proschi parent "How does this compare to mermaid and plantuml?" as a Context stub.
20. In the Agenix thread, OP's own replies (including the retraction "I now consider it entirely incorrect") are useful: keep them as comments with an OP badge, not Context stubs.
21. The GitHub reader must show `repo.readme` when the data has it, and the "[README excerpt]" placeholder only when it is empty.

Structure, so the file stays easy to change:
22. In Compare, each pane uses its own draft's rules for open, close, keys, scroll and focus. Add one helper that returns the draft of a pane and use it everywhere instead of the current Tweaks draft.
23. Write each draft as its own complete row in the draft table with about 8 fields (list, reader, back, nav, autoOpen, neutral, vars, look), with no shared helper object. Remove fields that are the same in every row or follow from another field (scrim, modal, arrows, grow, slot, stackStatus, focus, the parts flags). Put the rule "is the list hidden while the reader is open" in the table once.
24. One small Inline component renders plain, bold, link and code spans once; paragraphs, headings, quotes, both list types and table cells use it.
25. Define breakpoints and card column counts in one table; set one data-bp attribute per pane from a ResizeObserver on the panes only. Remove the MutationObserver on the body and do not read column counts or text overflow back from the page. Add one note that this exists because Compare scales panes inside the page, and a real build should use container queries.
26. Keep the paste box state in one object (mode, the link being added, the timer) changed only through one function that cancels the timer and updates everything in one step. The generic state setter must not know about paste. This also fixes a bug: opening an item within 2.4 seconds of a paste leaves the Processing spinner running forever.
27. Move the Tweaks panel, the reader styles, the filters and the paste status card into their own component files with their own styles, and the tables into a separate script file if globals reach the component; keep Main for layout and the draft table. Tell me if a split is not possible.
28. data.json holds facts only (kind, ISO dates, score, counts, block and span types). Build template flags and display strings ("1d ago", "Kept 4 of 142 comments") in one place in the script.
29. At most 6 type sizes (merge lead, read and comment sizes), one uppercase label style, 44px touch targets set only by changing the size variables on phone, no unused classes (im-on, has-pic, is-new, read, kept, kids), one table of paste messages, booleans instead of "1"/"0" strings inside the state, tag dot and swatch colours computed in CSS from variables, one img element in Picture with the file name from the data, one back icon element and one read-dot button placed by CSS, and Tweaks rows described by one kind value.
30. Bugs: on first render every pane is treated as 1440px wide, so a phone starts in the desktop layout; a hand-written ?d=C2 or ?d=C3 URL gets the saved look of the last draft instead of that draft's own look.

Finally, check contrast, keyboard focus, 44px targets, 12px minimum text and 390px width for A, C2 and C3 in light, dark and sepia, and tell me what you could not do.
```

## Prompt 3c (round 3 review fixes; keeps A, C2, C3; attach library-full-text.json)

First save the current version as a checkpoint named "drafts-v3". This time include the main board file in the checkpoint folder (drafts-v2 has Reader, Text, Picture, data.json and images but no main file, so it cannot be restored on its own). Tell me where it is stored.

Keep all three drafts: A (Mail), C2 (full-page reader) and C3 (centred sheet). I will choose between C2 and C3 later, so every fix below that names C2 and C3 goes into both.

Fix in draft A:
1. Under 760px wide, the sidebar's children stop at 263 of 390px (the Paste field is 153px wide and 111px of the screen is empty), because the narrow layout inherits `align-items: start` from the medium layout. Make the Paste field with Add, and the Filters button, fill the row minus 16px padding on each side. Check 390 in the idle, failed and filters-open states.
2. Show counts on A's source filter (Reddit 14, X 2 and so on) as C2 and C3 already do.

Fix in C2 and C3:
3. After Previous or Next, Back, Close, Escape or a click on the dimmed grid returns focus to the card of the item that is open now. If that card is not fully visible, scroll it into view (centred) before the close animation starts, then focus it. If it is already visible, do not scroll, so Back without stepping keeps the exact scroll position. Today, after 12 steps, focus and the shrink animation go to a card 1712px below the screen.
4. Only draft A opens an item by itself. When the draft changes to C2 or C3 (Tweaks, Shuffle, keys 1 to 3, or a hand-written `?d=C2` without `open=`), clear the open item so the grid shows first.
5. Reader key hint: in C2 and C3 show "j k or ← → move · m read · Esc back"; in A keep "j k move · Enter open · m read · / search". Show the hint only from 700px wide, so the reader bar stays one 56px row from 480 to 700px (today it is 66px high at 480 to 540 and overflows by 7px).
6. In C2 and C3, show the paste status card as a floating card under the Paste box (about 420px wide, with a shadow) instead of a row in the header, so the grid does not jump down by 170px when a paste fails.
7. Pairble's card image is a mostly dark phone screenshot. Use the text-only card for any image whose average lightness is under 15% or whose contrast range is small, not only for Proschi.

Fix in all three:
8. Under 480px, draw Mark read as a 24px check-in-circle icon (outlined when unread, filled when read) inside the 44px target, so it does not look like the small list dot.
9. Show the saved date in the reader header ("saved 3d ago" next to "posted …"), because the list is sorted by it. A refreshed paste keeps its first saved date and does not move.
10. Dates outside the current year include the year ("posted Jan 15, 2025").
11. Open and Try again on the paste card are drawn as the primary button; Dismiss stays plain. The code already builds a `primary` flag that the template ignores.
12. The comment fold uses the Width setting's characters per line, and the number of folded lines is written once (today `6` is in two files, so changing Width never changes when a comment folds, and two comments over 7 lines show in full without a "Show full comment" button).
13. In Picture, render nothing when the item has no image file, instead of falling back to the Garmin picture.
14. An `open=` value that is not an item in the data is ignored when the page loads.
15. The C3 focus trap must not include the Tweaks panel controls.

Structure, so the prototype stays easy to change and reads clearly as a reference:
16. Make the library app one component that knows nothing about Compare: one draft, one width, one open item, and its own key listener that ignores keys from outside its own app. Make Compare a separate small shell that shows that component twice, each with its own draft and its own open item, and move the Tweaks panel and presets into that shell. This removes the pane numbers (`_pane`, `data-pane`, `paneSet`, `draftOf(i)`, `bpAt(i)`, `covers(i)`, `paneEl(i)`, the widths array). If two copies of one imported component cannot keep separate state in this tool, tell me and keep the current Compare.
17. Put opening, closing and stepping through one function that runs the view transition, then the scroll, the focus and the highlight, in that order. Remove the hand-over fields between the click handlers and the code that runs after render (`_intent`, the `open` comparison in `componentDidUpdate`, `afterOpen`), and write the saved state from `setS`, the one place that changes it (this removes `_prev`).
18. Keep in library.js only what several components share: the look tables, the state read and write rules, the data preparation and the display helpers. Let each component (Reader, PasteStatus, Filters, Text, Inline and the list row) build its own template flags from the facts it receives, so each template and the code behind it sit in one file. Remove the 14 exports nothing uses.
19. Work out each draft's derived facts (list hidden, modal, animated, shows a placeholder, filter style, nav style) once in one function and use that result everywhere, instead of checking `reader === 'sheet'` and similar strings in 10 places.
20. When the Tweaks panel shows a paste state, store the demo item and link in the paste object, so the card code has no demo branches. Remove the card fields nothing uses (`rowKey`, `processingUrl`, `readPressed`), and add one line saying Done appears only from the Tweaks panel.
21. Pass the real methods to the Tweaks panel instead of one-line wrappers, and let its template branch on each row's kind without the four extra flag fields.
22. Write the 1/0 to true/false conversion once. Write the sheet width formula once as a variable. Name the variables the tool shell supplies (`--vh`). Add a one-line note that Sepia ignores the draft's grey hue. Put the "Kept N of M" text outside the label heading instead of undoing the label style. Add one line saying the image blob cache exists only for the design canvas.

Data:
23. I attached library-full-text.json with the full text the sample was missing: "posts" has the full post markdown for the 6 items marked bodyCut (Hyper Solutions is about 15,000 characters), "comments" has the full markdown for the 8 kept comments marked cut, and "readmes" has the full README for both GitHub items. Replace the cut text with it, convert it to the same block format data.json already uses, and remove the cut flags, so the reader shows real long posts and a real README. The READMEs contain HTML (a, img, h1, p align="center") and relative image paths: render the HTML headings and paragraphs as text and leave out images whose path is relative. Keep the "saved copy stops here" note in the code for a fetch that stops partway, and make it reachable from the Tweaks panel so it can still be reviewed. Check that the fold, the 68-character measure and the reader bar still work on the long Hyper Solutions post and the long comments.

Finally, check A, C2 and C3 in light, dark and sepia at 390, 480, 600, 1440 and 1920 for contrast, keyboard focus, 44px targets, 12px minimum text and no sideways scroll; check that Compare still shows each pane with its own draft's rules; and tell me what you could not do.

## Prompt 3d (round 4 review fixes; keeps A, C2, C3)

First save the current version as a checkpoint named "drafts-v4".

Keep all three drafts: A (Mail), C2 (full-page reader) and C3 (centred sheet). Every fix that names C2 and C3 goes into both.

Long reads, now that the data is full (all drafts):
1. Tables must not break inside words. Siftly's "The 4-Stage Pipeline" table reads "Entity Extract ion" and "Semant ic Taggin g" at 1440 and 390, because `.md` sets `overflow-wrap: anywhere` and a cell can shrink to one character. Keep `overflow-wrap: anywhere` only on code and link text; table cells use normal wrapping, and the table gets `min-width: max-content` inside its scroll box so a wide table scrolls sideways instead.
2. Code blocks: set `pre` to 14px mono (the one exception to the 16px reading size; that rule is for prose). Show a fade on the right edge while a block can scroll sideways. Fold a block taller than 14 lines behind "Show all N lines", like a comment. Give each block a visible focus ring. Check the Siftly directory tree and the long llama.cpp log comment at 1440 and 390.
3. Keep markdown heading levels. Convert the posts and READMEs again from library-full-text.json (it is in this chat's uploads) with `{type: 'h', level: 1..4}`; today all 36 Siftly headings have no level and look the same. Draw three styles: level 1 is hidden when it repeats the item title, level 2 is 20px weight 700 with 1.8em above and a hairline, level 3 and lower are 17px weight 700. A `---` line becomes a rule, not 50 hyphens.
4. A long item needs a way to the comments: when the item has kept comments, put a "Comments 14" link in the reader bar that scrolls to the comment section, and show a 2px reading-progress line under the bar. Hyper Solutions is 8,972px tall and its kept comments start at about 8,400px.
5. Comment fold: decide it after render. Fold a comment only when its full height is more than 8 lines, measured once after render and again when its own width changes; then show 6 lines, counting paragraph gaps. Today at Wide 4 of 8 folds on Agenix hide one line or less. An expanded comment taller than one screen gets "Show less" at the top as well as the end.

Paste card:
6. In C2 and C3, show "Reading the link" only in the floating card under the Paste box. Add the item to the grid only when it is ready, with the New badge; today the placeholder takes the first slot, every card shifts, and they shift back when it fails.
7. Under 760px the paste card goes back into the page flow as a full-width row under the Paste box; at 390 the floating card in C3 now covers Search, Filters and the first card.
8. "Added" and "Already saved, refreshed" close by themselves after 6 seconds; "Failed" stays until Dismiss. Escape in the Paste box dismisses the card.

Smaller fixes:
9. In A, show the key hint whenever the keys work: at 760 to 1383px, where the reader bar has no room for it, put it under the search field in the same 12px muted style.
10. In C3 under 760px, make the sheet full screen like the phone layout, with Previous and Next in the bar (today the sheet is the window minus 144px, a 424px column at 600). In dark theme give the sheet the surface colour and a 1px line-2 border, and raise the scrim to 0.7, so its edge is visible.
11. At 390, the C2 and C3 Filters button fills the row like A's (today 85px).
12. When the app starts with an open item, scroll the list so its row is visible, centred (A with Siftly open puts the row below the screen).
13. The loading branch of the app's display values must return `announce` and the other paste fields; today `{{ announce }} never resolved` is logged 671 times per load.
14. The Context stub must not break a user name in the middle ("u/James-" / "w07").

Structure:
15. Make the app report plain facts about what it shows (open item kind, has comments, has media, long post, empty, paste mode), and move the Tweaks rules (which axes matter, the demo screens and demo paste states, the `demo` block in data.json) into the shell. Put whatever hook must stay in one block marked "Prototype hooks, not part of the design". Decide and write in one line whether a Tweaks screen button changes both panes in Compare.
16. Do not guess text widths in script. With item 5 the Reader measures comment overflow; let CSS container queries on the reader decide when the key hint and the bar labels show. Remove `barFit`, `lineChars`, `lines()` and the width numbers that copy CSS values.
17. Make the list row or card its own component with its own styles and template flags, like Reader and PasteStatus, so Library keeps only the layout, the state and the keys.
18. Small: compare values directly in templates (`b.type === 'p'`) instead of building an `isX` flag for each case; focus the reader title by the id the app already passes, not by the Reader's class name; add the "highlight the closed card" fact to the draft rules and read `autoOpen` from them; write the short-link rule once in library.js; pass Tweaks one `actions` object instead of 12 props; name each number two files must share (panel width 320, Compare scale 0.5) in one place; drop the fallback object in Filters.

Finally, check A, C2 and C3 in light, dark and sepia at 390, 600, 1440 and 1920 with Hyper Solutions, Agenix and Siftly open: contrast, keyboard focus, 44px targets under 480, 12px minimum text, no sideways scroll of the page, no word broken inside a table cell, and the fold showing no button on a comment of 8 lines or fewer. Tell me what you could not do.

## Prompt 3e (replaces 3d: List and Grid layouts and Page or Sheet reader become app settings; visual fixes only)

First save the current version as a checkpoint named "drafts-v4".

I am not choosing between C2 and C3: the app will offer both. Merge C2 and C3 into one grid layout, and make the layout and the reader style real app settings instead of Tweaks drafts:
0. Add a settings button (gear icon, 44px target, label "Settings" for screen readers) to the app header. It opens a small popover with three rows: "Layout: List | Grid" (List is draft A, Grid is the grid draft), "Open items as: Page | Sheet" (shown only when Layout is Grid; Page is today's C2, Sheet is today's C3) and "Theme: Light | Dark | Sepia | Match system". All choices are saved in the browser and apply at once. Switching Open items as while an item is open keeps the item and its scroll; switching Layout keeps the open item and the filters. Under 760px both reader styles open full screen, so there the Open items as row shows the note "Phones always open full screen". The Tweaks Draft row is replaced by these settings (Tweaks keeps the look axes, screens and Compare), and Compare can show any two combinations side by side, for example List and Grid as Sheet. Default: Layout List, Open items as Page, Theme Match system.

Every fix below that names A means the List layout, and C2 or C3 means Grid opened as Page or as Sheet.

Long reads, now that the data is full (all drafts):
1. Tables must not break inside words. Siftly's "The 4-Stage Pipeline" table reads "Entity Extract ion" and "Semant ic Taggin g" at 1440 and 390, because `.md` sets `overflow-wrap: anywhere` and a cell can shrink to one character. Keep `overflow-wrap: anywhere` only on code and link text; table cells use normal wrapping, and the table gets `min-width: max-content` inside its scroll box so a wide table scrolls sideways instead.
2. Code blocks: set `pre` to 14px mono (the one exception to the 16px reading size; that rule is for prose). Show a fade on the right edge while a block can scroll sideways. Fold a block taller than 14 lines behind "Show all N lines", like a comment. Give each block a visible focus ring. Check the Siftly directory tree and the long llama.cpp log comment at 1440 and 390.
3. Keep markdown heading levels. Convert the posts and READMEs again from library-full-text.json (it is in this chat's uploads) with `{type: 'h', level: 1..4}`; today all 36 Siftly headings have no level and look the same. Draw three styles: level 1 is hidden when it repeats the item title, level 2 is 20px weight 700 with 1.8em above and a hairline, level 3 and lower are 17px weight 700. A `---` line becomes a rule, not 50 hyphens.
4. A long item needs a way to the comments: when the item has kept comments, put a "Comments 14" link in the reader bar that scrolls to the comment section, and show a 2px reading-progress line under the bar. Hyper Solutions is 8,972px tall and its kept comments start at about 8,400px.
5. Comment fold: decide it after render. Fold a comment only when its full height is more than 8 lines, measured once after render and again when its own width changes; then show 6 lines, counting paragraph gaps. Today at Wide 4 of 8 folds on Agenix hide one line or less. An expanded comment taller than one screen gets "Show less" at the top as well as the end.

Paste card:
6. In C2 and C3, show "Reading the link" only in the floating card under the Paste box. Add the item to the grid only when it is ready, with the New badge; today the placeholder takes the first slot, every card shifts, and they shift back when it fails.
7. Under 760px the paste card goes back into the page flow as a full-width row under the Paste box; at 390 the floating card in C3 now covers Search, Filters and the first card.
8. "Added" and "Already saved, refreshed" close by themselves after 6 seconds; "Failed" stays until Dismiss. Escape in the Paste box dismisses the card.

Smaller fixes:
9. In A, show the key hint whenever the keys work: at 760 to 1383px, where the reader bar has no room for it, put it under the search field in the same 12px muted style.
10. In C3 under 760px, make the sheet full screen like the phone layout, with Previous and Next in the bar (today the sheet is the window minus 144px, a 424px column at 600). In dark theme give the sheet the surface colour and a 1px line-2 border, and raise the scrim to 0.7, so its edge is visible.
11. At 390, the C2 and C3 Filters button fills the row like A's (today 85px).
12. When the app starts with an open item, scroll the list so its row is visible, centred (A with Siftly open puts the row below the screen).
13. The loading branch of the app's display values must return `announce` and the other paste fields; today `{{ announce }} never resolved` is logged 671 times per load.
14. The Context stub must not break a user name in the middle ("u/James-" / "w07").

Finally, check List, Grid as Page and Grid as Sheet in light, dark and sepia at 390, 600, 1440 and 1920 with Hyper Solutions, Agenix and Siftly open: contrast, keyboard focus, 44px targets under 480, 12px minimum text, no sideways scroll of the page, no word broken inside a table cell, and the fold showing no button on a comment of 8 lines or fewer. Also check the settings popover: keyboard reachable, Escape closes it, focus returns to the gear. Tell me what you could not do.

## Prompt 3f (round 5 review fixes; last round before Prompt 4)

First save the current version as a checkpoint named "drafts-v5", including Main.dc.html, Library.dc.html and Settings.dc.html so it can be restored on its own, and tell me where it is stored. (Last round's "drafts-v4" was not saved; version 20 in the history is enough for that one.)

This is the last fix round before I build a design system from this prototype, so the fixes below are about getting the reader, the settings and the tokens right.

Must fix:
1. The comment fold is not applied when the app starts with an open item: with `?open=r-1xcf0jh` or after a reload with Agenix open, no comment is folded (a 33-line comment shows in full) until a width change or a step. Measure on mount and again after `document.fonts.ready`, not only from the ResizeObserver. Check Agenix after a reload at 1440 (4 comments fold) and 390.
2. A table that scrolls sideways gets the same right-edge fade as a code block, shown only while more is hidden, and is focusable (`tabindex=0`) with the code block's focus ring. Keep `min-width: min-content`, which keeps words whole. Check Siftly's "Setting, Env Var, Description" table at 1440 and 390.
3. Settings while reading: add the same Settings gear to the reader bar in Grid as Page, Grid as Sheet and the phone reader (List on phones too), at the right end before Mark read, opening the same popover under the bar. Under 480px show Back as an icon only so the gear fits in 44px. Changing a setting from the reader keeps the item and the scroll, as Compare already does. Also remember each item's reading position for the session, so closing and reopening an item returns to where I was (today Hyper reopens at the top after 10,000px).
4. Switching Layout from List to Grid keeps an open item only when I opened it (a click or a key). An item List opened by itself stays closed, and Grid shows the grid with that card highlighted. Grid to List keeps the open item.
5. In Grid as Sheet, always show the key hint ("j k or ← → move · m read · Esc back") for items with comments too; put it in the sheet's bottom edge or under the item header if the bar is full.
6. Paste card timer bug: a card hovered while "Reading the link" that turns into "Already saved, refreshed" vanishes about 7 s later with the pointer still on it. Keep one hover fact (pointer or focus inside the card) that only the card's own enter, leave, focus and blur events change, and one timer: processing waits 2.4 s then decides; done and refreshed wait 6 s only while not hovered; failed has no timer.
7. The dark-theme Grid rule at Library.dc.html line 188 never matches; fix the selector and check Grid dark.
8. The settings note says "Phones always open full screen" but applies to every window under 760px. Change it to "Under 760px wide, items always open full screen".

Tokens, so the design system gets one value for each:
9. Move all colour, spacing, radius, type and layer variables into one tokens file that every component links, and remove the fallback values from every `var(--x, …)` in the component files (318 today; some differ from the real values, for example the accent and surface colours).
10. Write the breakpoints (480, 760, 1080, 1440) and the column counts once as a documented table next to the tokens, and treat "List under 760px opens items as a page" as one more row of the layout table instead of extra JavaScript and CSS rules.
11. Add `--t-h2: 20px` and `--t-code: 14px` to the type tokens and use them in Text; name the body and code line-heights and the code padding as variables and use them in the fold heights; name the stacking layers (sticky bar, popover, scrim, sheet); replace off-scale radius literals (6px, 7px) with the radius tokens; fix the comment that says six type sizes.

Smaller:
12. Put the gear at the same place in List and Grid: right after the wordmark and count, also at 390. When Theme is Match system, show what it resolved to in muted text ("Match system · dark now").
13. Fold a code block only when it is more than 20 lines, then show 14; 20 lines or fewer show in full.
14. The Comments button says "Comments 2 of 14" (kept of total), matching "Kept 2 of 14 comments" in the section.
15. In the card summary, let a long token wrap (`overflow-wrap: anywhere`) instead of being cut (the KDE card's `KWIN_DRM_USE_COLOR_PIPELINE=1`).
16. Align "Show full comment", "Show less" and "Show all N lines" with the left edge of the text above them; let the reader title use the full column width; remove the literal quote marks inside blockquotes.

Finally, check List, Grid as Page and Grid as Sheet in light, dark and sepia at 390, 600, 1440 and 1920 with Hyper Solutions, Agenix and Siftly open, including after a reload with an item open: contrast, keyboard focus, 44px targets under 480, 12px minimum text, no sideways page scroll, the fold rule on first render, the gear reachable while reading. Tell me what you could not do.

## Prompt 3g (follow-up after 3f: look choices become app settings)

One more change, after the 16 fixes: the look must not be locked to one preset. Move the look choices from the Tweaks panel into the app's own settings, so a user can change them like Layout and Theme.

1. The settings popover becomes a settings panel with three groups:
   - View: Layout (List | Grid), Open items as (Page | Sheet, Grid only).
   - Reading: Theme (Light | Dark | Sepia | Match system), Font (the 5 type pairs, as a select), Text width (Narrow | Medium | Wide), Density (Compact | Comfortable | Roomy), Comment style (Indented lines | Cards | Rail).
   - Cards and tags: Accent (the 5 swatches), Tag style (Chips | Text | Dots), Card images (On | Off).
2. Defaults are today's "List look": Plex, Medium, Compact, Indented lines, Cobalt, Dots, images on, with Layout List, Open items as Page and Theme Match system. Add a "Reset to defaults" button at the bottom.
3. Every choice is saved in the browser, applies at once, and keeps the open item and the scroll, also when changed from the gear in the reader bar.
4. Under 760px the panel opens as a full-width sheet from the bottom, with each row at 44px.
5. The Tweaks panel keeps only what is not a user setting: Screen, the paste and saved-copy demo states, Shuffle (now shuffling the app settings), presets and Compare. Presets save and load the whole settings set.
6. The design tokens stay the same; each setting only switches which token values apply (font family, accent hue, density multiplier, measure).

Check the panel at 390 and 1440 in the three themes: keyboard order through the groups, Escape closes and returns focus to the gear, every option reachable, and each setting visibly changes the page. Tell me what you could not do.

## Prompt 3h (round 6 review fixes; settings panel and tokens)

First save the current version as a checkpoint named "drafts-v6" with every file of the current version (Main.dc.html, Library.dc.html, Settings.dc.html, tokens.css and the rest), and tell me where it is stored.

This is a short last round before the design system. Everything below is about the settings panel and the token file.

Must fix:
1. The List reader bar clips the key hint under the Comments button with the Mono font (18px overflow at 1440), because the bar's width is estimated from text length. Measure the bar and its children after fonts load and on resize, and drop the hint, then the position text, then button labels until nothing overflows. Check List at 1440 with all 5 fonts: the hint shows whole or not at all, and nothing overlaps.
2. On phones the settings sheet has no visible way out and Reset is below the fold (1,057px of rows in a 716px sheet). Under 760px give the sheet a sticky 56px header with the title "Settings" and a 44px Close button, and a sticky footer with the reset button, so both stay visible while the rows scroll between them. Close and a tap outside return focus to the gear.
3. Reset: rename it "Reset look" and make it reset only the look settings (Font, Text width, Density, Comment style, Accent, Tag style, Card images). Layout, Open items as and Theme stay as they are. The panel stays open after a reset.

Tokens, so the design system can be built from tokens.css alone:
4. Write every option of every look setting as CSS in tokens.css, selected by an attribute on the app root, for example `[data-font="news"] { … }`, `[data-density="roomy"] { … }`, `[data-width="wide"] { … }`, `[data-accent="rust"] { … }`. The default option is the plain value, so nothing is written twice. Compute the reading width in CSS from the characters per line and the font's character width. Move the List and Grid layout variables (rail, list and sheet widths, Grid's greys and its display size) into tokens.css under `.L-rows` and `.L-cards`. The script then only sets the attributes and the theme class, and its tables keep only ids and labels for the panel.
5. Declare the breakpoints in tokens.css (`--bp-phone: 480px`, `--bp-narrow: 760px`, `--bp-medium: 1080px`, `--bp-wide: 1440px`) with the column counts, read them from the script instead of a second table, and build the settings note's "760px" from the same value.
6. Add the missing tokens and use them: icon sizes, popover width, tag chroma, label letter spacing and the two motion durations. Replace the remaining off-scale literals in the component files, or list the ones that stay in a comment at the top of tokens.css.

Smaller:
7. "Card images" means the cards only: the reader always shows the item's picture. Keep one way to hide the card picture (CSS or script, not both).
8. The settings panel keeps the default UI font and sizes whatever the Font setting is; only the page behind it changes.
9. Under 760px show "Open items as" as disabled (muted, `aria-disabled`) with the note under it.
10. In Sepia, soften the accent's selected-row tint (about a third less chroma) so Teal, Moss and Cobalt stay warm.
11. Under 480px the Paste and Search fields are 44px high (today 42px).
12. In Grid as Sheet, pin the key hint to the bottom edge of the sheet so it does not scroll away, and keep the Previous and Next side buttons fully outside the sheet (or in the bar when the gap is under 56px).
13. Add `text-wrap: pretty` to summaries, card previews and key points, so lines do not end with one stray word.

Finally, check List, Grid as Page and Grid as Sheet in light, dark and sepia at 390, 600, 1440 and 1920 with each of the 5 fonts at least once, plus the phone settings sheet at 390: contrast, 44px under 480, 12px minimum text, no sideways page scroll, no overlap in the reader bar. Tell me what you could not do.

## Style round 1 (drafts chat, sent with styles-1-5.zip)

```text
First save the current version as a checkpoint named "drafts-v7" with every file of the current version (Main.dc.html, Library.dc.html, Settings.dc.html, tokens.css, library.js and the rest), and tell me where it is stored.

I want to try other looks on the Library. The attached styles-1-5.zip holds five style references from refero.design, each as DESIGN.md (the full style guide) and variables.css: 01 Anthropic, 02 Slash, 03 Modal, 04 mymind, 05 Monocle. Five more come in the next message.

1. Add a look setting "Style" as the first row of the Reading group, a select like Font, with "Library" (today's look, the default) and these five.
2. In tokens.css write each style as one `[data-style="<slug>"]` block (slugs: anthropic, slash, modal, mymind, monocle). Library is the plain value and must not change at all. A style sets only tokens: the font pair and weights, neutrals and surfaces, the accent, tag colours, borders, radii and shadows. Where a style's character needs something else (hairline rules instead of cards, for example), get it through those tokens, not through component changes.
3. While a style other than Library is on, its fonts and accent win: show the Font and Accent rows muted with `aria-disabled` and the note "Set by the style". Text width, Density, Comment style, Tag style and Card images still apply on top of every style.
4. Each style must work in Light, Dark and Sepia. Write its own theme from its DESIGN.md (Anthropic, mymind and Monocle are light; Slash and Modal are dark) and derive the other two from its accent, fonts and character. Match system keeps working.
5. These styles name commercial fonts. Use the closest Google Fonts, taking the fallbacks each DESIGN.md names (for example Source Serif 4 for Anthropic Serif and Plantin, Playfair Display for Ivy Presto, Space Grotesk for Goga), and write each swap in a comment in its block.
6. Keep the reading rules: reader body text 16px or more, every text and background pair at 4.5:1 or more in all three themes, 12px minimum text, 44px targets under 480px, no layout or behaviour change.
7. Reset look puts Style back to Library as well. Presets and Compare keep working, and Compare can show two styles side by side.

Finally check each new style in List with Hyper Solutions open and in Grid, in Light, Dark and Sepia, at 1440 and 390: contrast, 12px minimum text, no sideways page scroll, no overlap in the reader bar. Tell me, per style, what you could not map from its DESIGN.md.
```

## Style round 2 (drafts chat, sent with styles-6-10.zip)

```text
Round 1 checks out on my side: Library's 161 computed tokens are identical to version 26, all 5 styles pass 4.5:1 for text and 3:1 for the accent in Light, Dark and Sepia, and none scrolls sideways at 1440 or 390.

The attached styles-6-10.zip holds the next five style references, each as DESIGN.md and variables.css: 06 Linear, 07 Switch-Lit, 08 Cursor, 09 Steep, 10 Cal.com. Add them to the Style setting the same way as the first five (slugs: linear, switch-lit, cursor, steep, cal-com), with the same rules: one `[data-style]` block each with its Light, Dark and Sepia themes, tokens only, the closest Google Fonts with each swap in a comment, Library unchanged, 4.5:1 for text and 3:1 for accent marks, 16px or more reader body text. Linear is dark; Switch-Lit, Cursor, Steep and Cal.com are light. For Cal.com, if its 300-weight body is too thin to read at 16px, use 400 and say so.

Two styles must not look alike: Monocle and Anthropic both use Source Serif 4 today, so give Monocle a different Google serif close to Plantin (for example Spectral or Libre Caslon Text), and pick the new five's faces so no two styles share both their display and body fonts.

Then check each of the 10 styles the same way as before (List with Hyper Solutions open and Grid, Light, Dark and Sepia, 1440 and 390), and tell me per new style what you could not map.
```
