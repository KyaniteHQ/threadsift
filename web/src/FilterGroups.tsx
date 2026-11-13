import { type ChangeEvent, useCallback, useId, useState } from "react";

import type { CountedName } from "../../src/core/item-filters.ts";
import { Icon } from "./Icon.tsx";
import {
  ALL_CHOICE,
  ALL_ROWS,
  ANY_CHOICE,
  FILTER_GROUPS,
  NO_ROWS,
  SHOW_FEWER,
  countTip,
  filled,
  namedOption,
} from "./text.ts";
import { TopicPageLink } from "./TopicLink.tsx";

const SHOWN_ROWS = 5;

export interface Segment<Key extends string> {
  readonly key: Key | null;
  readonly label: string;
  readonly name?: string;
  readonly count: number;
}

function SegmentButton<Key extends string>({
  segment,
  pressed,
  bar,
  pick,
}: Readonly<{
  segment: Segment<Key>;
  pressed: boolean;
  bar: boolean;
  pick: (key: Key | null) => void;
}>) {
  const press = useCallback(() => {
    pick(pressed ? null : segment.key);
  }, [pick, pressed, segment.key]);

  return (
    <button
      type="button"
      className={bar ? "fl-chip" : "fl-seg-b"}
      aria-pressed={pressed}
      aria-label={segment.name}
      title={countTip(segment.label, segment.count)}
      onClick={press}
    >
      {segment.label}
      <span className="fl-n">{segment.count}</span>
    </button>
  );
}

export function Segments<Key extends string>({
  name,
  segments,
  chosen,
  wrap,
  bar,
  pick,
}: Readonly<{
  name: string;
  segments: readonly Segment<Key>[];
  chosen: Key | null;
  wrap: boolean;
  bar: boolean;
  pick: (key: Key | null) => void;
}>) {
  return (
    <fieldset className={bar ? "fl-g" : wrap ? "fl-seg fl-wrap" : "fl-seg"} aria-label={name}>
      {bar ? (
        <span className="label" aria-hidden="true">
          {name}
        </span>
      ) : null}
      {segments.map((segment) => (
        <SegmentButton
          key={segment.key ?? ALL_CHOICE}
          segment={segment}
          pressed={segment.key === chosen}
          bar={bar}
          pick={pick}
        />
      ))}
    </fieldset>
  );
}

export function withAll<Key extends string>(
  segments: readonly Segment<Key>[],
  allName: string,
): readonly Segment<Key>[] {
  const sum = segments.reduce((all, segment) => all + segment.count, 0);

  return [
    { key: null, label: ALL_CHOICE, name: filled(allName, { count: String(sum) }), count: sum },
    ...segments,
  ];
}

function Row({
  row,
  pressed,
  pick,
}: Readonly<{ row: CountedName; pressed: boolean; pick: (key: string | null) => void }>) {
  const press = useCallback(() => {
    pick(pressed ? null : row.key);
  }, [pick, pressed, row.key]);

  return (
    <button type="button" className="fl-row" aria-pressed={pressed} onClick={press}>
      <bdi dir="auto">{row.name}</bdi>
      <span className="fl-n">{row.count}</span>
    </button>
  );
}

export function visibleRows(
  rows: readonly CountedName[],
  chosen: string | null,
  searching: boolean,
): readonly CountedName[] {
  return searching ? rows.filter((row) => row.count > 0 || row.key === chosen) : rows;
}

function MoreRows({
  facet,
  count,
  all,
  toggle,
}: Readonly<{ facet: "topic" | "tag"; count: number; all: boolean; toggle: () => void }>) {
  return (
    <button type="button" className="fl-link" aria-expanded={all} onClick={toggle}>
      {all ? SHOW_FEWER : filled(ALL_ROWS[facet], { count: String(count) })}
    </button>
  );
}

function useToggle(initial: boolean) {
  const [on, setOn] = useState(initial);

  const toggle = useCallback(() => {
    setOn((now) => !now);
  }, []);

  return [on, toggle] as const;
}

function Rows({
  facet,
  rows,
  chosen,
  searching,
  pick,
  id,
}: Readonly<{
  facet: "topic" | "tag";
  rows: readonly CountedName[];
  chosen: string | null;
  searching: boolean;
  pick: (key: string | null) => void;
  id: string;
}>) {
  const [all, toggleAll] = useToggle(false);
  const visible = visibleRows(rows, chosen, searching);

  const shown = all
    ? visible
    : visible.filter((row, index) => index < SHOWN_ROWS || row.key === chosen);

  return (
    <fieldset id={id} className="fl-rows" aria-label={FILTER_GROUPS[facet]}>
      {rows.length === 0 ? <p className="list-hint">{NO_ROWS[facet]}</p> : null}
      {shown.map((row) => (
        <Row key={row.key} row={row} pressed={row.key === chosen} pick={pick} />
      ))}
      {visible.length > SHOWN_ROWS ? (
        <MoreRows facet={facet} count={visible.length} all={all} toggle={toggleAll} />
      ) : null}
    </fieldset>
  );
}

export function RowGroup({
  facet,
  rows,
  chosen,
  searching,
  startsOpen,
  pick,
}: Readonly<{
  facet: "topic" | "tag";
  rows: readonly CountedName[];
  chosen: string | null;
  searching: boolean;
  startsOpen: boolean;
  pick: (key: string | null) => void;
}>) {
  const [open, toggle] = useToggle(startsOpen);
  const listId = useId();

  return (
    <div className="fl-group">
      <button
        type="button"
        className="fl-group-h"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
      >
        <span className="label">{FILTER_GROUPS[facet]}</span>
        <Icon name="chevron" className="ic ic-s" />
      </button>
      {open ? (
        <Rows
          facet={facet}
          rows={rows}
          chosen={chosen}
          searching={searching}
          pick={pick}
          id={listId}
        />
      ) : null}
      {facet === "topic" && chosen !== null ? <TopicPageLink topicKey={chosen} /> : null}
    </div>
  );
}

export function NamedSelect({
  facet,
  rows,
  chosen,
  searching,
  pick,
}: Readonly<{
  facet: "topic" | "tag";
  rows: readonly CountedName[];
  chosen: string | null;
  searching: boolean;
  pick: (key: string | null) => void;
}>) {
  const change = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      pick(event.target.value === "" ? null : event.target.value);
    },
    [pick],
  );

  return (
    <div className="fl-g">
      <label className="fl-g">
        <span className="label">{FILTER_GROUPS[facet]}</span>
        <select className="fl-sel" value={chosen ?? ""} onChange={change}>
          <option value="">{ANY_CHOICE[facet]}</option>
          {visibleRows(rows, chosen, searching).map((row) => (
            <option key={row.key} value={row.key}>
              {namedOption(row.name, row.count)}
            </option>
          ))}
        </select>
      </label>
      {facet === "topic" && chosen !== null ? <TopicPageLink topicKey={chosen} /> : null}
    </div>
  );
}
