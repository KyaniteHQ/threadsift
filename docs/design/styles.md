# Styles

The Style setting offers Library (the default) and 10 more Styles. Each came from [refero.design](https://styles.refero.design/) as a fit for a reading app with long text, comment threads and a list or grid of saves. Each is one `[data-style]` block in the design tokens, with Light, Dark and Sepia themes, and the tokens hold its final colours. The name of each Style links to its refero page.

The refero exports name commercial faces, and the app swaps them for faces from Google Fonts. `STYLE_FACES` lists the faces each Style loads, and while a Style other than Library is on, its faces replace the Font setting.

| Style | Mood | Source faces | Why it fits |
|---|---|---|---|
| [Anthropic](https://styles.refero.design/style/d469cba4-c448-4a43-a033-883f8bfcdc42) | warm editorial serif, light | Anthropic Serif, Anthropic Sans | a serif body at 18 to 20 px on ivory with one clay accent; maps onto the Sepia theme |
| [Slash](https://styles.refero.design/style/7c38e84b-aea0-4c8f-b3e9-60b994ee6c6b) | dark reader, dark | Ivy Presto, Inter | near-black surfaces and a copper tag accent give a warm night-reading look, with ledger-like Item rows |
| [Modal](https://styles.refero.design/style/68c15685-5db9-4869-b71d-27240568c9d8) | mono or devtools, dark | Goga, Inter Variable | phosphor green on black suits GitHub Items and code blocks; the lime dot works as an unread marker |
| [mymind](https://styles.refero.design/style/5bfe6c1d-1b15-4f8d-b0c9-677a33291c5d) | soft productivity, light | Louize, Open Sans, Nunito | the closest match to a one-person link library; pastel cards can colour-code Topics and Summary cards |
| [Monocle](https://styles.refero.design/style/9165ecb1-f068-4093-8783-1f3c98898b8a) | paper or print, light | Plantin, Helvetica Neue | a cream broadsheet canvas with hairline rules and no shadows gives a print-like list rhythm |
| [Linear](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1) | dark reader, dark | Inter Variable, Berkeley Mono | a compact dark list with 0.5 px hairlines suits dense Item rows, Tag chips and threaded comments |
| [Switch-Lit](https://styles.refero.design/style/97f7787e-bba0-4d37-8b74-4b0cb8d5a57c) | high-contrast or bold, light | ABCCameraHeavy, ABCArizonaFlare, ABCArizonaSans | a black hairline grid with highlighter swatches tests whether a loud Style still reads well |
| [Cursor](https://styles.refero.design/style/4e3b4717-84c8-4599-baaf-a343c3d619b6) | mono or devtools, light | CursorGothic, EB Garamond, berkeleyMono | a parchment canvas with mono metadata carries code blocks and the read and unread dot |
| [Steep](https://styles.refero.design/style/75fdb89f-ca64-41b3-af36-7a78bd09448e) | paper or print, light | Signifier, Sohne | a blush callout card is a model for the Summary card with Key points; soft cards suit a grid of Items |
| [Cal.com](https://styles.refero.design/style/5d7aa503-8cfa-49a4-bd3b-0c2f0f075c70) | Swiss or neutral sans, light | Cal Sans, Inter | a strict monochrome with pill buttons is the quiet neutral baseline for the list and the Reader |

The `cal-com` block sets the reading face (`--f-read`) to Inter at weight 400, not the Light 300 weight that the Cal.com export names.
