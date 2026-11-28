# Library prototype: List and Grid

This folder is a clickable mockup of the first screens, exported from a visual design tool as a standalone page. It is a reference, not production code. Beside the export, the Quarto brand kit draws the brand direction of the Brand Brief on synthetic Items; [the kit README](kits/README.md) describes it. The app takes its values from [the design system tokens](../system/tokens.css), not from this folder's own tokens, and builds its own components instead of copying the markup. The export still draws a gear button and its panel links. The masthead, the Look panel and the Instance menu follow [the design system](../../DESIGN.md) and the web app, not this export.

`data.json` and `img/` hold the owner's real saves, which include other people's posts, comments and images. Both are gitignored and not in the repository.

## Viewing

The prototype loads its data with `fetch`, and some browsers block its scripts over `file://`, so it needs a local web server:

```sh
cd design/prototype
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/Main.dc.html. Press T for the Tweaks panel, which has Compare for two settings side by side.

Without the sample data the app shows "Couldn’t load the library data." To fill it, put a `data.json` in the shape `library.js` reads, and its images in `img/`, inside `design/prototype/`.

The Quarto brand kit needs no data. Open http://127.0.0.1:8000/kits/.
