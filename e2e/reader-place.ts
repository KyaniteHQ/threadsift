import { type Page, expect } from "@playwright/test";
import { z } from "zod";

import { openRow, slot } from "./reader.ts";

export function topBlock(page: Page): Promise<string> {
  return slot(page).evaluate((element) => {
    const barBottom = element.querySelector(".rd-bar")?.getBoundingClientRect().bottom ?? 0;
    const blocks = [...element.querySelectorAll(".md > *")];

    return (
      blocks.find((block) => {
        const fold = block.closest(".cm-fold.folded");
        const box = block.getBoundingClientRect();
        const foldBottom = fold?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;

        return box.top < foldBottom && Math.min(box.bottom, foldBottom) > barBottom;
      })?.textContent ?? ""
    );
  });
}

export const PlaceSchema = z.object({
  index: z.number(),
  text: z.string(),
  fraction: z.number(),
  offset: z.number(),
});

export const PlacesSchema = z.record(z.string(), PlaceSchema);

export const PLACES_KEY = "threadsift:reading-places";
const ANCHORS = ".rd-head, .rd-agent, .rd-note, .md > *";
const PASSAGE_LENGTH = 80;

export async function savedPlaces(page: Page): Promise<z.infer<typeof PlacesSchema>> {
  const stored = await page.evaluate((key) => sessionStorage.getItem(key), PLACES_KEY);

  return stored === null ? {} : PlacesSchema.parse(JSON.parse(stored));
}

export async function savedBlock(page: Page, id: number): Promise<string> {
  const index = (await savedPlaces(page))[String(id)]?.index;

  if (index === undefined) return "";

  return slot(page).evaluate(
    (element, args) => element.querySelectorAll(args.anchors)[args.at]?.textContent ?? "",
    { anchors: ANCHORS, at: index },
  );
}

export async function storePlace(page: Page, id: number, place: z.infer<typeof PlaceSchema>) {
  const value = JSON.stringify({ ...(await savedPlaces(page)), [String(id)]: place });

  await page.evaluate(
    (args) => {
      sessionStorage.setItem(args.key, args.value);
    },
    { key: PLACES_KEY, value },
  );
}

export function blockText(page: Page, index: number): Promise<string> {
  return slot(page).evaluate(
    (element, args) =>
      (element.querySelectorAll(args.anchors)[args.at]?.textContent ?? "")
        .replaceAll(/\s+/gu, " ")
        .trim()
        .slice(0, args.length),
    { anchors: ANCHORS, at: index, length: PASSAGE_LENGTH },
  );
}

export function blockTop(page: Page, index: number): Promise<number> {
  return slot(page).evaluate(
    (element, args) =>
      (element.querySelectorAll(args.anchors)[args.at]?.getBoundingClientRect().top ?? 0) -
      element.getBoundingClientRect().top +
      element.scrollTop,
    { anchors: ANCHORS, at: index },
  );
}

export async function scrollAndSettle(page: Page, id: number, share: number): Promise<string> {
  await slot(page).evaluate((element, fraction) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction;
  }, share);

  const block = await topBlock(page);
  expect(block, "the block at the top after scrolling").not.toBe("");
  await expect.poll(() => savedBlock(page, id), { message: "the saved reading place" }).toBe(block);

  return block;
}

export function scrollOf(page: Page): Promise<number> {
  return slot(page).evaluate((element) => element.scrollTop);
}

export async function sharePlace(page: Page, first: number, tall: number): Promise<number> {
  await openRow(page, first);
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");
  await scrollAndSettle(page, first, 0.5);
  const place = (await savedPlaces(page))[String(first)];
  expect(place, "the saved place of the first Item").toBeDefined();
  const index = place?.index ?? 0;
  const atFirst = await scrollOf(page);
  const firstTop = await blockTop(page, index);

  await openRow(page, tall);
  await expect(page.locator(".md")).toContainText("Tall paragraph 40");
  const tallTop = await blockTop(page, index);
  const tallText = await blockText(page, index);

  await openRow(page, first);
  await expect(page.locator(".md")).toContainText("Item 1 paragraph 40");

  await storePlace(page, tall, {
    index,
    text: tallText,
    fraction: place?.fraction ?? 0,
    offset: (place?.offset ?? 0) + tallTop - firstTop,
  });

  return atFirst;
}

export async function leaveFirstForTallAsSoonAsItIsShown(page: Page, tall: number) {
  await page.addInitScript((tallId) => {
    document.addEventListener("DOMContentLoaded", () => {
      const watch = new MutationObserver(() => {
        if (document.querySelector(".md")?.textContent?.includes("Item 1 paragraph 40") === true) {
          watch.disconnect();
          document
            .querySelector<HTMLElement>(`article.it[data-key="${tallId}"] a.it-open`)
            ?.click();
        }
      });

      watch.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
  }, tall);
}
