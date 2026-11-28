import { z } from "zod";

import { pixelsOf } from "./css-length.ts";

export type Pane = "rail" | "list";

export type Widths = Readonly<Record<Pane, number>>;

export interface Bounds {
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

export type PaneBounds = Readonly<Record<Pane, Bounds>> & { readonly readerMin: number };

export interface Room {
  readonly width: number;
  readonly rail: boolean;
}

const STORAGE_KEY = "threadsift.pane-widths";

const StoredWidth = z.unknown().transform((value) => {
  const parsed = z.number().positive().safeParse(value);

  return parsed.success ? parsed.data : null;
});

const StoredSchema = z.object({ rail: StoredWidth.optional(), list: StoredWidth.optional() });

type Length = (token: string) => number | null;

function boundsOf(lengthOf: Length, pane: Pane): Bounds | null {
  const min = lengthOf(`--${pane}-min`);
  const max = lengthOf(`--${pane}-max`);
  const initial = lengthOf(`--${pane}-w`);

  return min === null || max === null || initial === null ? null : { min, max, initial };
}

export function readBounds(): PaneBounds | null {
  const style = getComputedStyle(document.documentElement);
  const lengthOf: Length = (token) => pixelsOf(style.getPropertyValue(token).trim());
  const rail = boundsOf(lengthOf, "rail");
  const list = boundsOf(lengthOf, "list");
  const readerMin = lengthOf("--reader-min");

  return rail === null || list === null || readerMin === null ? null : { rail, list, readerMin };
}

function initialWidths(bounds: PaneBounds): Widths {
  return { rail: bounds.rail.initial, list: bounds.list.initial };
}

export function savedWidths(bounds: PaneBounds): Widths {
  const initial = initialWidths(bounds);

  try {
    const parsed = StoredSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));

    if (!parsed.success) return initial;

    return {
      rail: parsed.data.rail ?? initial.rail,
      list: parsed.data.list ?? initial.list,
    };
  } catch {
    return initial;
  }
}

export function saveWidths(widths: Widths): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {}
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface PaneRange {
  readonly min: number;
  readonly max: number;
}

export function rangeOf(pane: Pane, bounds: PaneBounds, room: Room, drawn: Widths): PaneRange {
  const beside = pane === "list" && room.rail ? drawn.rail : pane === "rail" ? drawn.list : 0;
  const max = Math.max(0, Math.min(bounds[pane].max, room.width - beside - bounds.readerMin));

  return { min: Math.min(bounds[pane].min, max), max };
}

export function widthOf(
  pane: Pane,
  wanted: number,
  bounds: PaneBounds,
  room: Room,
  drawn: Widths,
): number {
  const { min, max } = rangeOf(pane, bounds, room, drawn);

  return Math.round(clamp(wanted, min, max));
}

export function drawnWidths(saved: Widths, bounds: PaneBounds, room: Room): Widths {
  const rail = room.rail
    ? widthOf("rail", saved.rail, bounds, room, { rail: saved.rail, list: bounds.list.min })
    : saved.rail;

  return { rail, list: widthOf("list", saved.list, bounds, room, { rail, list: saved.list }) };
}
