import { z } from "zod";

export const GROUPS = ["View", "Reading", "Cards and tags"] as const;

export interface Option {
  readonly id: string;
  readonly label: string;
  readonly followsDevice?: readonly [light: string, dark: string];
}

export interface Setting {
  readonly key: string;
  readonly label: string;
  readonly attribute: `data-${string}`;
  readonly kind: "segments" | "select" | "swatches";
  readonly group: (typeof GROUPS)[number];
  readonly look: boolean;
  readonly default: string;
  readonly options: readonly [Option, ...Option[]];
}

function setting<const Row extends Setting>(
  row: Row & { readonly default: Row["options"][number]["id"] },
): Row {
  return row;
}

const THEME = setting({
  key: "theme",
  label: "Theme",
  attribute: "data-theme",
  kind: "segments",
  group: "Reading",
  look: false,
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
    label: "Layout",
    attribute: "data-layout",
    kind: "segments",
    group: "View",
    look: false,
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
    default: "page",
    options: [
      { id: "page", label: "Page" },
      { id: "sheet", label: "Sheet" },
    ],
  }),
  setting({
    key: "style",
    label: "Style",
    attribute: "data-style",
    kind: "select",
    group: "Reading",
    look: true,
    default: "library",
    options: [{ id: "library", label: "Library" }],
  }),
  THEME,
  setting({
    key: "font",
    label: "Font",
    attribute: "data-font",
    kind: "select",
    group: "Reading",
    look: true,
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
    default: "lines",
    options: [
      { id: "lines", label: "Indented lines" },
      { id: "cards", label: "Cards" },
      { id: "rail", label: "Rail" },
    ],
  }),
  setting({
    key: "accent",
    label: "Accent",
    attribute: "data-accent",
    kind: "swatches",
    group: "Cards and tags",
    look: true,
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
    default: "on",
    options: [
      { id: "on", label: "On" },
      { id: "off", label: "Off" },
    ],
  }),
] as const;

export type SettingRow = (typeof SETTINGS)[number];

export type SettingKey = SettingRow["key"];

const SettingsSchema = z.record(z.enum(SETTINGS.map((row) => row.key)), z.string());

export type Settings = Readonly<z.infer<typeof SettingsSchema>>;

function optionsOf(row: Setting): readonly Option[] {
  return row.options;
}

function build(valueOf: (row: SettingRow) => string): Settings {
  return SettingsSchema.parse(Object.fromEntries(SETTINGS.map((row) => [row.key, valueOf(row)])));
}

export const DEFAULTS = build((row) => row.default);

export const STORAGE_KEY = "threadsift.settings";

function storedValues(text: string | null) {
  try {
    return z
      .record(z.string(), z.unknown())
      .catch({})
      .parse(JSON.parse(text ?? "null"));
  } catch {
    return {};
  }
}

export function readStored(text: string | null): Settings {
  const stored = storedValues(text);

  return build((row) =>
    z
      .enum(optionsOf(row).map((option) => option.id))
      .catch(row.default)
      .parse(stored[row.key]),
  );
}

export function serialize(settings: Settings): string {
  return JSON.stringify(settings);
}

export function choose(settings: Settings, key: SettingKey, id: string): Settings {
  return build((row) => (row.key === key ? id : settings[row.key]));
}

export function resetLook(settings: Settings): Settings {
  return build((row) => (row.look ? row.default : settings[row.key]));
}

function resolved(row: Setting, id: string, deviceIsDark: boolean): string {
  const follows = optionsOf(row).find((option) => option.id === id)?.followsDevice;

  if (follows === undefined) {
    return id;
  }

  return deviceIsDark ? follows[1] : follows[0];
}

export function rootAttributes(
  settings: Settings,
  deviceIsDark: boolean,
): readonly (readonly [string, string])[] {
  return SETTINGS.map((row) => [row.attribute, resolved(row, settings[row.key], deviceIsDark)]);
}

export function resolvedTheme(settings: Settings, deviceIsDark: boolean): string {
  return resolved(THEME, settings.theme, deviceIsDark);
}

export function followsDevice(settings: Settings): boolean {
  return optionsOf(THEME).some(
    (option) => option.id === settings.theme && option.followsDevice !== undefined,
  );
}
