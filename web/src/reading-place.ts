import { z } from "zod";

const STORAGE_KEY = "threadsift:reading-places";
const ANCHORS = ".rd-head, .rd-agent, .rd-note, .md > *";
const BAR_FALLBACK_HEIGHT = 56;
const PASSAGE_LENGTH = 80;

const AnchorSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string(),
  fraction: z.number().min(0).max(1),
  offset: z.number().nonnegative(),
});

const PlacesSchema = z.record(z.string(), AnchorSchema);

export type Anchor = z.infer<typeof AnchorSchema>;

type Places = z.infer<typeof PlacesSchema>;

function readPlaces(): Places {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);

    return stored === null ? {} : PlacesSchema.parse(JSON.parse(stored));
  } catch {
    return {};
  }
}

function writePlaces(places: Readonly<Places>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  } catch {}
}

export function placeOf(itemId: number): Anchor | null {
  return readPlaces()[String(itemId)] ?? null;
}

export function keepPlace(itemId: number, anchor: Readonly<Anchor> | null): void {
  const { [String(itemId)]: _dropped, ...others } = readPlaces();
  writePlaces(anchor === null ? others : { ...others, [String(itemId)]: anchor });
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
  return (block.textContent ?? "").replaceAll(/\s+/gu, " ").trim().slice(0, PASSAGE_LENGTH);
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
