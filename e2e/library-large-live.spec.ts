import { expect, test } from "@playwright/test";

import { LOAD_MORE, RETRY_LABEL } from "../web/src/text.ts";
import { ADDED, cardTitle } from "./card.ts";
import { ask, confirmButton } from "./deletion-ui.ts";
import { choice, holdRead, rowsInOrder } from "./filters.ts";
import {
  PAGE_SIZE,
  idsWhere,
  isCursorRead,
  largeLibrary,
  openLibrary,
  results,
  scrollUntil,
  storedLink,
  watchCursorReads,
} from "./library-large.ts";
import { pasteCard, pasteField } from "./links.ts";
import { afterTwoFrames } from "./look.ts";
import { expectRowInPaneView, row } from "./reader.ts";

const library = largeLibrary();

const FAR_POSITION = 1999;

test("a Read state change, a delete and a Paste deep in a loaded list change the rows and the counts without a reload, and keep the rows already loaded", async () => {
  const { screen } = library();
  const { page } = screen;
  await openLibrary(page, "list");

  await page.evaluate(() => {
    document.documentElement.dataset["kept"] = "yes";
  });

  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
  await scrollUntil(page, 3 * PAGE_SIZE);

  const loaded = await rowsInOrder(page);
  const unread = new Set(idsWhere(screen, "read_state = 'unread'"));
  const [marked = 0, doomed = 0] = loaded.slice(2 * PAGE_SIZE).filter((id) => unread.has(id));

  await row(page, marked).locator("a.it-open").focus();
  await page.keyboard.press("m");
  await expect(results(page)).toHaveText("3000 items, 2249 unread");
  await expect(choice(page, "Read state", "Read")).toContainText("751");

  await row(page, doomed).locator("a.it-open").click();
  await ask(page);
  await confirmButton(page).click();
  await expect(row(page, doomed)).toHaveCount(0);
  await expect(results(page)).toHaveText("2999 items, 2248 unread");

  await pasteField(page).fill(`https://example.com/large-library-paste-${Date.now()}`);
  await pasteField(page).press("Enter");
  await expect(results(page)).toHaveText("3000 items, 2249 unread");

  const after = await rowsInOrder(page);
  expect(after.slice(1, loaded.length)).toEqual(loaded.filter((id) => id !== doomed));
  expect(await page.evaluate(() => document.documentElement.dataset["kept"])).toBe("yes");
});

for (const layout of ["list", "grid"] as const) {
  test(`${layout}: a Paste of a link the library already holds, whose row is far past the first page, shows its row in view, changes no count and leaves every Item once to the end`, async () => {
    const { screen } = library();
    const { page } = screen;
    const everyId = idsWhere(screen, "1 = 1");
    await openLibrary(page, layout);
    await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);

    const head = await results(page).innerText();
    const far = everyId[FAR_POSITION] ?? 0;

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/items" && response.request().method() === "POST",
    );

    await pasteField(page).fill(storedLink(screen, far));
    await pasteField(page).press("Enter");
    expect((await saved).status()).toBe(200);

    await expect(row(page, far)).toBeVisible({ timeout: 60_000 });
    await expectRowInPaneView(page, far);
    await expect(results(page)).toHaveText(head);

    await scrollUntil(page, everyId.length);
    expect(await rowsInOrder(page)).toEqual(everyId);
    await expect(results(page)).toHaveText(head);
  });

  test(`${layout}: a share of a link the library already holds, whose row is far past the first page, shows its card and its row in view`, async () => {
    const { screen } = library();
    const { page } = screen;
    const far = idsWhere(screen, "1 = 1")[FAR_POSITION] ?? 0;
    await openLibrary(page, layout);

    await page.goto(`/?saved=${far}`);
    await pasteCard(page).hover();
    await expect(cardTitle(page)).toHaveText(ADDED);
    await expect(row(page, far)).toBeVisible({ timeout: 60_000 });
    await expectRowInPaneView(page, far);
  });
}

test("opening another Item while a seek reads pages ends the seek: no further page is read and the old row is never revealed", async () => {
  const { screen } = library();
  const { page } = screen;
  const everyId = idsWhere(screen, "1 = 1");
  const far = everyId[FAR_POSITION] ?? 0;
  const opened = everyId[3] ?? 0;
  const held = await holdRead(page, isCursorRead);

  try {
    await openLibrary(page, "list");
    await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
    const cursorReads = watchCursorReads(page);

    await pasteField(page).fill(storedLink(screen, far));
    await pasteField(page).press("Enter");
    await held.reached;

    await row(page, opened).locator("a.it-open").click();
    await expect(page).toHaveURL(new RegExp(`/items/${opened}$`, "u"));
    held.release();
    await held.delivered;

    await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);
    await afterTwoFrames(page);
    expect(cursorReads()).toBe(1);
    await expect(row(page, far)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/items/${opened}$`, "u"));
  } finally {
    held.release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("a failed page read ends a seek: no further page is read until Load more or Try again reads one", async () => {
  const { screen } = library();
  const { page } = screen;
  const far = idsWhere(screen, "1 = 1")[FAR_POSITION] ?? 0;

  try {
    await page.route(isCursorRead, (route) => route.fulfill({ status: 500, body: "{}" }));

    await openLibrary(page, "list");
    await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
    const cursorReads = watchCursorReads(page);

    await pasteField(page).fill(storedLink(screen, far));
    await pasteField(page).press("Enter");
    await expect.poll(cursorReads).toBe(1);

    const more = page.getByRole("button", {
      name: new RegExp(`^(${LOAD_MORE}|${RETRY_LABEL})$`, "u"),
    });

    await expect(more).toBeVisible();
    await afterTwoFrames(page);
    expect(cursorReads()).toBe(1);
    await expect(row(page, far)).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await more.click();
    await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);
    await afterTwoFrames(page);
    expect(cursorReads()).toBe(2);
    await expect(row(page, far)).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("a Paste of a new link while a seek reads pages ends the seek: no further page is read, the new row shows at the top and the old row is never revealed", async () => {
  const { screen } = library();
  const { page } = screen;
  const far = idsWhere(screen, "1 = 1")[FAR_POSITION] ?? 0;
  const held = await holdRead(page, isCursorRead);

  try {
    await openLibrary(page, "list");
    await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
    const head = await results(page).innerText();
    const cursorReads = watchCursorReads(page);

    await pasteField(page).fill(storedLink(screen, far));
    await pasteField(page).press("Enter");
    await held.reached;

    await pasteField(page).fill(`https://example.com/large-library-later-${Date.now()}`);
    await pasteField(page).press("Enter");
    await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE + 1);
    await expect(results(page)).not.toHaveText(head);
    held.release();
    await held.delivered;

    await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE + 1);
    await afterTwoFrames(page);
    expect(cursorReads()).toBe(1);
    await expect(row(page, far)).toHaveCount(0);

    const [newest = 0] = await rowsInOrder(page);
    await expectRowInPaneView(page, newest);
  } finally {
    held.release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
