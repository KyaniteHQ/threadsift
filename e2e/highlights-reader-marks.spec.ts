import { type Locator, type Page, expect, test } from "@playwright/test";

import { SELECT_FAILED } from "../web/src/reader-text.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import {
  dragOver,
  keepButton,
  markedText,
  marks,
  openReader,
  popover,
  removeButton,
  seedThread,
} from "./highlight-reader.ts";
import { POST_PHRASE, keepThroughApi, screenForFile, thread } from "./highlight-screen.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

const LINKED =
  "Read the [saved page](https://example.com/saved) first, then [jump ahead](#later) and go on.";

function popups(page: Page): Page[] {
  const opened: Page[] = [];

  page.context().on("page", (next) => {
    opened.push(next);
  });

  return opened;
}

async function followedByModifiedClick(page: Page, mark: Locator): Promise<boolean> {
  const followed = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        window.addEventListener(
          "click",
          (event) => {
            resolve(!event.defaultPrevented);
          },
          { once: true },
        );
      }),
  );

  await mark.click({ modifiers: ["ControlOrMeta"] });

  return followed;
}

test("clicking a mark inside a link opens Remove and leaves the link alone, and a modified click or the keyboard still follows it", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("m1", LINKED));
  await context.route("https://example.com/**", (route) => route.fulfill({ body: "saved" }));
  await keepThroughApi(screenOf(), id, [
    ["post", "saved page"],
    ["post", "jump ahead"],
  ]);
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();
  const opened = popups(page);

  await marks(body).first().click();
  await expect(removeButton(page)).toBeVisible();
  expect(opened).toHaveLength(0);

  await page.keyboard.press("Escape");
  await expect(popover(page)).toBeHidden();
  await marks(body).last().click();
  await expect(removeButton(page)).toBeVisible();
  expect(page.url()).toMatch(new RegExp(`/items/${id}$`, "u"));

  await page.keyboard.press("Escape");

  expect(await followedByModifiedClick(page, marks(body).first())).toBe(true);
  await expect(popover(page)).toBeHidden();

  const byKeyboard = context.waitForEvent("page");
  await body.getByRole("link", { name: "saved page" }).focus();
  await page.keyboard.press("Enter");
  await (await byKeyboard).close();
  await expect(popover(page)).toBeHidden();
  expect((await highlightsOf(context.request, id)).items).toHaveLength(2);
});

test("a selection chunk that fails to load says so, and Try again loads it so the passage can be kept", async () => {
  const { page, context } = screenOf();
  const id = await seedThread(screenOf(), thread("m2"));
  await openReader(page, id, DESKTOP.width);
  const body = reader(page).locator(".md").first();

  await page.route("**/assets/highlight-draft-*.js", (route) => route.abort("failed"));
  await dragOver(page, body, POST_PHRASE);

  const alert = reader(page).getByRole("alert").filter({ hasText: SELECT_FAILED });

  await expect(alert).toBeVisible();
  await expect(popover(page)).toBeHidden();
  await page.unroute("**/assets/highlight-draft-*.js");
  await alert.getByRole("button", { name: RETRY_LABEL, exact: true }).click();

  await expect(reader(page).locator(".md").first()).toBeVisible();
  await dragOver(page, reader(page).locator(".md").first(), POST_PHRASE);
  await keepButton(page).click();
  await expect.poll(() => markedText(reader(page).locator(".md").first())).toBe(POST_PHRASE);
  expect((await highlightsOf(context.request, id)).items).toHaveLength(1);
});
