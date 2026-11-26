# Brand direction kits

These pages draw the three candidate directions of the Brand Brief, Quarto, Index Room and Proof Sheet, as whole component kits on synthetic Items, so the owner can choose one from real screens. [The design system](../../../DESIGN.md), Brand Brief, is the spec of each direction. The kits are a mockup for that choice, not app code: the app takes its values from [the design system tokens](../../system/tokens.css) and builds its own components.

## Viewing

Serve the prototype folder as [the prototype README](../README.md) says, then open:

- http://127.0.0.1:8000/kits/ for the three directions side by side. Its controls switch the screen (List, Grid, Reader, Components), the Theme (Light, Dark, Sepia) and the frame each direction draws in (1440 px or 1080 px wide, scaled to fit, or a 390 px phone).
- http://127.0.0.1:8000/kits/kit.html?d=quarto for one direction at full width. `d` takes `quarto`, `index` or `proof`; `screen` takes `list`, `grid`, `reader` or `components`; `theme` takes `light`, `dark` or `sepia`. The bar at the top switches all three.

Each screen opens the "Aa" panel from its Aa button. The panel works: Style, Theme, Accent, Font, Text size, Text width, Density and Card images change the page, and Reset look returns every Look setting to the direction's default.

## How a direction is built

Every direction draws the same markup. Each direction is one block of custom properties: the neutral hue and chroma, the default Accent, the corners, the hairline weight, the shadows, the button fill, the field edge, the Tag drawing, the unread mark, the kept strip and the Grid's rules. The Theme blocks hold the lightness steps of the app's Light and Dark Themes, and Sepia keeps the app's own warm values. The shared component styles read only those properties. Proof Sheet's ink band on a Grid card and the Reader header, and its unread mark on the first metadata line there, are properties too.

The Style tiles of the panel apply the room each direction leaves for the two other Styles, Broadsheet and Workbench, as the Brand Brief describes them. Choosing a Style writes its Font and Accent. Index Room and Proof Sheet give the print Style, Broadsheet, no Font pair of its own, because their reading face is already a serif, so their panels show 3 Font tiles where Quarto shows 4.

## Synthetic Items

The kits draw 12 made-up Items: Reddit posts with nested comments, a saved Reddit comment, X posts with an Author thread, GitHub repositories, Articles, a Link-only Item and an Other link, read and unread, with and without a Digest. Authors, communities, domains and text are invented, and the domains end in `.example`. Each Item stores how many comments were saved; the kept strip and the Reader's Comments heading count the comments the Reader draws for it. Covers are shapes the page draws in SVG from each Item's id; no picture is downloaded.

## Fonts

The kits load their faces from their own fonts folder and from no other host. The font files are the Latin subsets of the Fontsource packages below, as published on npm. Every face is under the SIL Open Font License 1.1. Beside each face's files is the licence file of its upstream repository, taken at the commit that Google Fonts records as the source of the files Fontsource packages; the licence address below names that commit.

| Face | Used by | Fontsource package |
|---|---|---|
| Schibsted Grotesk | Quarto | `@fontsource-variable/schibsted-grotesk` 5.3.0 |
| Commit Mono | Quarto | `@fontsource/commit-mono` 5.3.0 |
| Libre Franklin | Index Room | `@fontsource-variable/libre-franklin` 5.3.0 |
| Literata | Index Room | `@fontsource-variable/literata` 5.3.0 |
| Fragment Mono | Index Room | `@fontsource/fragment-mono` 5.3.0 |
| Archivo | Proof Sheet | `@fontsource-variable/archivo` 5.3.0 |
| Source Serif 4 | Proof Sheet, Quarto's Broadsheet Font | `@fontsource-variable/source-serif-4` 5.3.1 |
| JetBrains Mono | Proof Sheet | `@fontsource-variable/jetbrains-mono` 5.3.0 |
| Atkinson Hyperlegible Next | the fourth Font of every direction, and the side-by-side page | `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 |
| Atkinson Hyperlegible Mono | the fourth Font of every direction | `@fontsource-variable/atkinson-hyperlegible-mono` 5.3.0 |

Upstream licence of each face:

- Schibsted Grotesk: https://github.com/schibsted/schibsted-grotesk/blob/d485f61f105e1b3935f4d21dfb4d371359798603/OFL.txt (release 1.100)
- Commit Mono: https://github.com/eigilnikolajsen/commit-mono/blob/bba066d124f00247fd8ea584c846c68b0cb48a58/LICENSE-FONT. Fontsource packages release 1.132, whose licence text, https://github.com/eigilnikolajsen/commit-mono/blob/1.132/src/txt/license.txt, carries no copyright line; the upstream font licence file adds the copyright line to the same licence.
- Libre Franklin: https://github.com/googlefonts/Libre-Franklin/blob/310b7eef1f7b7ba82322295e0034675ea68040b0/OFL.txt
- Literata: https://github.com/googlefonts/literata/blob/0c2761b727a1b3a7cffd313c37f0f5163dfc7a63/OFL.txt (release 3.103)
- Fragment Mono: https://github.com/weiweihuanghuang/fragment-mono/blob/177a79b53ae0c8f02e56a8671c29c57144f609e9/OFL.txt
- Archivo: https://github.com/Omnibus-Type/Archivo/blob/b5d63988ce19d044d3e10362de730af00526b672/OFL.txt
- Source Serif 4: https://github.com/adobe-fonts/source-serif/blob/b3980ade53bb3d023a0006076d05349236b309b1/LICENSE.md
- JetBrains Mono: https://github.com/JetBrains/JetBrainsMono/blob/19371302b95d218af43299bce79ddbddd0bc364d/OFL.txt
- Atkinson Hyperlegible Next: https://github.com/googlefonts/atkinson-hyperlegible-next/blob/7925f50f649b3813257faf2f4c0b381011f434f1/OFL.txt
- Atkinson Hyperlegible Mono: https://github.com/googlefonts/atkinson-hyperlegible-next-mono/blob/154d50362016cc3e873eb21d242cd0772384c8f9/OFL.txt
