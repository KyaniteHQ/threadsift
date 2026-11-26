# Library prototype: List and Grid

This folder is a clickable mockup of the first screens, exported from a visual design tool as a standalone page. It is a reference, not production code. The `kits` folder beside the export draws the three brand directions of the Brand Brief on synthetic Items; [its README](kits/README.md) describes it. The app takes its values from `design/system/tokens.css`, not from this folder's `tokens.css`, and builds its own components instead of copying the markup.

`data.json` and `img/` hold the owner's real saves, which include other people's posts, comments and images. Both are gitignored and not in the repository.

## Viewing

The prototype loads its data with `fetch`, and some browsers block its scripts over `file://`, so it needs a local web server:

```sh
cd design/prototype
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/Main.dc.html. Press T for the Tweaks panel, which has Compare for two settings side by side.

Without the sample data the app shows "Couldn’t load the library data." To fill it, put a `data.json` in the shape `library.js` reads, and its images in `img/`, inside `design/prototype/`.

The brand direction kits need no data. Open http://127.0.0.1:8000/kits/ for the three directions side by side, and http://127.0.0.1:8000/kits/kit.html?d=quarto for one direction at full width.
