import { z } from "zod";

const STORAGE_KEY = "threadsift:reading-places";
const ANCHORS = ".rd-head, .rd-agent, .rd-note, .md > *";
const BAR_FALLBACK_HEIGHT = 56;

const AnchorSchema = z.object({
  index: z.number().int().nonnegative(),
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

function clipBox(block: Element): Element | null {
  const fold = block.closest(".cm-fold.folded");

  const clipped =
    fold !== null && block.getBoundingClientRect().top >= fold.getBoundingClientRect().bottom;

  return clipped ? fold : null;
}

export function anchorAt(slot: HTMLElement): Anchor | null {
  if (slot.scrollTop === 0) return null;

  const top = topOf(slot);

  for (const [index, block] of slot.querySelectorAll(ANCHORS).entries()) {
    const box = block.getBoundingClientRect();

    if (box.bottom > top && clipBox(block) === null) {
      const above = box.top < top;

      return {
        index,
        fraction: above && box.height > 0 ? (top - box.top) / box.height : 0,
        offset: above ? 0 : box.top - top,
      };
    }
  }

  return null;
}

export function scrollToAnchor(slot: HTMLElement, anchor: Readonly<Anchor>): boolean {
  const block = slot.querySelectorAll(ANCHORS)[anchor.index];

  if (block === undefined) return false;

  const clip = clipBox(block);
  const box = (clip ?? block).getBoundingClientRect();
  const fraction = clip === null ? anchor.fraction : 0;
  slot.scrollTop += box.top + fraction * box.height - anchor.offset - topOf(slot);

  return true;
}
