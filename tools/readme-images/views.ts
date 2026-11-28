import type { Ids } from "./seed.ts";

export type Theme = "light" | "dark" | "sepia";

export interface Settings {
  readonly theme: Theme;
  readonly layout: "list" | "grid";
  readonly openAs: "page" | "sheet";
  readonly style: string;
}

export interface Shot {
  readonly name: string;
  readonly path: (ids: Ids) => string;
  readonly width: number;
  readonly height: number;
  readonly layout: "list" | "grid";
  readonly style: string;
  readonly themes: readonly Theme[];
  readonly jumpToComments: boolean;
}

const WINDOW = { width: 1280, height: 800 } as const;

const NARROW_PAGE = { width: 960, height: 720 } as const;

const PAGE_OF_THE_STYLES = { width: 520, height: 680 } as const;

const itemPath = (key: string) => (ids: Ids) => `/items/${String(ids[key])}`;

export const SHOTS: readonly Shot[] = [
  {
    name: "library",
    path: itemPath("four-bay"),
    ...WINDOW,
    layout: "list",
    style: "library",
    themes: ["light", "dark"],
    jumpToComments: false,
  },
  {
    name: "reader",
    path: itemPath("four-bay"),
    ...WINDOW,
    layout: "grid",
    style: "library",
    themes: ["light", "dark"],
    jumpToComments: true,
  },
  {
    name: "grid",
    path: () => "/",
    ...WINDOW,
    layout: "grid",
    style: "library",
    themes: ["light", "dark"],
    jumpToComments: false,
  },
  {
    name: "highlights",
    path: () => "/highlights",
    ...NARROW_PAGE,
    layout: "list",
    style: "library",
    themes: ["light", "dark"],
    jumpToComments: false,
  },
  {
    name: "topic",
    path: () => "/topics/home%20servers",
    ...NARROW_PAGE,
    layout: "list",
    style: "library",
    themes: ["light", "dark"],
    jumpToComments: false,
  },
];

function styleShot(style: string, theme: Theme): Shot {
  return {
    name: `styles-${style}`,
    path: () => "/topics/home%20servers",
    ...PAGE_OF_THE_STYLES,
    layout: "list",
    style,
    themes: [theme],
    jumpToComments: false,
  };
}

export const STYLE_SHOTS: readonly Shot[] = [
  styleShot("library", "light"),
  styleShot("monocle", "sepia"),
  styleShot("modal", "dark"),
];
