import { type ChangeEvent, useCallback } from "react";

import {
  GROUPS,
  SETTINGS,
  type SettingKey,
  type SettingRow,
  type Settings,
  THEME,
} from "../../design/system/settings-table.ts";
import { isSetByStyle } from "../../design/system/settings.ts";
import { OPEN_AS_NARROW_NOTE, STYLE_NOTE } from "./text.ts";

function appliesTo(row: SettingRow, settings: Readonly<Settings>): boolean {
  return row.shown && (row.key !== "openAs" || settings.layout === "grid");
}

function shownGroups(settings: Readonly<Settings>) {
  return GROUPS.map((group) => ({
    group,
    rows: SETTINGS.filter((row) => row.group === group && appliesTo(row, settings)),
  })).filter(({ rows }) => rows.length > 0);
}

export type Choose = (key: SettingKey, id: string) => void;

type ControlProps = Readonly<{
  row: SettingRow;
  value: string;
  labelId: string;
  controlId: string;
  noteId: string | undefined;
  disabled: boolean;
  choose: Choose;
}>;

type Why = "style" | "narrow" | null;

function whyOff(row: SettingRow, settings: Readonly<Settings>, narrow: boolean): Why {
  if (isSetByStyle(settings, row)) return "style";

  return row.key === "openAs" && narrow ? "narrow" : null;
}

function noteOf(row: SettingRow, themeNote: string | null, why: Why): string | null {
  if (why === "style") return STYLE_NOTE;

  if (why === "narrow") return OPEN_AS_NARROW_NOTE;

  return row === THEME ? themeNote : null;
}

function SelectControl({ row, value, controlId, noteId, disabled, choose }: ControlProps) {
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
      disabled={disabled}
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
  disabled: boolean;
  choose: Choose;
}>;

function inputIdOf({ name, option }: ChoiceProps): string {
  return `${name}-${option.id}`;
}

function ChoiceInput(props: ChoiceProps & Readonly<{ label: string | undefined }>) {
  const { row, option, name, checked, disabled, choose, label } = props;

  const pick = useCallback(() => {
    choose(row.key, option.id);
  }, [choose, row.key, option.id]);

  return (
    <input
      id={inputIdOf(props)}
      type="radio"
      className="st-in"
      name={name}
      value={option.id}
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={pick}
    />
  );
}

function Swatch(props: ChoiceProps) {
  return (
    <label
      className="st-sw"
      htmlFor={inputIdOf(props)}
      {...{ [props.row.attribute]: props.option.id }}
    >
      <ChoiceInput {...props} label={props.option.label} />
    </label>
  );
}

function Segment(props: ChoiceProps) {
  return (
    <label className="st-b" htmlFor={inputIdOf(props)}>
      <ChoiceInput {...props} label={undefined} />
      {props.option.label}
    </label>
  );
}

function ButtonsControl({ row, value, labelId, noteId, disabled, choose }: ControlProps) {
  const isSwatches = row.kind === "swatches";
  const Choice = isSwatches ? Swatch : Segment;

  return (
    <div
      role="radiogroup"
      className={isSwatches ? "st-sws" : "st-seg"}
      aria-labelledby={labelId}
      aria-disabled={disabled}
      aria-describedby={noteId}
    >
      {row.options.map((option) => (
        <Choice
          key={option.id}
          row={row}
          option={option}
          name={labelId}
          checked={value === option.id}
          disabled={disabled}
          choose={choose}
        />
      ))}
    </div>
  );
}

function RowLabel({
  row,
  labelId,
  controlId,
}: Readonly<{ row: SettingRow; labelId: string; controlId: string }>) {
  return row.kind === "select" ? (
    <label className="st-l" htmlFor={controlId}>
      {row.label}
    </label>
  ) : (
    <span className="st-l" id={labelId}>
      {row.label}
    </span>
  );
}

function Row({
  row,
  settings,
  themeNote,
  narrow,
  idBase,
  choose,
}: Readonly<{
  row: SettingRow;
  settings: Settings;
  themeNote: string | null;
  narrow: boolean;
  idBase: string;
  choose: Choose;
}>) {
  const labelId = `${idBase}-${row.key}`;
  const controlId = `${labelId}-control`;
  const noteId = `${labelId}-note`;
  const why = whyOff(row, settings, narrow);
  const disabled = why !== null;
  const note = noteOf(row, themeNote, why);
  const Control = row.kind === "select" ? SelectControl : ButtonsControl;

  return (
    <div className={disabled ? "st-row off" : "st-row"}>
      <RowLabel row={row} labelId={labelId} controlId={controlId} />
      <Control
        row={row}
        value={settings[row.key]}
        labelId={labelId}
        controlId={controlId}
        noteId={note === null ? undefined : noteId}
        disabled={disabled}
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
  narrow,
  idBase,
  choose,
}: Readonly<{
  settings: Settings;
  themeNote: string | null;
  narrow: boolean;
  idBase: string;
  choose: Choose;
}>) {
  return shownGroups(settings).map(({ group, rows }) => (
    <div key={group} className="st-group">
      <h3 className="st-gh">{group}</h3>
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          settings={settings}
          themeNote={themeNote}
          narrow={narrow}
          idBase={idBase}
          choose={choose}
        />
      ))}
    </div>
  ));
}
