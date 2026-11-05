import { type ChangeEvent, useCallback } from "react";

import {
  GROUPS,
  SETTINGS,
  type SettingKey,
  type SettingRow,
  type Settings,
  THEME,
} from "../../design/system/settings.ts";

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

function noteOf(row: SettingRow, themeNote: string | null): string | null {
  return row === THEME ? themeNote : null;
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

type ChoiceProps = Readonly<{
  row: SettingRow;
  option: Readonly<{ id: string; label: string }>;
  name: string;
  checked: boolean;
  choose: Choose;
}>;

function usePick({ row, option, choose }: ChoiceProps) {
  return useCallback(() => {
    choose(row.key, option.id);
  }, [choose, row.key, option.id]);
}

function Swatch(props: ChoiceProps) {
  const { row, option, name, checked } = props;
  const pick = usePick(props);

  return (
    <label className="st-sw" {...{ [row.attribute]: option.id }}>
      <input
        type="radio"
        className="st-in"
        name={name}
        value={option.id}
        checked={checked}
        aria-label={option.label}
        onChange={pick}
      />
    </label>
  );
}

function Segment(props: ChoiceProps) {
  const { option, name, checked } = props;
  const pick = usePick(props);

  return (
    <label className="st-b">
      <input
        type="radio"
        className="st-in"
        name={name}
        value={option.id}
        checked={checked}
        onChange={pick}
      />
      {option.label}
    </label>
  );
}

function ButtonsControl({ row, value, labelId, noteId, choose }: ControlProps) {
  const isSwatches = row.kind === "swatches";
  const Choice = isSwatches ? Swatch : Segment;

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
  themeNote,
  idBase,
  choose,
}: Readonly<{
  row: SettingRow;
  settings: Settings;
  themeNote: string | null;
  idBase: string;
  choose: Choose;
}>) {
  const labelId = `${idBase}-${row.key}`;
  const controlId = `${labelId}-control`;
  const noteId = `${labelId}-note`;
  const note = noteOf(row, themeNote);
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
  themeNote,
  idBase,
  choose,
}: Readonly<{ settings: Settings; themeNote: string | null; idBase: string; choose: Choose }>) {
  return SHOWN_GROUPS.map(({ group, rows }) => (
    <div key={group} className="st-group">
      <h3 className="st-gh">{group}</h3>
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          settings={settings}
          themeNote={themeNote}
          idBase={idBase}
          choose={choose}
        />
      ))}
    </div>
  ));
}
