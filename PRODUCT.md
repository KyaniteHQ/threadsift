# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People with a large pile of saved Reddit posts and comments, X posts, GitHub repos and articles who rarely get back to them. They self-host the first release, but the screens assume no technical skill, so the later hosted product needs no redesign. The owner is the first user and brings their own saved bookmarks.

## Product Purpose

Threadsift is a reading library. A person pastes a link, the app fetches it and keeps only the useful parts, an agent tags and summarizes it, and everything reads, searches and filters on one page. Success is a saved thread that someone actually reads, and a library that gets more useful as it grows.

## Positioning

Two mechanisms carry the claim:

- Sifted threads: an agent keeps a comment only when it adds something, so a saved Reddit or X thread reads as its useful part.
- A library wiki: the agent keeps Topic pages, Related Items, an Index and a Log, so the library compounds as Items arrive.

Karakeep, the closest open-source tool, has no comment-thread model, so it would flatten a saved thread to text ([Decisions and evidence](docs/architecture/decisions-and-evidence.md), Build or adopt).

## Operating Context

- Intake is one link at a time (paste box, Web Share Target, the Extension, the HTTP API, MCP, Grok Bot) or an Import of many links.
- Reading happens in the Reader, on desktop and on phones; the web app comes first, desktop and mobile apps later.
- The owner runs one Instance, as a container or on Cloudflare, and picks one Provider.

## Capabilities and Constraints

- `docs/spec.md` and `GLOSSARY.md` hold the features and the words; `docs/architecture/the-stack-at-a-glance.md` holds the stack.
- Tags are set only by the agent; the interface has no tag editing.
- Reddit content comes from the owner's own signed-in tab, from the Arctic Shift archive, or from the owner's own connected Reddit account (`docs/spec.md`, Product).

## Brand Commitments

- The name is Threadsift. The masthead wordmark reads Threadsift; the Style named Library keeps its name.
- Every text a user reads in the product follows the Interface voice below. `tools/copy/write-copy.sh` writes each one, as `docs/agents/changing-code.md` (Interface text) describes.

### Interface voice

These rules hold for every text a person reads in the web app, the browser extension, the Threadsift bot and the notes of the Vault mirror: labels, buttons, messages, empty states, errors and notes. The voice is plain, exact and quiet, like a catalogue note. The copy script puts this section into its prompt, so the section has to read on its own.

1. **Use the glossary's word in ordinary sentence case, and use the same word every time.** Name each concept with its `GLOSSARY.md` word (`item`, `topic`, `tag`, `digest`, `summary`, `highlight`, `note`, `reader`, `instance`, `provider`, `paste`, `import`), lowercase in the middle of a sentence. Never use a word from a term's Avoid line, and do not surface internal-only terms (such as "context stub" or "short-link alias") when plain words explain the state directly.
   - Bad: "Search saved posts"
   - Good: "Search items"
2. **Name a count, a state or the next action.** A count is a figure. A state says what is true now. An action says what the person can do next.
   - Bad: "Some of these are still new"
   - Good: "6 items, 2 unread"
3. **Never cheer, hurry or claim.** No exclamation marks, no emoji, no praise of the reader or of Threadsift, and no "just", "simply", "instantly" or "seamless". Never promise a time or a result Threadsift cannot know.
   - Bad: "Done! Your link is saved in seconds."
   - Good: "Added"
4. **An error says what failed, why when Threadsift knows it, and what the person can do next.** Name what failed in plain words (such as the website, GitHub, Reddit, X, the Grok Bot, a saved token or a form field), and skip the next step in prose when a button beside the error already names it. Never blame the person, and never show an error code or raw technical message as the text.
   - Bad: "Error 401. Invalid credentials."
   - Good: "GitHub rejected the saved token. Replace or remove it in Settings."
5. **Every control names its result or destination.** A button is a verb, or a verb and its object. A link names where it goes, never "Click here" or "Learn more". A field label names what goes in the field; instructions and rules live in a visible hint outside the field, while a placeholder gives only a short example and never replaces the label.
   - Bad: "OK", "Submit", "Click here"
   - Good: "Add", "Clear filters", "Open on Reddit"
6. **Say each fact once, in the fewest words that keep it.** Do not repeat the heading, the label or the button in the text beside it. Write one idea per sentence.
   - Bad: "Reset look puts the look settings back to their defaults" beside the Reset look button
   - Good: "Layout, Open items as and Theme stay as they are."
