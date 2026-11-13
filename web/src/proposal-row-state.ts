import type { Busy, Failure } from "./proposals-api.ts";

export type RowState =
  | { readonly kind: "idle" }
  | { readonly kind: "pressing"; readonly busy: Busy | null }
  | { readonly kind: "failed"; readonly failure: Failure }
  | { readonly kind: "busy"; readonly busy: Busy };

export type Rows = ReadonlyMap<number, RowState>;

export type RowEvent =
  | { readonly kind: "press"; readonly id: number; readonly action: Failure }
  | { readonly kind: "fail"; readonly id: number; readonly failure: Failure }
  | { readonly kind: "hold"; readonly id: number; readonly busy: Busy }
  | { readonly kind: "release"; readonly id: number };

export const NO_ROWS: Rows = new Map();

const IDLE: RowState = { kind: "idle" };

const CLEAR_PRESS: RowState = { kind: "pressing", busy: null };

export function rowOf(rows: Readonly<Rows>, id: number): RowState {
  return rows.get(id) ?? IDLE;
}

function withRow(rows: Readonly<Rows>, id: number, row: RowState): Rows {
  return new Map(rows).set(id, row);
}

function without(rows: Readonly<Rows>, id: number): Rows {
  return new Map([...rows].filter(([each]) => each !== id));
}

function pressed(row: RowState, action: Failure): RowState {
  return row.kind === "busy" && action === "reject"
    ? { kind: "pressing", busy: row.busy }
    : CLEAR_PRESS;
}

function released(rows: Readonly<Rows>, id: number, row: RowState): Rows {
  if (row.kind !== "pressing") return rows;

  return row.busy === null
    ? without(rows, id)
    : withRow(rows, id, { kind: "busy", busy: row.busy });
}

export function reduceRows(rows: Readonly<Rows>, event: RowEvent): Rows {
  const row = rowOf(rows, event.id);

  switch (event.kind) {
    case "press":
      return row.kind === "pressing" ? rows : withRow(rows, event.id, pressed(row, event.action));
    case "fail":
      return withRow(rows, event.id, { kind: "failed", failure: event.failure });
    case "hold":
      return withRow(rows, event.id, { kind: "busy", busy: event.busy });
    case "release":
      return released(rows, event.id, row);
    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
