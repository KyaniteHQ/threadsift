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

const SHOWN_GROUPS = GROUPS.map((group) => ({
  group,
  rows: SETTINGS.filter((row) => row.group === group && row.shown),
})).filter(({ rows }) => rows.length > 0);

export type Choose = (key: SettingKey, id: string) => void;

type ControlProps = Readonly<{
  row: SettingRow;
  value: string;
  labelId: string;
  controlId: string;
  noteId: string | undefined;
  choose: Choose;
}>;

function noteOf(row: SettingRow, settings: Settings, isDark: boolean): string | null {
  if (row.key !== "theme" || !followsDevice(settings)) {
    return null;
  }

  return MATCH_SYSTEM_NOTES[isDark ? "dark" : "light"];
}

function SelectControl({ row, value, controlId, noteId, choose }: ControlProps) {
  const change = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      choose(row.key, event.target.value);
    },
    [choose, row.key],
  );

  return (
    <select
      id={controlId}
      className="st-sel"
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
  name,
  checked,
  choose,
}: Readonly<{
  row: SettingRow;
  option: Readonly<{ id: string; label: string }>;
  name: string;
  checked: boolean;
  choose: Choose;
}>) {
  const isSwatch = row.kind === "swatches";

  const pick = useCallback(() => {
    choose(row.key, option.id);
  }, [choose, row.key, option.id]);

  return (
    <label
      className={isSwatch ? "st-sw" : "st-b"}
      {...(isSwatch ? { [row.attribute]: option.id } : {})}
    >
      <input
        type="radio"
        className="st-in"
        name={name}
        value={option.id}
        checked={checked}
        aria-label={isSwatch ? option.label : undefined}
        onChange={pick}
      />
      {isSwatch ? null : option.label}
    </label>
  );
}

function ButtonsControl({ row, value, labelId, noteId, choose }: ControlProps) {
  const isSwatches = row.kind === "swatches";

  return (
    <div
      role="radiogroup"
      className={isSwatches ? "st-sws" : "st-seg"}
      aria-labelledby={labelId}
      aria-describedby={noteId}
    >
      {row.options.map((option) => (
        <Choice
          key={option.id}
          row={row}
          option={option}
          name={labelId}
          checked={value === option.id}
          choose={choose}
        />
      ))}
    </div>
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
  const controlId = `${labelId}-control`;
  const noteId = `${labelId}-note`;
  const note = noteOf(row, settings, isDark);
  const isSelect = row.kind === "select";
  const Control = isSelect ? SelectControl : ButtonsControl;

  return (
    <div className="st-row">
      {isSelect ? (
        <label className="st-l" htmlFor={controlId}>
          {row.label}
        </label>
      ) : (
        <span className="st-l" id={labelId}>
          {row.label}
        </span>
      )}
      <Control
        row={row}
        value={settings[row.key]}
        labelId={labelId}
        controlId={controlId}
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
    <div key={group} className="st-group">
      <h3 className="st-gh">{group}</h3>
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
    </div>
  ));
}
