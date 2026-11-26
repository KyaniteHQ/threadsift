# Brand direction kits

These pages draw the three candidate directions of the Brand Brief, Quarto, Index Room and Proof Sheet, as whole component kits on synthetic Items, so the owner can choose one from real screens. [The design system](../../../DESIGN.md), Brand Brief, is the spec of each direction. The kits are a mockup for that choice, not app code: the app takes its values from `design/system/tokens.css` and builds its own components.

## Viewing

Serve the prototype folder as [the prototype README](../README.md) says, then open:

- http://127.0.0.1:8000/kits/ for the three directions side by side. Its controls switch the screen (List, Grid, Reader, Components), the Theme (Light, Dark, Sepia) and the frame each direction draws in (1440 px or 1080 px wide, scaled to fit, or a 390 px phone).
- http://127.0.0.1:8000/kits/kit.html?d=quarto for one direction at full width. `d` takes `quarto`, `index` or `proof`; `screen` takes `list`, `grid`, `reader` or `components`; `theme` takes `light`, `dark` or `sepia`. The bar at the top switches all three.

Each screen opens the "Aa" panel from its Aa button. The panel works: Style, Theme, Accent, Font, Text size, Text width, Density and Card images change the page, and Reset look returns every Look setting to the direction's default.

## How a direction is built

Every direction draws the same markup. `directions.css` holds one block of custom properties per direction: the neutral hue and chroma, the default Accent, the corners, the hairline weight, the shadows, the button fill, the field edge, the Tag drawing, the unread mark and the kept strip. The Theme blocks hold the lightness steps of the app's Light and Dark Themes, and Sepia keeps the app's own warm values. `kit.css` holds the components and reads only those properties. Proof Sheet's ink band on a Grid card and the Reader header, and its unread mark on the first metadata line there, are properties too.

The Style tiles of the panel apply the room each direction leaves for the two other Styles, Broadsheet and Workbench, as the Brand Brief describes them. Choosing a Style writes its Font and Accent.

## Synthetic Items

`items.js` holds 12 made-up Items: Reddit posts with nested comments, a saved Reddit comment, X posts with an Author thread, GitHub repositories, Articles, a Link-only Item and an Other link, read and unread, with and without a Digest. Authors, communities, domains and text are invented, and the domains end in `.example`. Covers are shapes the page draws in SVG from each Item's id; no picture is downloaded.

## Fonts

The kits load their faces from the `fonts` folder and from no other host. The files are the Latin subsets of the Fontsource packages below, as published on npm. Every face is under the SIL Open Font License 1.1, and each folder holds the licence text as `OFL.txt`.

| Face | Used by | Fontsource package | Upstream |
|---|---|---|---|
| Schibsted Grotesk | Quarto | `@fontsource-variable/schibsted-grotesk` 5.3.0 | https://github.com/schibsted/schibsted-grotesk |
| Commit Mono | Quarto | `@fontsource/commit-mono` 5.3.0 | https://github.com/eigilnikolajsen/commit-mono |
| Libre Franklin | Index Room | `@fontsource-variable/libre-franklin` 5.3.0 | https://github.com/googlefonts/Libre-Franklin |
| Literata | Index Room | `@fontsource-variable/literata` 5.3.0 | https://github.com/googlefonts/literata |
| Fragment Mono | Index Room | `@fontsource/fragment-mono` 5.3.0 | https://github.com/weiweihuanghuang/fragment-mono |
| Archivo | Proof Sheet | `@fontsource-variable/archivo` 5.3.0 | https://github.com/Omnibus-Type/Archivo |
| Source Serif 4 | Proof Sheet, Quarto's Broadsheet Font | `@fontsource-variable/source-serif-4` 5.3.1 | https://github.com/google/fonts |
| JetBrains Mono | Proof Sheet | `@fontsource-variable/jetbrains-mono` 5.3.0 | https://github.com/JetBrains/JetBrainsMono |
| Atkinson Hyperlegible Next | the fourth Font of every direction, and the side-by-side page | `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 | https://github.com/googlefonts/atkinson-hyperlegible-next |
| Atkinson Hyperlegible Mono | the fourth Font of every direction | `@fontsource-variable/atkinson-hyperlegible-mono` 5.3.0 | https://github.com/googlefonts/atkinson-hyperlegible-next-mono |
