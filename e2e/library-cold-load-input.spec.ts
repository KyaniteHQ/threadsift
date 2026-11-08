import { type Page, expect, test } from "@playwright/test";

import { STORAGE_KEY } from "../design/system/settings.ts";
import { ADD_LABEL, SEARCH_LABEL, SETTINGS_GEAR_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { ITEMS_READ } from "./library-visit.ts";
import { DESKTOP } from "./look.ts";
import { seedRows } from "./reader.ts";

const FONT_FILES = /\.woff2$/u;
const HELD_TITLE = "A held Item title";
const TAB_STOPS = 10;
const WHILE_HELD_MS = 2_000;

const held = expect.configure({ timeout: WHILE_HELD_MS });

let screen: FreshScreen;
let heldId = 0;

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());

  [heldId = 0] = seedRows(screen, [
    { url: "https://example.org/held", title: HELD_TITLE, author: "someone" },
    { url: "https://example.org/caching", title: "An article about caching" },
    { url: "https://example.org/queues", title: "An article about queues", read: true },
  ]);
});

test.afterAll(async () => {
  await screen.close();
});

async function visit(path: string, stored: Readonly<Record<string, string>> = {}) {
  const page = await screen.context.newPage();
  const fonts = Promise.withResolvers<void>();
  const detail = Promise.withResolvers<void>();

  await page.setViewportSize(DESKTOP);

  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(stored) },
  );

  await page.route(FONT_FILES, async (route) => {
    await fonts.promise;
    await route.continue();
  });

  await page.route(/\/api\/items\/\d+$/u, async (route) => {
    const response = await route.fetch();
    await detail.promise;
    await route.fulfill({ response });
  });

  const listed = page.waitForResponse(ITEMS_READ);
  await page.goto(path, { waitUntil: "commit" });
  await listed;

  return {
    page,
    releaseFonts: fonts.resolve,
    releaseDetail: detail.resolve,
    close: async () => {
      fonts.resolve();
      detail.resolve();
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.close();
    },
  };
}

async function announcedHeadings(page: Page): Promise<string[]> {
  const session = await page.context().newCDPSession(page);

  try {
    const { nodes } = await session.send("Accessibility.getFullAXTree");

    return nodes
      .filter((node) => !node.ignored && node.role?.value === "heading")
      .map((node) => String(node.name?.value ?? ""));
  } finally {
    await session.detach();
  }
}

function loading(page: Page) {
  return held(page.locator(".app")).toHaveAttribute("data-faces", "loading");
}

test("while the faces load, Tab skips the Add button and the gear and neither is announced", async () => {
  const { page, releaseFonts, close } = await visit("/");

  try {
    await loading(page);
    const landed: boolean[] = [];

    for (let stop = 0; stop < TAB_STOPS; stop += 1) {
      await page.keyboard.press("Tab");

      landed.push(
        await page.evaluate(
          () => document.activeElement?.matches(".st-gear, .paste-row .swap") ?? false,
        ),
      );
    }

    await loading(page);
    expect(landed, "Tab stops on the Add button or the gear").not.toContain(true);
    await held(page.getByRole("button", { name: ADD_LABEL })).toHaveCount(0);
    await held(page.getByRole("button", { name: SETTINGS_GEAR_LABEL })).toHaveCount(0);

    releaseFonts();
    await expect(page.locator(".app")).toHaveAttribute("data-faces", "loaded");

    for (const name of [ADD_LABEL, SETTINGS_GEAR_LABEL]) {
      const control = page.getByRole("button", { name });
      await control.focus();
      await expect(control).toBeFocused();
    }
  } finally {
    await close();
  }
});

test("while an Item's read is pending, its hidden head takes no focus and is not announced", async () => {
  const { page, releaseFonts, releaseDetail, close } = await visit(`/items/${heldId}`, {
    layout: "grid",
  });

  try {
    releaseFonts();
    await held(page.locator(".rd-loading")).toBeVisible();

    expect(
      await page.evaluate(() => document.activeElement?.closest(".rd-head") !== null),
      "focus is inside the hidden head",
    ).toBe(false);

    expect(await announcedHeadings(page), "headings in the accessibility tree").not.toContain(
      HELD_TITLE,
    );

    await held(page.locator(".rd-head")).toHaveAttribute("inert", "");

    releaseDetail();
    await expect(page.locator(".rd-loading")).toHaveCount(0);
    await expect(page.locator(".rd-head")).not.toHaveAttribute("inert");
    await expect(page.locator(".rd-title")).toBeFocused();
    expect(await announcedHeadings(page)).toContain(HELD_TITLE);
  } finally {
    await close();
  }
});

test("pressing / while the faces load focuses the search field and keeps what is typed", async () => {
  const { page, close } = await visit("/");

  try {
    await loading(page);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    await page.keyboard.press("/");
    await page.keyboard.type("caching");

    const search = page.getByRole("searchbox", { name: SEARCH_LABEL });
    await held(search).toBeFocused();
    await expect(search).toHaveValue("caching");
    await expect(page.locator("article.it")).toHaveCount(1);
    await expect(page.locator("article.it")).toContainText("An article about caching");
  } finally {
    await close();
  }
});
