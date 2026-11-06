# Styles

The prototype's "Style" setting offers Library (the default) and these 10 styles. Each was picked on 2026-11-04 from [refero.design](https://styles.refero.design/) for a reading app with long text, comment threads and a list or grid of saves, and each is mapped onto the system tokens as one `[data-style]` block in `design/system/tokens.css`, with Light, Dark and Sepia themes. The refero exports themselves are not copied here; each entry links to its page.

Commercial faces were swapped for Google Fonts:

| Style | Display | Body |
|---|---|---|
| Anthropic | Source Serif 4 | Source Serif 4 |
| Slash | Playfair Display | Inter |
| Modal | Space Grotesk | Inter |
| mymind | Playfair Display | DM Sans |
| Monocle | Spectral | Spectral |
| Linear | Inter | Inter |
| Switch-Lit | Fraunces | Inter |
| Cursor | Inter | EB Garamond |
| Steep | Newsreader | Inter |
| Cal.com | Cal Sans | Inter |

## 1. Anthropic (warm editorial serif, light)

- Page: https://styles.refero.design/style/d469cba4-c448-4a43-a033-883f8bfcdc42
- Fonts the style names: Anthropic Serif (fallback Georgia, Source Serif Pro, Charter) for body and headings; Anthropic Sans (fallback Inter) for UI
- Why: Serif body at 18-20px on ivory (#f0eee6 canvas, #faf9f5 cards) with hairline borders and one clay accent (#d97757) suits long reading, and it maps straight onto the Sepia theme.

## 2. Slash (dark reader, dark)

- Page: https://styles.refero.design/style/7c38e84b-aea0-4c8f-b3e9-60b994ee6c6b
- Fonts the style names: Ivy Presto (didone serif, headings; fallback Playfair Display) and Inter 300-600 for body and UI
- Why: Near-black surfaces (#08080a to #1c1d22) with a stepped grey text scale, a copper (#cc9166) tag accent and 16px Inter body give a warm night-reading look with ledger-like rows for the item list.

## 3. Modal (mono or devtools, dark)

- Page: https://styles.refero.design/style/68c15685-5db9-4869-b71d-27240568c9d8
- Fonts the style names: Goga (headings; fallback Inter Tight or Space Grotesk) and Inter Variable for body and UI
- Why: Phosphor-green on black with hairline green-tinted borders and a lime (#7fee64) accent tests a developer-terminal look for GitHub items and code blocks, and the lime dot works as an unread marker.

## 4. mymind (soft productivity, light)

- Page: https://styles.refero.design/style/5bfe6c1d-1b15-4f8d-b0c9-677a33291c5d
- Fonts the style names: Louize (serif display), Open Sans (body at 18-22px), Nunito (tracked uppercase labels)
- Why: A personal-archive product with pastel tinted card surfaces (#e5eaf2, #f3f0e7, #dde9d3) that can colour-code topics and summary cards, plus an ember orange (#ff5924) outlined accent, is the closest match to a one-person link library.

## 5. Monocle (paper or print, light)

- Page: https://styles.refero.design/style/9165ecb1-f068-4093-8783-1f3c98898b8a
- Fonts the style names: Plantin (serif for headlines and 16-18px body; fallback Source Serif Pro, Spectral), Helvetica Neue (UI chrome, fallback Inter)
- Why: Cream broadsheet canvas (#fdfcf3) with hairline rules, no shadows, tracked uppercase eyebrow labels and a single signal-yellow accent (#ffc500) gives a print-like list rhythm and a different accent from cobalt.

## 6. Linear (dark reader, dark)

- Page: https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1
- Fonts the style names: Inter Variable (all text), Berkeley Mono (fallback JetBrains Mono or IBM Plex Mono) for IDs and metadata
- Why: A compact dark list system with 0.5px hairlines, a clear text ramp from #62666d to #ffffff and tag fills in violet, teal and green suits dense item rows, tag chips and threaded comments.

## 7. Switch-Lit (high-contrast or bold, light)

- Page: https://styles.refero.design/style/97f7787e-bba0-4d37-8b74-4b0cb8d5a57c
- Fonts the style names: ABCCameraHeavy (condensed display), ABCArizonaFlare (flared serif headings), ABCArizonaSans (body and UI)
- Why: Black hairline grid on cream (#f9f9f7) with lime (#edfe5e) and cornflower (#bed4fb) highlighter swatches gives a bold, inked look for tags, summary cards and tables, and tests whether a loud style still reads well.

## 8. Cursor (mono or devtools, light)

- Page: https://styles.refero.design/style/4e3b4717-84c8-4599-baaf-a343c3d619b6
- Fonts the style names: CursorGothic (headings), EB Garamond (editorial prose), berkeleyMono (code, labels, metadata)
- Why: Parchment canvas (#f7f7f4) with ink text, 4px corners, an ember (#f54e00) accent used on links and tags, and mono metadata gives a warm devtools look that carries code blocks and the read/unread dot well.

## 9. Steep (paper or print, light)

- Page: https://styles.refero.design/style/75fdb89f-ca64-41b3-af36-7a78bd09448e
- Fonts the style names: Signifier (serif display, fallback Source Serif 4 or Georgia), Sohne (body and UI 14-26px, fallback Inter)
- Why: A serif-headline, comfortable-density style with a blush-peach (#fbe1d1) callout card with brown text (#5d2a1a) is a ready model for the summary card with key points, and the soft 24px cards suit a grid of saved items.

## 10. Cal.com (Swiss or neutral sans, light)

- Page: https://styles.refero.design/style/5d7aa503-8cfa-49a4-bd3b-0c2f0f075c70
- Fonts the style names: Cal Sans (headings; fallback Poppins), Cal Sans UI Variable Light 300 for body (fallback Inter Light), Inter 400-600 for small UI
- Why: A strict monochrome on a #f4f4f4 ground with white cards, soft 8-12px radii and pill buttons is the quiet neutral baseline for the list and reader; body weight 300 needs a check, so fall back to Inter 400 if it is too thin.


