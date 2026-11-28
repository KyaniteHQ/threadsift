import { type Page, expect, test } from "@playwright/test";

import { setUp } from "./access-flow.ts";
import { type Move, grewOrRanBack, watchMoves } from "./motion-watch.ts";
import { savedItem } from "./saved-item.ts";

const ROUNDS = 8;

const BACK_ROUNDS = 4;

const PLACES = [
  { name: "Grid, Sheet", layout: "grid", openAs: "sheet", width: 1280, height: 900 },
  { name: "Grid, Page", layout: "grid", openAs: "page", width: 1280, height: 900 },
  { name: "List under 760 px", layout: "list", openAs: "page", width: 390, height: 844 },
] as const;

type Place = (typeof PLACES)[number];

interface Watch {
  readonly page: Page;
  readonly forget: () => Promise<void>;
  readonly settled: () => Promise<Move | undefined>;
}

interface Tally {
  readonly rounds: number;
  readonly grow: number;
  readonly runBack: number;
}

const PARAGRAPH = "A paragraph of synthetic text for the Reader to show.";

function itemInput(index: number) {
  const title = `Motion Item ${String(index)}`;

  return {
    url: `https://example.com/motion/${String(index)}`,
    page: { markdown: Array.from({ length: 20 }, () => PARAGRAPH).join("\n\n"), title },
    digest: {
      title,
      topic: "Motion",
      tags: ["motion"],
      summary: `Summary of ${title}`,
      keyPoints: ["One point"],
    },
  };
}

async function seed(page: Page): Promise<readonly number[]> {
  const ids: number[] = [];

  for (let index = 1; index <= ROUNDS; index += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Items save in order, so the newest is first in the list.
    ids.push(await savedItem(page.request, itemInput(index)));
  }

  return ids;
}

async function finishedMove(watch: Watch, readers: number): Promise<Move | undefined> {
  await expect(watch.page.locator(".reader-slot")).toHaveCount(readers);

  return watch.settled();
}

async function placeAt(page: Page, place: Place): Promise<void> {
  await page.setViewportSize({ width: place.width, height: place.height });
  await page.evaluate(
    (settings) => {
      localStorage.setItem("threadsift.settings", JSON.stringify(settings));
    },
    { layout: place.layout, openAs: place.openAs },
  );
  await page.goto("/");
  await page.locator(".it[data-key]").first().waitFor();
}

async function openAndClose(watch: Watch, id: number, close: () => Promise<void>) {
  await watch.forget();
  await watch.page.locator(`.it[data-key="${String(id)}"] .it-open`).click();
  const grows = grewOrRanBack(await finishedMove(watch, 1));
  await watch.forget();
  await close();
  const runsBack = grewOrRanBack(await finishedMove(watch, 0));

  return { grows, runsBack };
}

async function countMoves(
  watch: Watch,
  ids: readonly number[],
  close: () => Promise<void>,
): Promise<Tally> {
  let grow = 0;
  let runBack = 0;

  for (const id of ids) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each open and close finishes before the next starts.
    const { grows, runsBack } = await openAndClose(watch, id, close);
    grow += grows ? 1 : 0;
    runBack += runsBack ? 1 : 0;
  }

  return { rounds: ids.length, grow, runBack };
}

async function startedUnderReducedMotion(watch: Watch, id: number): Promise<number> {
  const { page } = watch;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await watch.forget();
  await page.locator(`.it[data-key="${String(id)}"] .it-open`).click();
  await page.locator(".reader-slot").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader-slot")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  return (await watch.settled()) === undefined ? 0 : 1;
}

async function measure(watch: Watch, ids: readonly number[], place: Place) {
  const { page } = watch;
  await placeAt(page, place);
  const escape = await countMoves(watch, ids, async () => {
    await page.keyboard.press("Escape");
  });
  const back = await countMoves(watch, ids.slice(0, BACK_ROUNDS), async () => {
    await page.goBack();
  });
  const reducedMotion = await startedUnderReducedMotion(watch, ids[0] ?? 0);

  return { escape, back, reducedMotion };
}

test("the Reader grows from its card and runs back into it", async ({ page }) => {
  await setUp(page);
  const ids = await seed(page);
  const watch = { page, ...(await watchMoves(page)) };

  for (const place of PLACES) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- The places share one page, one after the other.
    const result = await measure(watch, ids, place);
    console.log(`${place.name}: ${JSON.stringify(result)}`);
    expect.soft(result).toEqual({
      escape: { rounds: ROUNDS, grow: ROUNDS, runBack: ROUNDS },
      back: { rounds: BACK_ROUNDS, grow: BACK_ROUNDS, runBack: BACK_ROUNDS },
      reducedMotion: 0,
    });
  }
});
