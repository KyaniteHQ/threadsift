import type { Settings } from "./settings-table.ts";
import { DEFAULTS } from "./settings.ts";

const IN_ENTRY_CSS = () => Promise.resolve();

export const FACES = {
  "ibm-plex-sans": IN_ENTRY_CSS,
  "ibm-plex-mono": IN_ENTRY_CSS,
  inter: () => import("@fontsource-variable/inter/wght.css"),
  "playfair-display": () => import("@fontsource-variable/playfair-display/wght.css"),
  "space-grotesk": () => import("@fontsource-variable/space-grotesk/wght.css"),
  nunito: () => import("@fontsource-variable/nunito/wght.css"),
  "dm-sans": () => import("@fontsource-variable/dm-sans/opsz.css"),
  fraunces: () => import("@fontsource-variable/fraunces/wght.css"),
  "eb-garamond": () =>
    Promise.all([
      import("@fontsource-variable/eb-garamond/wght.css"),
      import("@fontsource-variable/eb-garamond/wght-italic.css"),
    ]),
  "roboto-mono": () => import("@fontsource-variable/roboto-mono/wght.css"),
  "cal-sans": () => import("@fontsource/cal-sans/400.css"),
  spectral: () =>
    Promise.all([
      import("@fontsource/spectral/400.css"),
      import("@fontsource/spectral/400-italic.css"),
      import("@fontsource/spectral/600.css"),
      import("@fontsource/spectral/700.css"),
    ]),
  "dm-mono": () => import("@fontsource/dm-mono/400.css"),
  "fira-mono": () => import("@fontsource/fira-mono/400.css"),
  "space-mono": () => import("@fontsource/space-mono/400.css"),
  "bricolage-grotesque": () => import("@fontsource-variable/bricolage-grotesque/opsz.css"),
  figtree: () => import("@fontsource-variable/figtree/wght.css"),
  "geist-mono": () => import("@fontsource-variable/geist-mono/wght.css"),
  geist: () => import("@fontsource-variable/geist/wght.css"),
  "instrument-sans": () => import("@fontsource-variable/instrument-sans/wght.css"),
  "jetbrains-mono": () => import("@fontsource-variable/jetbrains-mono/wght.css"),
  newsreader: () =>
    Promise.all([
      import("@fontsource-variable/newsreader/opsz.css"),
      import("@fontsource-variable/newsreader/opsz-italic.css"),
    ]),
  "source-serif-4": () => import("@fontsource-variable/source-serif-4/opsz.css"),
  "instrument-serif": () =>
    Promise.all([
      import("@fontsource/instrument-serif/400.css"),
      import("@fontsource/instrument-serif/400-italic.css"),
    ]),
} as const;

export type FaceId = keyof typeof FACES;

type StyleId = Settings["style"];

type FontId = Settings["font"];

export const STYLE_FACES: Readonly<Record<StyleId, readonly FaceId[]>> = {
  library: [],
  anthropic: ["source-serif-4", "inter", "jetbrains-mono"],
  slash: ["playfair-display", "inter", "jetbrains-mono"],
  modal: ["space-grotesk", "inter", "fira-mono"],
  mymind: ["playfair-display", "nunito", "dm-sans", "dm-mono"],
  monocle: ["spectral", "inter", "ibm-plex-mono"],
  linear: ["inter", "jetbrains-mono"],
  "switch-lit": ["fraunces", "inter", "space-mono"],
  cursor: ["inter", "eb-garamond", "ibm-plex-mono"],
  steep: ["newsreader", "inter", "roboto-mono"],
  "cal-com": ["cal-sans", "inter", "geist-mono"],
};

export const FONT_FACES: Readonly<Record<FontId, readonly FaceId[]>> = {
  plex: ["ibm-plex-sans", "ibm-plex-mono"],
  news: ["newsreader", "instrument-sans", "ibm-plex-mono"],
  brico: ["bricolage-grotesque", "figtree", "jetbrains-mono"],
  inst: ["instrument-serif", "geist", "geist-mono"],
  mono: ["jetbrains-mono", "source-serif-4"],
};

export function facesOf(settings: Settings): readonly FaceId[] {
  return settings.style === DEFAULTS.style
    ? FONT_FACES[settings.font]
    : STYLE_FACES[settings.style];
}

export async function loadFaces(faces: readonly FaceId[]): Promise<boolean> {
  const results = await Promise.allSettled(faces.map((face) => FACES[face]()));

  return results.every((result) => result.status === "fulfilled");
}
