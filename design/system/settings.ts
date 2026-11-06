import {
  SETTINGS,
  type Option,
  THEME,
  type SettingKey,
  type SettingRow,
  type Settings,
} from "./settings-table.ts";

export const PAGE_SETTINGS = SETTINGS.filter((row) => "onPage" in row && row.onPage);

export const DARK_SCHEME = "(prefers-color-scheme: dark)";

function optionOf(row: SettingRow, id: string | undefined): Option | undefined {
  return row.options.find((option) => option.id === id);
}

function isSettings(values: Readonly<Record<string, string>>): values is Settings {
  return SETTINGS.every((row) => optionOf(row, values[row.key]) !== undefined);
}

function build(valueOf: (row: SettingRow) => string): Settings {
  const values = Object.fromEntries(SETTINGS.map((row) => [row.key, valueOf(row)]));

  if (!isSettings(values)) {
    throw new Error("the settings table built a value that is not one of its row's option ids");
  }

  return values;
}

export const DEFAULTS = build((row) => row.default);

export function isSetByStyle(settings: Settings, row: SettingRow): boolean {
  return "setByStyle" in row && row.setByStyle && settings.style !== DEFAULTS.style;
}

export const STORAGE_KEY = "threadsift.settings";

function storedEntries(text: string | null): ReadonlyMap<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text ?? "null");

    return new Map(parsed instanceof Object ? Object.entries(parsed) : []);
  } catch {
    return new Map();
  }
}

export function readStored(text: string | null): Settings {
  const stored = storedEntries(text);

  return build(
    (row) => row.options.find((option) => option.id === stored.get(row.key))?.id ?? row.default,
  );
}

export function serialize(settings: Settings): string {
  return JSON.stringify(settings);
}

export function choose(settings: Settings, key: SettingKey, id: string): Settings {
  return build((row) =>
    row.key === key ? (optionOf(row, id)?.id ?? settings[row.key]) : settings[row.key],
  );
}

export function resetLook(settings: Settings): Settings {
  return build((row) => (row.look ? row.default : settings[row.key]));
}

function resolved(row: SettingRow, id: string, deviceIsDark: boolean): string {
  const follows = optionOf(row, id)?.followsDevice;

  if (follows === undefined) {
    return id;
  }

  return deviceIsDark ? follows[1] : follows[0];
}

export function rootAttributes(
  settings: Settings,
  deviceIsDark: boolean,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    SETTINGS.map((row) => [row.attribute, resolved(row, settings[row.key], deviceIsDark)]),
  );
}

export function resolvedTheme(settings: Settings, deviceIsDark: boolean): string {
  return resolved(THEME, settings.theme, deviceIsDark);
}

export function followsDevice(row: SettingRow, id: string): boolean {
  return optionOf(row, id)?.followsDevice !== undefined;
}

export {
  GROUPS,
  SETTINGS,
  THEME,
  type SettingKey,
  type SettingRow,
  type Settings,
} from "./settings-table.ts";
