# Library

A personal reading library: the owner pastes a link to something they saved, the app fetches it, an agent keeps the useful parts, and everything is read, searched and filtered on one page.

## Language

### Saving

**Item**:
One saved thing in the library: a Reddit post or comment, an X post, a GitHub repo, an article, or another link.
_Avoid_: Save, bookmark, post, entry

**Source**:
Where an Item comes from: Reddit, X, GitHub, Article or Other.
_Avoid_: Platform, provider, site

**Paste**:
The act of adding one Item by pasting its link; pasting a known link again refreshes that Item.
_Avoid_: Import, capture, add-link

**Digest**:
The agent's output for one Item, stored apart from the fetched content: clean title, Topic, Tags, Summary, Key points and the ids of Kept comments.
_Avoid_: Analysis, enrichment, AI output

### Sorting

**Topic**:
The one broad subject of an Item, from a list the agent keeps and grows.
_Avoid_: Category, folder

**Tag**:
One of up to 3 short labels the agent sets on an Item; the UI never edits Tags.
_Avoid_: Label, keyword

**Read state**:
Whether the owner has read an Item; the only state the owner changes.
_Avoid_: Status, archived, done

### Reading

**Summary**:
Two lines covering the Item and what its Kept comments concluded.
_Avoid_: Description, excerpt, TL;DR

**Key points**:
The short list of points under the Summary.
_Avoid_: Highlights, takeaways

**Kept comment**:
A comment the agent kept because it adds a fact, a fix, a working link or command, first-hand experience or a real counterargument.
_Avoid_: Top comment, filtered comment

**Context stub**:
A dropped parent comment shown as one line so a Kept comment under it still reads correctly.
_Avoid_: Placeholder, removed comment

**Reader**:
The view that shows one Item in full: header, Summary, Key points, post text and Kept comments.
_Avoid_: Detail view, article view

### Settings

**Layout**:
How the library lists Items: List (filters, Item list and Reader as three panes) or Grid (a card grid).
_Avoid_: View mode

**Reader style**:
How Grid opens an Item: Page (full page) or Sheet (a centred sheet over the dimmed grid); the setting is labelled "Open items as".
_Avoid_: Open mode, modal

**Look settings**:
The settings that change only appearance: Style, Font, Text width, Density, Comment style, Accent, Tag style and Card images.
_Avoid_: Preferences, theme settings

**Style**:
A whole look (fonts, colours, radii, shadows) chosen as one Look setting; while a Style other than Library is on, its fonts and accent replace Font and Accent.
_Avoid_: Skin, preset

**Reset look**:
The action that returns every Look setting to its default and leaves Layout, Reader style and Theme alone.
_Avoid_: Reset settings, restore defaults
