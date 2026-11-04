# Threadsift

A reading library: the owner pastes a link to something they saved, the app fetches it, an agent keeps the useful parts and grows a small wiki of the library, and everything is read, searched and filtered on one page.

## Language

### The app

**Threadsift**:
The product: the app, its repo and, later, its hosted service.
_Avoid_: Library (as a product name), commonplace

**Instance**:
One running copy of Threadsift with one owner, self-hosted in a container or on Cloudflare.
_Avoid_: Server, deployment, workspace

**Provider**:
Where the agent's AI comes from: an API key, OpenRouter, Workers AI, a CLI signed in on the server, or Grok Bot.
_Avoid_: Model, backend, LLM

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

**Import**:
Adding many Items at once: the owner's X bookmarks and folders, or a pasted or uploaded list of links.
_Avoid_: Bulk paste, sync, backfill

**Extension**:
The browser extension that saves the page in the owner's own tab, including a Reddit post with its visible comments.
_Avoid_: Clipper, add-on, plugin

**Link-only Item**:
An Item stored with its link, title and author only, such as a Reddit link saved without the Extension.
_Avoid_: Stub, placeholder, bookmark

**Threadsift bot**:
The public Grok Bot template that saves links from chat, syncs X bookmarks and answers Threadsift's webhook for its user.
_Avoid_: Grok integration, assistant

**Digest**:
The agent's output for one Item, stored apart from the fetched content: clean title, Topic, Tags, Summary, Key points and the ids of Kept comments.
_Avoid_: Analysis, enrichment, AI output

**AI task**:
One piece of agent work on the library: a Digest, a Topic page overview, a pick of Related Items, or the weekly Proposals.
_Avoid_: Job, prompt, request, AI call

### Sorting

**Topic**:
The one broad subject of an Item, from a list the agent keeps and grows.
_Avoid_: Category, folder

**Tag**:
One of up to 3 short labels the agent sets on an Item; the UI never edits Tags.
_Avoid_: Label, keyword

**Read state**:
Whether the owner has read an Item; the owner sets it, never the agent.
_Avoid_: Status, archived, done

### The library wiki

**Topic page**:
The page for one Topic: the agent's short overview, built from that Topic's Items, and the list of those Items.
_Avoid_: Category page, wiki page

**Related Item**:
Another Item the agent linked to this one, with a one-line reason.
_Avoid_: Similar item, backlink, recommendation

**Index**:
The page that lists every Topic with its Item count and overview line.
_Avoid_: Home, dashboard, catalogue

**Log**:
The list of every agent action on the library, newest first.
_Avoid_: History, activity feed, audit trail

**Proposal**:
A change the agent suggests on the weekly Proposals page, such as merging two Tags, which the owner accepts or rejects.
_Avoid_: Suggestion, lint, fix

**Pin**:
An accepted correction kept so that a later regeneration cannot undo it.
_Avoid_: Override, lock

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
One line in a comment tree that stands in for comments not shown: a dropped parent, so a Kept comment under it still reads correctly, or replies behind a Reddit `more` stub, which say they were not saved.
_Avoid_: Placeholder, removed comment

**Reader**:
The view that shows one Item in full: header, Summary, Key points, post text, Kept comments, and the owner's Highlights and Note.
_Avoid_: Detail view, article view

### Keeping

**Highlight**:
A passage of an Item's post text or of one Kept comment that the owner selected to keep; it stays when a refresh changes the text, marked as no longer found.
_Avoid_: Clip, quote, annotation, bookmark

**Note**:
The owner's one free-text note on an Item.
_Avoid_: Comment, annotation, memo

**Highlights page**:
The page that lists every Highlight and Note across the library, newest first, each linked back to its place in the Reader.
_Avoid_: Clippings, journal, notebook

**Vault mirror**:
The Markdown copy of every Item, Topic page, the Index and the Log in a folder of the owner's Obsidian vault, updated by Threadsift and never read back.
_Avoid_: Sync, Obsidian export

### Settings

**Layout**:
How the library lists Items: List (filters, Item list and Reader as three panes) or Grid (a card grid).
_Avoid_: View mode

**Reader style**:
How Grid opens an Item: Page (full page) or Sheet (a centred sheet over the dimmed grid); the setting is labelled "Open items as".
_Avoid_: Open mode, modal

**Look settings**:
The settings that change only appearance: Style, Font, Text size, Text width, Density, Comment style, Accent, Tag style and Card images.
_Avoid_: Preferences, theme settings

**Style**:
A whole look (fonts, colours, radii, shadows) chosen as one Look setting; while a Style other than Library is on, its fonts and accent replace Font and Accent.
_Avoid_: Skin, preset

**Reset look**:
The action that returns every Look setting to its default and leaves Layout, Reader style and Theme alone.
_Avoid_: Reset settings, restore defaults
