# Library — List and Grid — design reference

This is a design mockup created in a visual design tool, exported as a
standalone page. Treat it as a REFERENCE MOCKUP, not production code:
the markup and inline styles carry the design's precise values — colors,
font sizes, spacing, radii, shadows, layout — which an implementation
should replicate faithfully in its own components and styling system
rather than copy wholesale.

## Contents

- `Main.dc.html` — the artboard (a Design Component: an `<x-dc>`
  template + a small logic class). The values to replicate live in its
  inline `style="…"` attributes and the `<helmet><style>` block.
- `Library.dc.html`, `Filters.dc.html`, `Settings.dc.html`, `Reader.dc.html`,
  `PasteStatus.dc.html`, `Picture.dc.html`, `Text.dc.html`,
  `Inline.dc.html`, `Tweaks.dc.html` — the parts of the artboard, one
  Design Component each.
- `library.js` and `tokens.css` — the mockup's logic and its style values.
  The app's values live in `design/system/tokens.css`.
- `data.json` and `img/` — the owner's saved Items. They are gitignored
  and are not in the repository.
- `support.js` and `vendor/react*.js` — the runtime that renders the
  component in a browser; not part of the design.

## Viewing

Serve the folder (e.g. `python3 -m http.server`) and open `Main.dc.html`;
some browsers block the scripts over file://.
