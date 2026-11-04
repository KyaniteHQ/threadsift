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
- `Library.dc.html` — referenced resource
- `Tweaks.dc.html` — referenced resource
- `checkpoints/drafts-v3/Tweaks.dc.html` — referenced resource
- `checkpoints/drafts-v3/library.js` — referenced resource
- `checkpoints/drafts-v5/Library.dc.html` — referenced resource
- `checkpoints/drafts-v5/Tweaks.dc.html` — referenced resource
- `checkpoints/drafts-v5/library.js` — referenced resource
- `checkpoints/drafts-v7/Library.dc.html` — referenced resource
- `checkpoints/drafts-v7/Tweaks.dc.html` — referenced resource
- `checkpoints/drafts-v7/library.js` — referenced resource
- `library.js` — referenced resource
- `Filters.dc.html` — referenced resource
- `PasteStatus.dc.html` — referenced resource
- `Picture.dc.html` — referenced resource
- `Reader.dc.html` — referenced resource
- `Settings.dc.html` — referenced resource
- `checkpoints/drafts-v1/data.json` — referenced resource
- `checkpoints/drafts-v2/Picture.dc.html` — referenced resource
- `checkpoints/drafts-v2/Reader.dc.html` — referenced resource
- `checkpoints/drafts-v2/data.json` — referenced resource
- `checkpoints/drafts-v3/Filters.dc.html` — referenced resource
- `checkpoints/drafts-v3/PasteStatus.dc.html` — referenced resource
- `checkpoints/drafts-v3/Picture.dc.html` — referenced resource
- `checkpoints/drafts-v3/Reader.dc.html` — referenced resource
- `checkpoints/drafts-v3/data.json` — referenced resource
- `checkpoints/drafts-v5/Filters.dc.html` — referenced resource
- `checkpoints/drafts-v5/PasteStatus.dc.html` — referenced resource
- `checkpoints/drafts-v5/Picture.dc.html` — referenced resource
- `checkpoints/drafts-v5/Reader.dc.html` — referenced resource
- `checkpoints/drafts-v5/Settings.dc.html` — referenced resource
- `checkpoints/drafts-v5/data.json` — referenced resource
- `checkpoints/drafts-v7/Filters.dc.html` — referenced resource
- `checkpoints/drafts-v7/PasteStatus.dc.html` — referenced resource
- `checkpoints/drafts-v7/Picture.dc.html` — referenced resource
- `checkpoints/drafts-v7/Reader.dc.html` — referenced resource
- `checkpoints/drafts-v7/Settings.dc.html` — referenced resource
- `checkpoints/drafts-v7/data.json` — referenced resource
- `checkpoints/drafts-v7/tokens.css` — referenced resource
- `data.json` — referenced resource
- `tokens.css` — referenced resource
- `Text.dc.html` — referenced resource
- `checkpoints/drafts-v2/Text.dc.html` — referenced resource
- `checkpoints/drafts-v3/Text.dc.html` — referenced resource
- `checkpoints/drafts-v5/Text.dc.html` — referenced resource
- `checkpoints/drafts-v7/Text.dc.html` — referenced resource
- `checkpoints/drafts-v2/img/andon.webp` — referenced resource
- `checkpoints/drafts-v2/img/garmin.webp` — referenced resource
- `checkpoints/drafts-v2/img/ghelper.webp` — referenced resource
- `checkpoints/drafts-v2/img/llamacpp.webp` — referenced resource
- `checkpoints/drafts-v2/img/pairble.webp` — referenced resource
- `checkpoints/drafts-v2/img/proschi.webp` — referenced resource
- `checkpoints/drafts-v3/img/andon.webp` — referenced resource
- `checkpoints/drafts-v3/img/garmin.webp` — referenced resource
- `checkpoints/drafts-v3/img/ghelper.webp` — referenced resource
- `checkpoints/drafts-v3/img/llamacpp.webp` — referenced resource
- `checkpoints/drafts-v3/img/pairble.webp` — referenced resource
- `checkpoints/drafts-v3/img/proschi.webp` — referenced resource
- `checkpoints/drafts-v5/img/andon.webp` — referenced resource
- `checkpoints/drafts-v5/img/garmin.webp` — referenced resource
- `checkpoints/drafts-v5/img/ghelper.webp` — referenced resource
- `checkpoints/drafts-v5/img/llamacpp.webp` — referenced resource
- `checkpoints/drafts-v5/img/pairble.webp` — referenced resource
- `checkpoints/drafts-v5/img/proschi.webp` — referenced resource
- `checkpoints/drafts-v7/img/andon.webp` — referenced resource
- `checkpoints/drafts-v7/img/garmin.webp` — referenced resource
- `checkpoints/drafts-v7/img/ghelper.webp` — referenced resource
- `checkpoints/drafts-v7/img/llamacpp.webp` — referenced resource
- `checkpoints/drafts-v7/img/pairble.webp` — referenced resource
- `checkpoints/drafts-v7/img/proschi.webp` — referenced resource
- `img/andon.webp` — referenced resource
- `img/garmin.webp` — referenced resource
- `img/ghelper.webp` — referenced resource
- `img/llamacpp.webp` — referenced resource
- `img/pairble.webp` — referenced resource
- `img/proschi.webp` — referenced resource
- `Inline.dc.html` — referenced resource
- `checkpoints/drafts-v3/Inline.dc.html` — referenced resource
- `checkpoints/drafts-v5/Inline.dc.html` — referenced resource
- `checkpoints/drafts-v7/Inline.dc.html` — referenced resource
- `support.js`, `vendor/react*.js` — the runtime that renders the
  component in a browser; not part of the design.

## Viewing

Serve the folder (e.g. `python3 -m http.server`) and open `Main.dc.html`;
some browsers block the scripts over file://.
