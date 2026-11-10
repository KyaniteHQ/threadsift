import { type Page, expect, test } from "@playwright/test";

import { REMOVE_FAILED, REMOVE_LABEL } from "../web/src/reader-text.ts";
import { pasteOnly } from "./card.ts";
import {
  dragOver,
  keepButton,
  listEntries,
  markedText,
  marks,
  openReader,
  removeButton,
  seedThread,
} from "./highlight-reader.ts";
import { POST_PHRASE, keepThroughApi, screenForFile, thread } from "./highlight-screen.ts";
import { highlightsOf } from "./highlights.ts";
import { deferJobs } from "./ingest.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";
import { postUrl } from "./thread-fixtures.ts";

const screenOf = screenForFile();

const OTHER_PHRASE = "fallback folder is cleared";

interface Held {
  readonly release: Promise<() => Promise<void>>;
}

async function holdWrites(page: Page, itemId: number, held: Held[], state: { holding: boolean }) {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      const write = pathname === `/api/items/${itemId}/highlights`;
      const read = pathname === `/api/items/${itemId}`;

      if (!state.holding || route.request().method() === "DELETE" || !(write || read)) {
        await route.fallback();

        return;
      }

      const entry: Held = {
        release: route.fetch().then((response) => () => route.fulfill({ response })),
      };

      held.push(entry);
    },
  );
}

function pass(page: Page): Promise<number> {
  return page.evaluate(() => fetch("/api/session").then((response) => response.status));
}

async function releaseNewest(held: Held[]): Promise<void> {
  const entry = held.pop();

  if (entry !== undefined) await (await entry.release)();
}

test("a detail read that started before a Keep cannot take the Highlight off the page", async () => {
  const { page, context } = screenOf();
  const seeded = thread("r1");
  const id = await seedThread(screenOf(), seeded);
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  const held: Held[] = [];
  const state = { holding: true };

  await holdWrites(page, id, held, state);

  const restore = deferJobs(screenOf().fresh, "fetch");

  try {
    await pasteOnly(page, postUrl(seeded.id));
  } finally {
    restore();
  }

  await expect.poll(() => held.length).toBe(1);
  state.holding = false;

  await dragOver(page, body, POST_PHRASE);
  await keepButton(page).click();
  await expect.poll(() => markedText(body)).toBe(POST_PHRASE);

  await releaseNewest(held);
  await dragOver(page, body, OTHER_PHRASE);
  await keepButton(page).click();

  await expect.poll(() => markedText(body)).toBe(`${POST_PHRASE}${OTHER_PHRASE}`);
  await expect(listEntries(page)).toHaveCount(2);
  expect((await highlightsOf(context.request, id)).items).toHaveLength(2);
});

test("a Keep whose answer arrives after a later Keep and a Remove cannot bring the Highlight back", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("r2"));
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  const held: Held[] = [];
  const state = { holding: true };

  await holdWrites(page, id, held, state);

  await dragOver(page, body, POST_PHRASE);
  await keepButton(page).click();
  await dragOver(page, body, POST_PHRASE);
  await keepButton(page).click();
  await pass(page);

  await releaseNewest(held);
  await expect.poll(() => markedText(body)).toBe(POST_PHRASE);
  await marks(body).first().click();
  await removeButton(page).click();

  await expect
    .poll(async () => {
      await releaseNewest(held);

      return held.length === 0 && (await highlightsOf(context.request, id)).items.length === 0;
    })
    .toBe(true);

  state.holding = false;
  await dragOver(page, body, OTHER_PHRASE);
  await keepButton(page).click();

  await expect.poll(() => markedText(body)).toBe(OTHER_PHRASE);
  await expect(listEntries(page)).toHaveCount(1);
  expect(
    (await highlightsOf(context.request, id)).items.map(({ selector }) => selector.exact),
  ).toEqual([OTHER_PHRASE]);
});

test("removing a Highlight from the list moves focus to a neighbour, then to the Reader title, and a failed removal keeps focus on its button", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("r3"));
  await keepThroughApi(screenOf(), id, [
    ["post", POST_PHRASE],
    ["post", OTHER_PHRASE],
  ]);
  await openReader(page, id, DESKTOP.width);
  await expect(listEntries(page)).toHaveCount(2);

  await page.route(`**/api/items/${id}/highlights/*`, (route) => route.abort());
  const last = listEntries(page).last().getByRole("button", { name: REMOVE_LABEL });
  await last.focus();
  await page.keyboard.press("Enter");
  await expect(reader(page).getByRole("alert").filter({ hasText: REMOVE_FAILED })).toBeVisible();
  await expect(last).toBeFocused();
  await page.unroute(`**/api/items/${id}/highlights/*`);

  await page.keyboard.press("Enter");
  await expect(listEntries(page)).toHaveCount(1);
  await expect(listEntries(page).first().getByRole("button", { name: REMOVE_LABEL })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(listEntries(page)).toHaveCount(0);
  await expect(reader(page).locator(".rd-title")).toBeFocused();
  expect((await highlightsOf(context.request, id)).items).toEqual([]);
});
