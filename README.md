# commonplace

Library is a personal reading library. You paste a link to something you saved (a Reddit post or comment, an X post, a GitHub repo, an article), the app fetches it, an agent keeps only the useful comments and writes a topic, tags, a two-line summary and key points, and everything reads, searches and filters on one page.

The name comes from the commonplace book, where a reader copies out the passages worth keeping.

## Status

The design is done and the app is not built yet. The tech stack is not chosen.

- `docs/spec.md`: what v1 does.
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

MIT
