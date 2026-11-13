# Library prototype: List and Grid

This folder is a clickable mockup of the first screens, exported from a visual design tool as a standalone page. It is a reference, not production code. Its markup and inline styles hold the design's exact values, such as colours, font sizes, spacing, radii, shadows and layout. The app copies those values into its own components and styles instead of copying the markup.

## Contents

- `Main.dc.html`: the artboard, a Design Component made of an `<x-dc>` template and a small logic class. The values to copy live in its inline `style="…"` attributes and its `<helmet><style>` block.
- `Library.dc.html`, `Filters.dc.html`, `Settings.dc.html`, `Reader.dc.html`, `PasteStatus.dc.html`, `Picture.dc.html`, `Text.dc.html`, `Inline.dc.html` and `Tweaks.dc.html`: the parts of the artboard, one Design Component each.
- `library.js` and `tokens.css`: the mockup's logic and its style values. The app's values live in `design/system/tokens.css`.
- `data.json` and `img/`: the owner's saved Items. They are gitignored and are not in the repository.
- `support.js` and `vendor/react*.js`: the runtime that renders the component in a browser. They are not part of the design.

## Viewing

The prototype loads its data with `fetch`, so it needs a local web server:

```sh
cd design/prototype
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/Main.dc.html. Press T for the Tweaks panel, which has Compare for two settings side by side.

The sample data is not in the repository, because it is the owner's real saves: other people's posts, comments and images. Without it the app shows "Couldn’t load the library data." To fill it, put a `data.json` in the shape `library.js` reads, and its images in `img/`, inside `design/prototype/`. Both paths are gitignored.
