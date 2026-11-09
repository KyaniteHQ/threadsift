export const GROUPS = ["View", "Reading", "Cards and tags"] as const;

export interface Option {
  readonly id: string;
  readonly label: string;
  readonly followsDevice?: readonly [light: string, dark: string];
}

interface Setting {
  readonly key: string;
  readonly label: string;
  readonly attribute: `data-${string}`;
  readonly kind: "segments" | "select" | "swatches";
  readonly group: (typeof GROUPS)[number];
  readonly onPage?: boolean;
  readonly setByStyle?: boolean;
  readonly look: boolean;
  readonly shown: boolean;
  readonly default: string;
  readonly options: readonly [Option, ...Option[]];
}

function setting<const Row extends Setting>(
  row: Row & { readonly default: Row["options"][number]["id"] },
): Row {
  return row;
}

export const THEME = setting({
  key: "theme",
  onPage: true,
  label: "Theme",
  attribute: "data-theme",
  kind: "segments",
  group: "Reading",
  look: false,
  shown: true,
  default: "light",
  options: [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "sepia", label: "Sepia" },
    { id: "system", label: "Match system", followsDevice: ["light", "dark"] },
  ],
});

export const SETTINGS = [
  setting({
    key: "layout",
    onPage: true,
    label: "Layout",
    attribute: "data-layout",
    kind: "segments",
    group: "View",
    look: false,
    shown: true,
    default: "list",
    options: [
      { id: "list", label: "List" },
      { id: "grid", label: "Grid" },
    ],
  }),
  setting({
    key: "openAs",
    label: "Open items as",
    attribute: "data-open-as",
    kind: "segments",
    group: "View",
    look: false,
    shown: true,
    default: "page",
    options: [
      { id: "page", label: "Page" },
      { id: "sheet", label: "Sheet" },
    ],
  }),
  setting({
    key: "style",
    onPage: true,
    label: "Style",
    attribute: "data-style",
    kind: "select",
    group: "Reading",
    look: true,
    shown: true,
    default: "library",
    options: [
      { id: "library", label: "Library" },
      { id: "anthropic", label: "Anthropic" },
      { id: "slash", label: "Slash" },
      { id: "modal", label: "Modal" },
      { id: "mymind", label: "mymind" },
      { id: "monocle", label: "Monocle" },
      { id: "linear", label: "Linear" },
      { id: "switch-lit", label: "Switch-Lit" },
      { id: "cursor", label: "Cursor" },
      { id: "steep", label: "Steep" },
      { id: "cal-com", label: "Cal.com" },
    ],
  }),
  THEME,
  setting({
    key: "font",
    setByStyle: true,
    label: "Font",
    attribute: "data-font",
    kind: "select",
    group: "Reading",
    look: true,
    shown: true,
    default: "plex",
    options: [
      { id: "plex", label: "IBM Plex Sans + Plex Mono" },
      { id: "news", label: "Newsreader + Instrument Sans" },
      { id: "brico", label: "Bricolage Grotesque + Figtree" },
      { id: "inst", label: "Instrument Serif + Geist" },
      { id: "mono", label: "JetBrains Mono + Source Serif" },
    ],
  }),
  setting({
    key: "size",
    label: "Text size",
    attribute: "data-size",
    kind: "segments",
    group: "Reading",
    look: true,
    shown: true,
    default: "medium",
    options: [
      { id: "small", label: "Small" },
      { id: "medium", label: "Medium" },
      { id: "large", label: "Large" },
    ],
  }),
  setting({
    key: "width",
    label: "Text width",
    attribute: "data-width",
    kind: "segments",
    group: "Reading",
    look: true,
    shown: true,
    default: "medium",
    options: [
      { id: "narrow", label: "Narrow" },
      { id: "medium", label: "Medium" },
      { id: "wide", label: "Wide" },
    ],
  }),
  setting({
    key: "density",
    label: "Density",
    attribute: "data-density",
    kind: "segments",
    group: "Reading",
    look: true,
    shown: true,
    default: "compact",
    options: [
      { id: "compact", label: "Compact" },
      { id: "comfortable", label: "Comfortable" },
      { id: "roomy", label: "Roomy" },
    ],
  }),
  setting({
    key: "comments",
    label: "Comment style",
    attribute: "data-comments",
    kind: "segments",
    group: "Reading",
    look: true,
    shown: true,
    default: "lines",
    options: [
      { id: "lines", label: "Indented lines" },
      { id: "cards", label: "Cards" },
      { id: "rail", label: "Rail" },
    ],
  }),
  setting({
    key: "accent",
    setByStyle: true,
    label: "Accent",
    attribute: "data-accent",
    kind: "swatches",
    group: "Cards and tags",
    look: true,
    shown: true,
    default: "cobalt",
    options: [
      { id: "cobalt", label: "Cobalt" },
      { id: "rust", label: "Rust" },
      { id: "moss", label: "Moss" },
      { id: "iris", label: "Iris" },
      { id: "teal", label: "Teal" },
    ],
  }),
  setting({
    key: "tags",
    label: "Tag style",
    attribute: "data-tags",
    kind: "segments",
    group: "Cards and tags",
    look: true,
    shown: false,
    default: "dots",
    options: [
      { id: "chips", label: "Chips" },
      { id: "text", label: "Text" },
      { id: "dots", label: "Dots" },
    ],
  }),
  setting({
    key: "images",
    label: "Card images",
    attribute: "data-images",
    kind: "segments",
    group: "Cards and tags",
    look: true,
    shown: true,
    default: "on",
    options: [
      { id: "on", label: "On" },
      { id: "off", label: "Off" },
    ],
  }),
] as const;

export type SettingRow = (typeof SETTINGS)[number];

export type SettingKey = SettingRow["key"];

type RowOf<K extends SettingKey> = Extract<SettingRow, { readonly key: K }>;

type OptionId<K extends SettingKey> = RowOf<K>["options"][number]["id"];

export type Settings = Readonly<{ [K in SettingKey]: OptionId<K> }>;
