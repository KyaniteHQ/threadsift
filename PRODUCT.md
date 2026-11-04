# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People with a large pile of saved Reddit posts and comments, X posts, GitHub repos and articles who rarely get back to them. They self-host the first release, but the screens assume no technical skill, so the later hosted product needs no redesign. The owner is the first user and brings their own saved bookmarks.

## Product Purpose

Threadsift is a reading library. A person pastes a link, the app fetches it and keeps only the useful parts, an agent tags and summarizes it, and everything reads, searches and filters on one page. Success is a saved thread that someone actually reads, and a library that gets more useful as it grows. `docs/spec.md` holds every decision.

## Positioning

Two mechanisms carry the claim:

- Sifted threads: an agent keeps a comment only when it adds something, so a saved Reddit or X thread reads as its useful part.
- A library wiki: the agent keeps Topic pages, Related Items, an Index and a Log, so the library compounds as Items arrive.

Karakeep, the closest open-source tool, has no comment-thread model, so a saved thread is flattened to text (`docs/research/prior-art.md`).

## Operating Context

- Intake is one link at a time (paste box, Web Share Target, the Extension, the HTTP API, MCP, Grok Bot) or an Import of many links.
- Reading happens in the Reader, on desktop and on phones; the web app comes first, desktop and mobile apps later.
- The owner runs one Instance, as a container or through the Cloudflare deploy button, and picks one Provider.

## Capabilities and Constraints

- `docs/spec.md` and `CONTEXT.md` hold the features and the words; `docs/architecture.md` holds the stack.
- Tags are set only by the agent; the interface has no tag editing.
- Reddit content comes only from the owner's own signed-in tab.

## Brand Commitments

- The name is Threadsift. The masthead wordmark reads Threadsift; the Style named Library keeps its name.
- Interface text has no hand-picked voice: `tools/copy/write-copy.sh` writes every text a user reads, as `docs/agents/implementing.md` (Interface text) describes.

## Evidence on Hand

- `design/prototype/` and `design/system/`: the finished first screens and the design system.
- The owner's real saves exist only on the owner's machine and stay out of the repository.
- There are no customers, testimonials, usage numbers or prices yet; nothing may claim them.

## Product Principles

- The saved content leads; the interface stays out of the way of the reading.
- Keep only what adds something, in comments and on screen.
- The library gets more useful with every Item.
- The owner's library, Instance and Provider stay the owner's.

## Accessibility & Inclusion

Every text and background pair is at least 4.5:1 and every mark, border and icon at least 3:1, in every theme with every accent and Style; text is never under 12px; under 480px every target is at least 44px; the open row is marked by a bar as well as by colour; motion has a reduced-motion form (`docs/spec.md`, Design).