7. **Threadsift speaks of itself in the third person, and uses "you" only for instructions or to clarify ownership.** Write "Threadsift" only when naming the actor adds clarity, and never write "we" or "I". The Threadsift bot is the one exception: it speaks in chat as itself, so it may say "I" there. Use "you" or "your" when giving an instruction or distinguishing the person's own input or account (such as a password or an unsaved note), never as filler on ordinary labels.
   - Bad: "We couldn’t reach your website."
   - Good: "Couldn’t reach the website."
8. **Use ordinary sentence case, and punctuation that marks the kind of text.** Capitalize only the first word, proper nouns (such as Threadsift, Reddit, X, GitHub, Grok Bot and named styles, themes or accents like Library or Sepia) and exact UI labels when pointing to a screen or control (such as Settings, Open items as or Try again). A full sentence ends with a period, or a question mark when asking; a label, button, heading, title, count or short status fragment does not. Use ’ for an apostrophe, … after an action that is still running, and · only between the parts of one inline metadata line.
   - Bad: "Load More Items."
   - Good: "Load more items", "Saving…"
9. **Use plain words that work in every layout, theme and device.** Avoid developer jargon (such as "payload", "endpoint" or "JSON") unless the person must enter or match a technical value. Never refer to colour, screen position or input device ("green", "on the left", "above", "click", "tap"); name the control or section instead.
   - Bad: "Click the green link above to check the webhook endpoint."
   - Good: "Open Settings to check the Grok Bot address."
10. **State the impact of a permanent or destructive action plainly.** Skip "Are you sure?". Name what will be removed or changed, and say when an action cannot be undone, without drama.
    - Bad: "Are you sure you want to delete this item?"
    - Good: "Delete this item? Its highlights, note and saved images will be removed. This can’t be undone."

## Brand Brief

This section describes the brand the app moves to, not the app as built. The chosen direction is Quarto, a technical monograph: one grotesque family, a ruled matrix of hairlines, and a green ink. The rest of this file, and the sections of [the design system](DESIGN.md) before its Brand Brief, describe the app as built until Quarto is built. The design system's Brand Brief holds the visual part: the shape language, the colour world, the faces, the motion, the covers, the list of what no Style may change, the tokens a Style may set, and Quarto's values.

- **The idea.** Threadsift shows its sifting: every Item says what the Reader shows of what was saved, and the library files itself into an index as it grows.
- **The signature element.** The kept strip: one line of monospaced text that opens every List row and Grid card. In the Reader it sits under the title, at the start of the line with the author and the date. It names where the Item came from and counts its comments in the list row's words. Before a Digest covers the thread it reads like `r/selfhosted · Showing 31 of 184`, the comments the Reader shows out of the saved ones, and draws no share of Kept comments. Once a Digest covers the thread it reads like `r/selfhosted · Kept 9 of 184`. A saved Reddit comment reads like `r/typesetters · Saved comment`. A Link-only Item shows only what the Instance stores for it, its Source and, when stored, its community, and no count. An Item without comments shows a fact the Instance already stores in that place, such as a repository's language or an article's domain. An engagement count never leads it. The covers belong to the signature too: an Item with no stored picture gets one in the Grid card, which holds the Item's own first lines, the Topic tint and the Source mark, and no strip of its own, because the kept strip directly above it already names the Source and counts the comments. In the List row such an Item gets a 40px tile with the same tint and mark.
- **The brand is what never changes,** so a screenshot in any Style, Theme, Accent or Font is still Threadsift. The design system's Brand Brief, What no Style may change, holds the one list.
- **A Style is a material.** It changes only the token values the design system's Brand Brief lists: never where things are or what a component is made of. Choosing a Style writes its Font and Accent into the settings, and the owner can change either afterwards. No control is disabled.
- **Three Styles.** Library is the brand's default and is built from Quarto. Beside it sit a print Style and a technical Style, whose names Broadsheet and Workbench are working names. Broadsheet has sharp corners, hairline rules, no shadows and a serif reading face. Workbench has a mono-forward face for a library of repositories and code. Dark is a Theme, so no Style is the dark one.
- **The voice.** Plain, exact and quiet, like a catalogue note: a text names a count, a state or the next action in the glossary's words, and never cheers, hurries or claims. Brand Commitments, Interface voice, holds the rules written from this line.

## Evidence on Hand

- The owner's real saves exist only on the owner's machine and stay out of the repository.
- There are no customers, testimonials, usage numbers or prices yet; nothing may claim them.

## Product Principles

- The saved content leads; the interface stays out of the way of the reading.
- Keep only what adds something, in comments and on screen.
- The library gets more useful with every Item.
- The owner's library, Instance and Provider stay the owner's.

## Accessibility & Inclusion

`docs/spec.md` (Design) holds the accessibility floor.
