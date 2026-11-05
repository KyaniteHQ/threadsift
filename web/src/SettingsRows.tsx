import { type ChangeEvent, useCallback } from "react";

import {
  GROUPS,
  SETTINGS,
  type SettingKey,
  type SettingRow,
  type Settings,
  followsDevice,
} from "../../design/system/settings.ts";
import { MATCH_SYSTEM_NOTES } from "./text.ts";

const SHOWN_KEYS: ReadonlySet<SettingKey> = new Set([
  "theme",
  "font",
  "size",
  "width",
  "density",
  "accent",
]);

const SHOWN_GROUPS = GROUPS.map((group) => ({
  group,
  rows: SETTINGS.filter((row) => row.group === group && SHOWN_KEYS.has(row.key)),
})).filter(({ rows }) => rows.length > 0);

export type Choose = (key: SettingKey, id: string) => void;

type ControlProps = Readonly<{
  row: SettingRow;
  value: string;
  labelId: string;
  noteId: string | undefined;
  choose: Choose;
}>;

function noteOf(row: SettingRow, settings: Settings, isDark: boolean): string | null {
  if (row.key !== "theme" || !followsDevice(settings)) {
    return null;
  }

  return MATCH_SYSTEM_NOTES[isDark ? "dark" : "light"];
}

function SelectControl({ row, value, labelId, noteId, choose }: ControlProps) {
  const change = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      choose(row.key, event.target.value);
    },
    [choose, row.key],
  );

  return (
    <select
      className="st-sel"
      aria-labelledby={labelId}
      aria-describedby={noteId}
      value={value}
      onChange={change}
    >
      {row.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Choice({
  row,
  option,
  pressed,
  choose,
}: Readonly<{
  row: SettingRow;
  option: Readonly<{ id: string; label: string }>;
  pressed: boolean;
  choose: Choose;
}>) {
  const isSwatch = row.kind === "swatches";

  const pick = useCallback(() => {
    choose(row.key, option.id);
  }, [choose, row.key, option.id]);

  return (
    <button
      type="button"
      className={isSwatch ? "st-sw" : "st-b"}
      {...(isSwatch
        ? { [row.attribute]: option.id, "aria-label": option.label, title: option.label }
        : {})}
      aria-pressed={pressed}
      onClick={pick}
    >
      {isSwatch ? null : option.label}
    </button>
  );
}

function ButtonsControl({ row, value, labelId, noteId, choose }: ControlProps) {
  const isSwatches = row.kind === "swatches";

  return (
    <fieldset
      className={isSwatches ? "st-sws" : "st-seg"}
      aria-labelledby={labelId}
      aria-describedby={noteId}
    >
      {row.options.map((option) => (
        <Choice
          key={option.id}
          row={row}
          option={option}
          pressed={value === option.id}
          choose={choose}
        />
      ))}
    </fieldset>
  );
}

function Row({
  row,
  settings,
  isDark,
  idBase,
  choose,
}: Readonly<{
  row: SettingRow;
  settings: Settings;
  isDark: boolean;
  idBase: string;
  choose: Choose;
}>) {
  const labelId = `${idBase}-${row.key}`;
  const noteId = `${labelId}-note`;
  const note = noteOf(row, settings, isDark);
  const Control = row.kind === "select" ? SelectControl : ButtonsControl;

  return (
    <div className="st-row">
      <span className="st-l" id={labelId}>
        {row.label}
      </span>
      <Control
        row={row}
        value={settings[row.key]}
        labelId={labelId}
        noteId={note === null ? undefined : noteId}
        choose={choose}
      />
      {note === null ? null : (
        <p className="st-note" id={noteId}>
          {note}
        </p>
      )}
    </div>
  );
}

export function SettingsRows({
  settings,
  isDark,
  idBase,
  choose,
}: Readonly<{ settings: Settings; isDark: boolean; idBase: string; choose: Choose }>) {
  return SHOWN_GROUPS.map(({ group, rows }) => (
    <section key={group} className="st-group" aria-labelledby={`${idBase}-group-${rows[0]?.key}`}>
      <h2 className="st-gh" id={`${idBase}-group-${rows[0]?.key}`}>
        {group}
      </h2>
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          settings={settings}
          isDark={isDark}
          idBase={idBase}
          choose={choose}
        />
      ))}
    </section>
  ));
}
