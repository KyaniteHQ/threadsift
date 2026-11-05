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
  controlId: string;
  noteId: string | undefined;
  choose: Choose;
}>;

const NEXT = (index: number, count: number): number => (index + 1) % count;
const PREVIOUS = (index: number, count: number): number => (index + count - 1) % count;

const MOVES: ReadonlyMap<string, (index: number, count: number) => number> = new Map([
  ["ArrowRight", NEXT],
  ["ArrowDown", NEXT],
  ["ArrowLeft", PREVIOUS],
  ["ArrowUp", PREVIOUS],
  ["Home", () => 0],
  ["End", (_index, count) => count - 1],
]);

function radioAfter(key: string, current: HTMLElement): HTMLElement | undefined {
  const move = MOVES.get(key);

  const radios = [
    ...(current.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]') ??
      []),
  ];

  return move === undefined ? undefined : radios[move(radios.indexOf(current), radios.length)];
}

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
  checked,
  choose,
}: Readonly<{
  row: SettingRow;
  option: Readonly<{ id: string; label: string }>;
  checked: boolean;
  choose: Choose;
}>) {
  const isSwatch = row.kind === "swatches";

  const pick = useCallback(() => {
    choose(row.key, option.id);
  }, [choose, row.key, option.id]);

  const move = useCallback(
    (event: Readonly<{ key: string; currentTarget: HTMLElement; preventDefault: () => void }>) => {
      const target = radioAfter(event.key, event.currentTarget);

      if (target !== undefined) {
        event.preventDefault();
        target.focus();
        target.click();
      }
    },
    [],
  );

  return (
    <button
      type="button"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a segment or a swatch is a styled button in the APG radio group pattern
      role="radio"
      className={isSwatch ? "st-sw" : "st-b"}
      {...(isSwatch ? { [row.attribute]: option.id, "aria-label": option.label } : {})}
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      onClick={pick}
      onKeyDown={move}
    >
      {isSwatch ? null : option.label}
    </button>
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
