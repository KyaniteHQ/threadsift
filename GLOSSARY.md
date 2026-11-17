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
Adding many Items at once: the owner's X bookmarks, or a pasted or uploaded list of links.
_Avoid_: Bulk paste, sync, backfill

**Daily budget**:
The number of new Items one agent token may add in a UTC day; a link the library already holds does not count.
_Avoid_: Quota, rate limit, allowance

**Extension**:
The browser extension that saves the page in the owner's own tab, including a Reddit post with its visible comments and, as far as Reddit's request limit allows, the replies behind its `more` stubs.
_Avoid_: Clipper, add-on, plugin

**Short-link alias**:
A short link's or Reddit share link's normalized address, kept with the Item it made or reached, and the address it resolved to, so that pasting it again, or Try again, reaches that Item and fetches it from a working address.
_Avoid_: Redirect, mapping

**Link-only Item**:
An Item stored with its link and, when the source gave them, its title, author and, for a Reddit link, community, and with no fetched content, such as a Reddit link saved without the Extension. A Reddit Item stops being Link-only when Arctic Shift or the connected Reddit account fills its thread.
_Avoid_: Stub, placeholder, bookmark

**Threadsift bot**:
The public Grok Bot template that saves links from chat, syncs X bookmarks and answers Threadsift's webhook for its user.
_Avoid_: Grok integration, assistant

**Digest**:
The agent's output for one Item, stored apart from the fetched content: clean title, Topic, Tags, Summary, Key points and the ids of Kept comments. A caller may send one with a Paste; it waits for the fetched text and publishes without a Provider call.
_Avoid_: Analysis, enrichment, AI output

**AI task**:
One piece of agent work on the library: a Digest, a Topic page overview, a pick of Related Items, the weekly Proposals, or the Grok Bot's read of an X link.
_Avoid_: Job, prompt, request, AI call

### Sorting

**Topic**:
The one broad subject of an Item, from a list the agent keeps and grows. Topics keep their first spelling; `catalogKey` in `src/core/catalog-key.ts` defines their identity.
_Avoid_: Category, folder

**Tag**:
One of up to 3 short labels the agent sets on an Item; the UI never edits Tags. Tags keep their first spelling and use the same key rule as Topics.
_Avoid_: Label, keyword

**Read state**:
Whether the owner has read an Item; the owner sets it, never the agent.
_Avoid_: Status, archived, done

### The library wiki

**Topic page**:
The page for one Topic: the agent's short overview, built from that Topic's Items, the Known disagreements (the accepted pairs of its Items that disagree, with the agent's reason), and the list of those Items. Its address is the Topic's key; the address of a Topic that was merged into another opens the Topic it went into.
_Avoid_: Category page, wiki page

**Related Item**:
Another Item the agent linked to this one, with a one-line reason.
_Avoid_: Similar item, backlink, recommendation

**Index**:
The page that lists every Topic with its Item count and overview line.
_Avoid_: Home, dashboard, catalogue

**Log**:
The list of the committed changes to the library, newest first, from the day the Instance began it: the agent's own changes, and the merges the owner accepts.
_Avoid_: History, activity feed, audit trail

**Log entry**:
One line of the Log: an `ingest` (an Item's first Digest), a `digest` (a later one), a `topic` (a Topic created), an `overview` (a stored overview revision), a `related` (a stored set of picks), a `merge` (a Tag merged into another) or a `merge-topic` (a Topic merged into another). It keeps the title and names as they were when the change committed.
_Avoid_: Event, Audit record

**Proposal**:
A change the agent suggests on the weekly Proposals page: merging two Tags, merging two Topics, removing a Highlight that is no longer found, writing again the overview of a Topic that leaves Items out, or two Items of one Topic whose Summaries disagree. The owner accepts or rejects a Proposal of every kind.
_Avoid_: Suggestion, lint, fix

**Proposals page**:
The page, at `/proposals`, that lists the open Proposals of the weekly check and the one being applied, each with the agent's reason, and lets the owner accept or reject each.
_Avoid_: Suggestions page, Inbox

**Pin**:
An accepted correction kept so that a later regeneration cannot undo it. A Pin of a Tag merge or a Topic merge records the merged-away key and the one it went into, so no later Digest creates the merged-away Tag or Topic again, and a Topic's old address opens the Topic it went into. A Pin of a disagreement names two Items that disagree and holds only while both Items carry the Digests it was accepted on.
_Avoid_: Override, lock

### Reading

**Summary**:
Two lines covering the Item and what its Kept comments concluded.
_Avoid_: Description, excerpt, TL;DR

**Key points**:
The short list of points under the Summary.
_Avoid_: Highlights, takeaways

**Kept comment**:
A comment the agent kept because it adds a fact, a fix, a working link or command, first-hand experience or a real counterargument. Until a Digest covers the thread the Reader shows the comments that pass the first step instead, under a line that says so; search and the Item notes of the export still hold Kept comments only, while the backup records hold every stored comment.
_Avoid_: Top comment, filtered comment

**Context stub**:
One line in a comment tree that stands in for comments not shown: a dropped parent or an X parent missing from the saved thread, so the replies under it still read correctly, or replies that were not saved. The second kind is a Reddit `more` stub, or the last line of an X thread whose post reports more replies than it holds, or no count; it says they were not saved.
_Avoid_: Placeholder, removed comment

**Reader**:
The view that shows one Item in full: header, Summary, Key points, post text, the comments (Kept comments, and any comment that holds an attached Highlight, once a Digest covers the thread, otherwise every comment that passes the first step of the comment filter), the link a Reddit link post points at, and the owner's Highlights and Note.
_Avoid_: Detail view, article view

**Author thread**:
The posts an X post's author wrote as a chain of replies to their own post. The Reader shows them as part of the post text, in order, once each is checked against X (a Paste's own text is not checked); a follow-up that fails the check is left out and the post text says a part was not saved.
_Avoid_: Thread (alone, it also means the replies), self-replies, author chain

**Quote chain**:
The posts an X post quotes: the post it quotes, the post that one quotes, and so on, 5 at most. The Reader shows each as part of the post text under the post that quotes it, with its author, time and link, once it is checked against X (a Paste's own text is not checked); a quoted post that fails the check, with the ones after it, and a quoted post that X shows but the read did not return, are replaced by a line that says quoted posts were not saved.
_Avoid_: Quote thread, quoted tweet, embed

### Keeping

**Highlight**:
A passage of an Item's post text or of one comment the Reader shows that the owner selected to keep; it stays when a refresh changes the text, marked as no longer found. A Proposal can suggest removing one that is no longer found, and only the owner removes a single Highlight, with Accept or with Remove in the Reader.
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

**Export**:
The zip of the whole library that the owner starts and downloads: the manifest `threadsift.json`, every library record as JSON Lines files, and the Markdown note of each Item with its stored images and post text file beside it. The Instance builds it in slices, one export at a time, and keeps a ready one for 24 hours.
_Avoid_: Dump, archive

**Backup**:
The section at the end of Settings where the owner starts an Export, follows it, downloads the zip and deletes it, and where the owner starts a Restore. It names the screen, never the zip; `backup` in the code names the list of tables the Export holds.
_Avoid_: Export section, Backups page

**Restore**:
The owner's upload of an Export zip into an Instance whose library is empty, and the run that brings every library record back with its id. The zip holds no Provider keys, password or agent tokens, so the owner enters those again. It is not an Import, which adds links.
_Avoid_: Import (of a zip), recovery, migration

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
