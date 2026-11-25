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
- Interface text has no hand-picked voice: `tools/copy/write-copy.sh` writes every text a user reads in the product, as `docs/agents/changing-code.md` (Interface text) describes.

## Brand Brief

This section describes the brand the app moves to, not the app as built. The rest of this file and of [DESIGN.md](DESIGN.md) describe the app as built until the owner chooses a direction and it is built. DESIGN.md, Brand Brief, holds the visual part: the shape language, the colour world, the faces, the motion, the tokens a Style may set, the three candidate directions, and the line that names the chosen direction.

- **The idea.** Threadsift shows its sifting: every Item says what was kept out of what was saved, and the library files itself into an index as it grows.
- **The signature element.** The kept strip: one line of monospaced text that opens every List row, Grid card, card cover and Reader header. It names where the Item came from and what the agent kept of it, such as `r/selfhosted · 9/184 kept` for a Reddit thread with 9 Kept comments out of 184 saved comments. An Item without comments shows a fact the app already stores in that place, such as a repository's language or an article's domain. An engagement count never leads it. The card covers that give every Item a picture are part of the signature too.
- **The brand is what never changes:** the wordmark and the icon, the kept strip and the covers, the anatomy of every component, the layouts, the motion and the voice. A screenshot in any Style, Theme, Accent or Font is still Threadsift.
- **A Style is a material.** It changes the token values DESIGN.md, Brand Brief, lists and nothing else: never where things are or what a component is made of. Choosing a Style writes its Font and Accent into the settings, and the owner can change either afterwards. No control is disabled.
- **Three Styles.** Library is the brand's default and is built from the chosen direction. Beside it sit a print Style (working name Broadsheet: sharp corners, hairline rules, no shadows, a serif reading face) and a technical Style (working name Workbench: a mono-forward face for a library of repositories and code). Dark is a Theme, so no Style is the dark one.
- **The voice.** Plain, exact and quiet, like a catalogue note: a text names a count, a state or the next action in the glossary's words, and never cheers, hurries or claims. The rule set the copy script follows is written from this line. Until the copy script carries those rules, the Brand Commitments line above holds, and the script writes without a hand-picked voice.

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
