# Threadsift

Threadsift is a reading library. You paste a link to something you saved (a Reddit post or comment, an X post, a GitHub repo, an article), the app fetches it, an agent keeps only the useful comments and writes a topic, tags, a two-line summary and key points, and everything reads, searches and filters on one page.

## Status

The design is done and the tech stack is chosen; the app is not built yet.

- `docs/spec.md`: what v1 does.
- `docs/architecture.md`: what it is built with and where each part runs.
- `CONTEXT.md`: the words the project uses.
- `design/prototype/`: the clickable prototype from Claude Design.
- `design/system/`: the design system's tokens, component styles and settings table.
- `docs/design/`: the Claude Design prompts, the final design reviews and the Style list.
- `docs/research/prior-art.md`: the existing tools that were compared before deciding to build.

## Open the prototype

The prototype loads its data with `fetch`, so it needs a local web server:

```sh
cd design/prototype
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/Main.dc.html. Press T for the Tweaks panel, which has Compare for two settings side by side.

The prototype's sample data is not in the repo, because it is the owner's real saves: other people's posts, comments and images. Without it the app shows "Couldn’t load the library data." To fill it, put a `data.json` in the shape `library.js` reads, and its images in `img/`, inside `design/prototype/`; both paths are gitignored.

## License

Copyright (C) 2026 Kyanite Labs.

Threadsift is licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). See [LICENSE](LICENSE). Outside contributions need a signed contributor licence agreement, which the repo adds before the first one.
