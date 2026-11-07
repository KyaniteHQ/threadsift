import { expect, test } from "@playwright/test";

import { SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { filterCases } from "./filter-cases.ts";
import {
  type Library,
  answer,
  buildLibrary,
  choice,
  expectRows,
  group,
  head,
  idsOf,
  rowIds,
  tallies,
} from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, viewportAt } from "./look.ts";
import { listed } from "./search.ts";

const MEDIUM_WIDTH = 900;

let screen: FreshScreen;
let library: Library;

test.describe.configure({ mode: "serial", timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  library = await buildLibrary(screen);
});

test.afterAll(async () => {
  await screen.close();
});

test("the list API counts each group by the other filters and not its own, and refuses unknown values", async () => {
  const { request } = screen.context;

  for (const { params, ids, counts } of filterCases(library)) {
    const got = await answer(request, params);
    expect(idsOf(got.items), JSON.stringify(params)).toEqual(ids.toSorted((a, b) => a - b));
    expect(tallies(got.counts), JSON.stringify(params)).toMatchObject(counts);
  }

  const topics = (await answer(request, {})).counts.topics.map(({ key }) => key);
  expect(topics).toEqual(["reading", "writing", "tools", "notes", "archive", "misc"]);
  expect((await listed(request, { source: "bogus" })).status).toBe(400);
  expect((await listed(request, { read: "bogus" })).status).toBe(400);
  expect((await listed(request, { q: "a".repeat(201) })).status).toBe(400);
  expect((await listed(request, { q: "a".repeat(200) })).status).toBe(200);
});

test("every count in the pane equals the rows its click leaves, and a choice replaces or leaves its group", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await expectRows(page, library.everyone);
  await expect(head(page)).toHaveText("11 items, 8 unread");
  await expect(head(page)).toHaveAttribute("aria-live", "polite");

  const labels = [
    ["Source", ["Reddit", "X", "GitHub", "Article", "Other"]],
    ["Read state", ["Unread", "Read"]],
    ["Topic", ["Reading", "Writing", "Tools", "Notes", "Archive"]],
  ] as const;

  for (const [name, names] of labels) {
    for (const label of names) {
      const button = choice(page, name, label);
      const shown = Number(await button.locator(".fl-n").innerText());
      await button.click();
      await expect
        .poll(async () => (await rowIds(page)).length, { message: `${name}: ${label}` })
        .toBe(shown);
      await button.click();
      await expectRows(page, library.everyone);
    }
  }
});

test("a choice replaces the one in its group, a second click or All leaves it, and Topic opens with the five most used", async () => {
  const { page } = screen;
  const [a0 = 0, , a2 = 0] = library.articles;
  await page.setViewportSize(DESKTOP);
  await page.goto("/");

  const topicNames = group(page, "Topic").locator(".fl-row bdi");
  await expect(topicNames).toHaveText(["Reading", "Writing", "Tools", "Notes", "Archive"]);
  await page.getByRole("button", { name: "All 6 topics" }).click();
  await expect(topicNames).toHaveText(["Reading", "Writing", "Tools", "Notes", "Archive", "Misc"]);
  await page.getByRole("button", { name: "Show fewer" }).click();
  await expect(topicNames).toHaveCount(5);

  await choice(page, "Read state", "Unread").click();
  await choice(page, "Read state", "Read").click();
  await expectRows(page, [a0, a2, library.linkOnly.github]);
  await expect(choice(page, "Read state", "Unread")).toHaveAttribute("aria-pressed", "false");
  await expect(head(page)).toHaveText("3 of 11 items");

  await choice(page, "Read state", "Read").click();
  await expectRows(page, library.everyone);

  await choice(page, "Source", "Article").click();
  await choice(page, "Read state", "Unread").click();
  await expectRows(
    page,
    library.articles.filter((id) => id !== a0 && id !== a2),
  );
  await group(page, "Source").getByRole("button", { name: /^All/u }).click();
  await expect(head(page)).toHaveText("8 of 11 items");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expectRows(page, library.everyone);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
  await expect(head(page)).toHaveText("11 items, 8 unread");
});

test("Topic and Tags combine with each other and with the search, and the search hides the rows with no match", async () => {
  const { page } = screen;
  const [a0 = 0, a1 = 0, a2 = 0, , , a5 = 0] = library.articles;
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await page.getByRole("button", { name: "Tags", exact: true }).click();

  await choice(page, "Topic", "Reading").click();
  await choice(page, "Tags", "Essays").click();
  await expectRows(page, [a0, a1]);
  await choice(page, "Tags", "Craft").click();
  await expectRows(page, [a0]);
  await expect(head(page)).toHaveText("1 of 11 items");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("searchbox", { name: SEARCH_LABEL }).fill("craft");
  await expectRows(page, [a0, a2, a5]);
  await expect(head(page)).toHaveText("3 of 11 items matching “craft”");
  await expect(group(page, "Topic").locator(".fl-row bdi")).toHaveText([
    "Reading",
    "Writing",
    "Archive",
  ]);
});

test("the pane and the search field work from the keyboard, keep focus, and fold behind a Filters button on a narrow screen", async () => {
  const { page } = screen;
  await page.setViewportSize(DESKTOP);
  await page.goto("/");

  const field = page.getByRole("searchbox", { name: SEARCH_LABEL });
  await field.click();
  await page.keyboard.type("linkonly");
  await expectRows(page, Object.values(library.linkOnly));
  await expect(field).toBeFocused();
  await field.clear();
  await expectRows(page, library.everyone);

  const article = choice(page, "Source", "Article");
  await article.focus();
  await page.keyboard.press("Space");
  await expect(article).toHaveAttribute("aria-pressed", "true");
  await expect(article).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(article).toHaveAttribute("aria-pressed", "false");
  await expect(article).toBeFocused();

  await viewportAt(page, MEDIUM_WIDTH);
  const toggle = page.getByRole("button", { name: "Filters", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(group(page, "Source")).toHaveCount(0);
  await toggle.click();
  await choice(page, "Source", "Article").click();
  await expect(page.getByRole("button", { name: "Filters · 1" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expectRows(page, library.articles);
});
