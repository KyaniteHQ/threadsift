import { type Page, expect, test } from "@playwright/test";
import { z } from "zod";

import { MARKED_UNREAD } from "../web/src/reader-text.ts";
import { SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { choice, expectRows, holdRead } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, afterTwoFrames } from "./look.ts";
import { openLibrary, openRow, readStateOf, row, seedRows } from "./reader.ts";

const Body = z.object({ readState: z.string() });

let screen: FreshScreen;
let ids: readonly number[];

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  ids = seedRows(screen, [
    { url: "https://example.com/one", title: "Rain on the roof" },
    { url: "https://example.com/two", title: "Wind in the chimney" },
    { url: "https://example.com/three", title: "Snow on the sill", read: true },
    { url: "https://example.com/four", title: "Fog over the fields" },
  ]);
});

test.afterEach(async () => {
  await screen.close();
});

async function holdWrite(page: Page) {
  const gate = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();

  await page.route(/\/api\/items\/\d+\/read-state$/u, async (route) => {
    const response = await route.fetch();
    reached.resolve();
    await gate.promise;
    await route.fulfill({ response });
  });

  return {
    reached: reached.promise,
    release: () => {
      gate.resolve();
    },
  };
}

function firstOnly(wanted: (url: URL) => boolean): (url: URL) => boolean {
  let taken = false;

  return (url) => {
    if (taken || !wanted(url)) return false;

    taken = true;

    return true;
  };
}

test("a list answer that started before a Read state write never brings the old state or the old counts back", async () => {
  const { page } = screen;
  const [first = 0, second = 0, , fourth = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", 4);
  await openRow(page, first);

  const older = await holdRead(
    page,
    firstOnly((url) => url.searchParams.get("read") === "unread"),
  );

  await choice(page, "Read state", "Unread").click();
  await older.reached;

  await page.keyboard.press("m");
  await expect(row(page, first)).not.toHaveClass(/\bunread\b/u);
  await expect(choice(page, "Read state", "Unread")).toContainText("2");

  older.release();
  await older.delivered;
  await afterTwoFrames(page);

  await expectRows(page, [first, second, fourth]);
  await expect(row(page, first)).not.toHaveClass(/\bunread\b/u);
  await expect(choice(page, "Read state", "Unread")).toContainText("2");
  await expect(choice(page, "Read state", "Read")).toContainText("2");
  expect(await readStateOf(page, first)).toBe("read");
});

test("a Read state write that finishes after the filters changed counts for the filters now shown", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", 4);
  await openRow(page, first);
  await choice(page, "Read state", "Unread").click();
  const write = await holdWrite(page);

  await page.keyboard.press("m");
  await write.reached;

  await page.getByRole("searchbox", { name: SEARCH_LABEL }).fill("Rain");
  await expectRows(page, []);
  await expect(choice(page, "Read state", "Read")).toContainText("1");

  const recounted = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && new URL(response.url()).pathname === "/api/items",
  );

  write.release();
  const answer = await recounted;
  expect(new URL(answer.url()).searchParams.get("q"), "the filters of the counts read").toBe(
    "Rain",
  );
  await afterTwoFrames(page);

  await expect(choice(page, "Read state", "Read")).toContainText("1");
  await expect(choice(page, "Read state", "Unread")).toContainText("0");
  expect(await readStateOf(page, first)).toBe("read");
});

test("two presses of m before the first answer reach the server one after another and end on the second press", async () => {
  const { page } = screen;
  const [first = 0] = ids;
  await openLibrary(page, DESKTOP.width, "/", 4);
  await openRow(page, first);

  const sent: string[] = [];
  const gate = Promise.withResolvers<void>();

  await page.route(/\/api\/items\/\d+\/read-state$/u, async (route) => {
    sent.push(Body.parse(route.request().postDataJSON()).readState);

    if (sent.length === 1) await gate.promise;

    await route.continue();
  });

  await page.keyboard.press("m");
  await expect.poll(() => sent.length).toBe(1);
  await page.keyboard.press("m");
  await afterTwoFrames(page);
  expect(sent, "the second write waits for the first answer").toEqual(["read"]);

  gate.resolve();
  await expect.poll(() => sent).toEqual(["read", "unread"]);
  await expect(page.getByRole("status").filter({ hasText: MARKED_UNREAD })).toBeAttached();
  await expect(row(page, first)).toHaveClass(/\bunread\b/u);
  expect(await readStateOf(page, first)).toBe("unread");
});
