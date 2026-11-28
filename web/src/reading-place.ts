import { z } from "zod";

import { collapsed } from "../../src/core/contract/format.ts";
import { WholeCount } from "../../src/core/contract/whole-count.ts";

const STORAGE_KEY = "threadsift:reading-places";
const ANCHORS = ".rd-head, .rd-agent, .rd-note, .md > *";
const BAR_FALLBACK_HEIGHT = 56;
const PASSAGE_LENGTH = 80;
const PLACES_MAX = 100;

const AnchorSchema = z.object({
  index: WholeCount,
  text: z.string(),
  fraction: z.number().min(0).max(1),
  offset: z.number().nonnegative(),
});

const PairsSchema = z.array(z.tuple([WholeCount, AnchorSchema]));

const EarlierPlacesSchema = z
  .union([
    PairsSchema,
    z
      .record(z.string(), AnchorSchema)
      .transform((record) =>
        Object.entries(record).map(([id, anchor]): [number, Anchor] => [Number(id), anchor]),
      )
      .pipe(PairsSchema),
  ])
  .transform((places) => ({ database: null, places }));

const PlacesSchema = z.union([
  z.object({ database: z.string().min(1), places: PairsSchema }),
  EarlierPlacesSchema,
]);

export type Anchor = z.infer<typeof AnchorSchema>;

type Place = Readonly<z.infer<typeof PairsSchema>[number]>;

export interface PlaceOwner {
  readonly database: string;
  readonly itemId: number;
}

function readPlaces(database: string): readonly Place[] {
  try {
    const stored = PlacesSchema.parse(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null"));

    return stored.database === null || stored.database === database ? stored.places : [];
  } catch {
    return [];
  }
}

function writePlaces(database: string, places: readonly Place[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ database, places }));
  } catch {}
}

export function placeOf({ database, itemId }: PlaceOwner): Anchor | null {
  return readPlaces(database).find(([id]) => id === itemId)?.[1] ?? null;
}

export function keepPlace({ database, itemId }: PlaceOwner, anchor: Readonly<Anchor> | null) {
  const others = readPlaces(database).filter(([id]) => id !== itemId);
  const kept = anchor === null ? others : [...others, [itemId, anchor] as const];

  writePlaces(database, kept.slice(-PLACES_MAX));
}

function topOf(slot: HTMLElement): number {
  const bar = slot.querySelector<HTMLElement>(".rd-bar");

  return slot.getBoundingClientRect().top + (bar?.offsetHeight ?? BAR_FALLBACK_HEIGHT);
}

function shownBottom(block: Element): number | null {
  const box = block.getBoundingClientRect();
  const foldBottom = block.closest(".cm-fold.folded")?.getBoundingClientRect().bottom;

  if (foldBottom === undefined) return box.bottom;

  return box.top < foldBottom ? Math.min(box.bottom, foldBottom) : null;
}

function passageOf(block: Element): string {
  return collapsed(block.textContent ?? "").slice(0, PASSAGE_LENGTH);
}

export function anchorAt(slot: HTMLElement): Anchor | null {
  if (slot.scrollTop === 0) return null;

  const top = topOf(slot);

  for (const [index, block] of slot.querySelectorAll(ANCHORS).entries()) {
    const box = block.getBoundingClientRect();
    const bottom = shownBottom(block);

    if (bottom !== null && bottom > top) {
      const above = box.top < top;

      return {
        index,
        text: passageOf(block),
        fraction: above && box.height > 0 ? (top - box.top) / box.height : 0,
        offset: above ? 0 : box.top - top,
      };
    }
  }

  return null;
}

export function scrollToAnchor(slot: HTMLElement, anchor: Readonly<Anchor>): boolean {
  const blocks = [...slot.querySelectorAll(ANCHORS)];
  const saved = blocks[anchor.index];

  const block =
    saved !== undefined && passageOf(saved) === anchor.text
      ? saved
      : blocks.find((each) => passageOf(each) === anchor.text);

  if (block === undefined) return false;

  const box = block.getBoundingClientRect();
  const point = box.top + anchor.fraction * box.height;
  const fold = block.closest(".cm-fold.folded")?.getBoundingClientRect();
  const target = fold !== undefined && point >= fold.bottom ? fold.top : point;
  slot.scrollTop += target - anchor.offset - topOf(slot);

  return true;
}
