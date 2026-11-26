# Quarto brand kit

This page draws Quarto, the brand direction of the Brand Brief, as a whole component kit on synthetic Items. [The design system](../../../DESIGN.md), Brand Brief, is its spec. The kit is a mockup, not app code: the app takes its values from [the design system tokens](../../system/tokens.css) and builds its own components.

## Viewing

Serve the prototype folder as [the prototype README](../README.md) says, then open:

- http://127.0.0.1:8000/kits/ for the kit. `screen` takes `list`, `grid`, `reader`, `components` or `covers`, and `theme` takes `light`, `dark` or `sepia`, such as http://127.0.0.1:8000/kits/?screen=covers&theme=dark. The bar at the top switches both.

List, Grid and the Reader open the "Aa" panel from their Aa button, and Components shows the same panel inline. Covers has no panel and always draws its covers, whatever Card images is set to. The panel works: Style, Theme, Accent, Font, Text size, Text width, Density and Card images change the page, and Reset look returns every Look setting to its default.

## Covers

An Item with no stored picture gets a cover in the Grid card: its first lines in the reading face, top left, fading out at the bottom, with a mark for its Source and a quiet tint from its Topic, in the same 16:10 box as a stored picture. The page draws it in HTML and CSS from the Item's fields, so it follows the Style and the Theme through the same custom properties as the rest of the kit, and its text never goes under 12 px. A cover never repeats the title: when a text begins with the title, the cover starts after it. A Reddit post with no text shows its first Kept comment, and an Item with no text to show draws the host and path of its link. The fading line at the bottom is decoration, and the Reader prints its text in full. A cover is a picture of text the Reader holds in full, so assistive technology skips it, and the Grid's sheet draws no cover over the Reader text that repeats it; a stored picture still shows there.

A cover draws no strip of its own, because the kept strip directly above it in the Grid card already holds the community or the Source, the handle, the language or the domain, and a thread's comment count; a repository's stars and an Article's reading time go on the card's metadata line under the title.

The Covers screen shows the five kinds side by side: a Reddit post, an X post, a GitHub repository, an Article with no picture and a Link-only Item. Each shows its Grid card and its List row with the 40 px tile, which holds the Topic tint and the Source mark and no text. Its Item titles are plain text, not links, because the screen compares and does not navigate.

## How the kit is built

The kit's tokens hold the custom properties a Style may set: the neutral hue and chroma, the corners, the hairline weight, the shadow of floating layers and the button fill, with the Library values as the default and the Broadsheet and Workbench values as the Brand Brief describes them. The Theme blocks hold the lightness steps of the app's Light and Dark Themes, and Sepia keeps the app's own warm values. The Font blocks hold the 4 pairs. The component styles read those properties and draw every other part of Quarto with fixed values, because no Style may change it.

The Style tiles of the panel apply the three Styles. Choosing a Style writes its own Font pair and the default Accent, Moss.

The kept strip is the first line of a List row and a Grid card, under the top rule with the bar of Kept comments. In the Reader the header opens with the same rule and the title, and the strip and the unread mark open the line under the title, before the author and the date.

## Synthetic Items

The kit draws 13 made-up Items: Reddit posts with nested comments, a Reddit link post with no text, a saved Reddit comment, X posts with an Author thread, GitHub repositories, Articles, a Link-only Item and an Other link, read and unread, with and without a Digest. Authors, communities, handles, repositories, domains and text are invented. Every Item holds its link as text that no page loads: a Reddit, X or GitHub link uses that Source's own host, because a Reddit link is how a Link-only Item gets its community, and every other domain ends in `.example`. Each Item stores how many comments were saved; the kept strip and the Reader's Comments heading count the comments the Reader draws for it. Three Items stand for an Item with a stored picture: the page draws their picture as SVG shapes from the Item's id, and no picture is downloaded. Every other Item gets a cover. Besides the post text, the comments and the facts every Item holds, the synthetic set holds the fields a cover and the card's line under the title read: a repository's description and an Article's reading time. The excerpt of the post text, cut at a sentence end, the first Kept comment of a Reddit post with a Digest, and the host and path of the link are derived from the post, its comments and its link.

## Fonts

The kit loads its faces from their own fonts folder and from no other host. The font files are the Latin subsets of the Fontsource packages below, as published on npm. Every face is under the SIL Open Font License 1.1. Beside each face's files is the licence file of its upstream repository, taken at the commit that Google Fonts records as the source of the files Fontsource packages; the licence address below names that commit.

| Face | Used by | Fontsource package |
|---|---|---|
| Schibsted Grotesk | the Library and Broadsheet Fonts | `@fontsource-variable/schibsted-grotesk` 5.3.0 |
| Commit Mono | the kept strip and code, and the Workbench Font | `@fontsource/commit-mono` 5.3.0 |
| Source Serif 4 | the reading face of the Broadsheet Font | `@fontsource-variable/source-serif-4` 5.3.1 |
| Atkinson Hyperlegible Next | the fourth Font, and the kit's own bar | `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 |
| Atkinson Hyperlegible Mono | the fourth Font | `@fontsource-variable/atkinson-hyperlegible-mono` 5.3.0 |

Upstream licence of each face:

- Schibsted Grotesk: https://github.com/schibsted/schibsted-grotesk/blob/d485f61f105e1b3935f4d21dfb4d371359798603/OFL.txt (release 1.100)
- Commit Mono: https://github.com/eigilnikolajsen/commit-mono/blob/bba066d124f00247fd8ea584c846c68b0cb48a58/LICENSE-FONT. Fontsource packages release 1.132, whose licence text, https://github.com/eigilnikolajsen/commit-mono/blob/1.132/src/txt/license.txt, carries no copyright line; the upstream font licence file adds the copyright line to the same licence.
- Source Serif 4: https://github.com/adobe-fonts/source-serif/blob/b3980ade53bb3d023a0006076d05349236b309b1/LICENSE.md
- Atkinson Hyperlegible Next: https://github.com/googlefonts/atkinson-hyperlegible-next/blob/7925f50f649b3813257faf2f4c0b381011f434f1/OFL.txt
- Atkinson Hyperlegible Mono: https://github.com/googlefonts/atkinson-hyperlegible-next-mono/blob/154d50362016cc3e873eb21d242cd0772384c8f9/OFL.txt
