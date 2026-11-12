import type { Settings } from "./settings-table.ts";
import { DEFAULTS } from "./settings.ts";

interface Face {
  readonly family: string;
  readonly load: () => Promise<object>;
}

const IN_ENTRY_CSS = () => Promise.resolve({});

export const FACES = {
  "ibm-plex-sans": { family: "IBM Plex Sans", load: IN_ENTRY_CSS },
  "ibm-plex-mono": { family: "IBM Plex Mono", load: IN_ENTRY_CSS },
  inter: {
    family: "Inter Variable",
    load: () => import("@fontsource-variable/inter/wght.css"),
  },
  "playfair-display": {
    family: "Playfair Display Variable",
    load: () => import("@fontsource-variable/playfair-display/wght.css"),
  },
  "space-grotesk": {
    family: "Space Grotesk Variable",
    load: () => import("@fontsource-variable/space-grotesk/wght.css"),
  },
  nunito: {
    family: "Nunito Variable",
    load: () => import("@fontsource-variable/nunito/wght.css"),
  },
  "dm-sans": {
    family: "DM Sans Variable",
    load: () => import("@fontsource-variable/dm-sans/opsz.css"),
  },
  fraunces: {
    family: "Fraunces Variable",
    load: () => import("@fontsource-variable/fraunces/wght.css"),
  },
  "eb-garamond": {
    family: "EB Garamond Variable",
    load: () =>
      Promise.all([
        import("@fontsource-variable/eb-garamond/wght.css"),
        import("@fontsource-variable/eb-garamond/wght-italic.css"),
      ]),
  },
  "roboto-mono": {
    family: "Roboto Mono Variable",
    load: () => import("@fontsource-variable/roboto-mono/wght.css"),
  },
  "cal-sans": {
    family: "Cal Sans",
    load: () => import("@fontsource/cal-sans/400.css"),
  },
  spectral: {
    family: "Spectral",
    load: () =>
      Promise.all([
        import("@fontsource/spectral/400.css"),
        import("@fontsource/spectral/400-italic.css"),
        import("@fontsource/spectral/600.css"),
        import("@fontsource/spectral/700.css"),
      ]),
  },
  "dm-mono": {
    family: "DM Mono",
    load: () => import("@fontsource/dm-mono/400.css"),
  },
  "fira-mono": {
    family: "Fira Mono",
    load: () => import("@fontsource/fira-mono/400.css"),
  },
  "space-mono": {
    family: "Space Mono",
    load: () => import("@fontsource/space-mono/400.css"),
  },
  "bricolage-grotesque": {
    family: "Bricolage Grotesque Variable",
    load: () => import("@fontsource-variable/bricolage-grotesque/opsz.css"),
  },
  figtree: {
    family: "Figtree Variable",
    load: () => import("@fontsource-variable/figtree/wght.css"),
  },
  "geist-mono": {
    family: "Geist Mono Variable",
    load: () => import("@fontsource-variable/geist-mono/wght.css"),
  },
  geist: {
    family: "Geist Variable",
    load: () => import("@fontsource-variable/geist/wght.css"),
  },
  "instrument-sans": {
    family: "Instrument Sans Variable",
    load: () => import("@fontsource-variable/instrument-sans/wght.css"),
  },
  "jetbrains-mono": {
    family: "JetBrains Mono Variable",
    load: () => import("@fontsource-variable/jetbrains-mono/wght.css"),
  },
  newsreader: {
    family: "Newsreader Variable",
    load: () =>
      Promise.all([
        import("@fontsource-variable/newsreader/opsz.css"),
        import("@fontsource-variable/newsreader/opsz-italic.css"),
      ]),
  },
  "source-serif-4": {
    family: "Source Serif 4 Variable",
    load: () => import("@fontsource-variable/source-serif-4/opsz.css"),
  },
  "instrument-serif": {
    family: "Instrument Serif",
    load: () =>
      Promise.all([
        import("@fontsource/instrument-serif/400.css"),
        import("@fontsource/instrument-serif/400-italic.css"),
      ]),
  },
} satisfies Record<string, Face>;

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
  const results = await Promise.allSettled(faces.map((face) => FACES[face].load()));

  return results.every((result) => result.status === "fulfilled");
}
