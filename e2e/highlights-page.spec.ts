import { expect, test } from "@playwright/test";

import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { CLEAR_ALL, CLEAR_FILTERS, FILTER_GROUPS } from "../web/src/text.ts";
import { screenForFile } from "./highlight-screen.ts";
import { type Library, WORDS, buildLibrary, keepNote } from "./highlights-page-seed.ts";
import {
  HIGHLIGHTS_URL,
  entries,
  links,
  openPage,
  results,
  searchBox,
  textsOnPage,
} from "./highlights-page-ui.ts";
import { putPost } from "./highlights.ts";
import { DESKTOP, app, openPanel } from "./look.ts";
import { marker, run } from "./thread-fixtures.ts";

const screenOf = screenForFile();

let library: Library;

test.beforeAll(async () => {
  library = await buildLibrary(screenOf());
});

function newestFirst(...at: readonly number[]): (string | undefined)[] {
  return at.map((index) => library.entries[index]?.text);
}

test("the Highlights link in the masthead's settings panel opens the page, which lists every Highlight and Note newest first with its Item's Source and title, and Back returns to the library", async () => {
  const { page } = screenOf();
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await expect(app(page)).toBeVisible();

  const dialog = await openPanel(page);
  await dialog.getByRole("link", { name: HIGHLIGHTS_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(HIGHLIGHTS_URL);
  await expect(page).toHaveTitle("Highlights, Threadsift");
  await expect(page.getByRole("heading", { level: 1, name: HIGHLIGHTS_PAGE.title })).toBeFocused();
  await expect(entries(page)).toHaveCount(6);
  await expect(results(page)).toHaveText("6 highlights and notes");
  expect(await textsOnPage(page)).toEqual(newestFirst(5, 4, 3, 2, 1, 0));

  expect(await links(page).allTextContents()).toEqual([
    "Plain article",
    "Essay craft",
    "Notebook cache guide",
    "Plain article",
    "Essay craft",
    "Notebook cache guide",
  ]);

  expect(
    await entries(page).evaluateAll((rows) =>
      rows.map((row) => (row instanceof HTMLElement ? row.dataset["kind"] : undefined)),
    ),
  ).toEqual(["note", "highlight", "note", "highlight", "highlight", "highlight"]);

  await page.getByRole("link", { name: HIGHLIGHTS_PAGE.back }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("article.it")).toHaveCount(3);
});

test("a word finds only the entries that hold it, the heading says how many matched, and Clear search and filters brings everything back", async () => {
  const { page } = screenOf();
  await openPage(page, DESKTOP.width);

  await searchBox(page).fill(WORDS.desk);
  await expect(results(page)).toHaveText(`1 of 6 highlights and notes matching “${WORDS.desk}”`);
  await expect.poll(() => textsOnPage(page)).toEqual(newestFirst(0));

  await searchBox(page).fill(WORDS.wide);
  await expect.poll(() => textsOnPage(page)).toEqual(newestFirst(5));

  await searchBox(page).fill("nothing holds this");
  await expect(entries(page)).toHaveCount(0);
  await expect(page.getByText(HIGHLIGHTS_PAGE.noResults)).toBeVisible();

  await page.getByRole("button", { name: CLEAR_ALL }).click();
  await expect(entries(page)).toHaveCount(6);
  await expect(searchBox(page)).toBeFocused();
  await expect(searchBox(page)).toHaveValue("");
});

test("Source, Topic and Tag narrow the entries and the counts follow the other choices", async () => {
  const { page } = screenOf();
  await openPage(page, DESKTOP.width);

  const sources = page.getByRole("group", { name: FILTER_GROUPS.source, exact: true });
  await sources.getByRole("button", { name: /^Article\s*2/u }).click();
  await expect(results(page)).toHaveText("2 of 6 highlights and notes");
  await expect.poll(() => textsOnPage(page)).toEqual(newestFirst(5, 2));

  await page.getByRole("button", { name: CLEAR_FILTERS }).click();
  await expect(entries(page)).toHaveCount(6);

  const topic = page.getByRole("combobox", { name: new RegExp(`^${FILTER_GROUPS.topic}`, "u") });
  const tag = page.getByRole("combobox", { name: new RegExp(`^${FILTER_GROUPS.tag}`, "u") });

  await topic.selectOption("writing");
  await expect.poll(() => textsOnPage(page)).toEqual(newestFirst(4, 1));

  await tag.selectOption("craft");
  await expect.poll(() => textsOnPage(page)).toEqual(newestFirst(4, 1));
  await expect(sources.getByRole("button", { name: /^Reddit\s*2/u })).toBeVisible();
  await expect(sources.getByRole("button", { name: /^Article\s*0/u })).toBeVisible();

  await topic.selectOption("");
  await expect.poll(() => textsOnPage(page)).toEqual(newestFirst(5, 4, 2, 1));
});

test("j and k move between the entries, the slash key focuses the search box, and Escape returns to the first entry", async () => {
  const { page } = screenOf();
  await openPage(page, DESKTOP.width);
  await expect(entries(page)).toHaveCount(6);

  await page.keyboard.press("j");
  await expect(links(page).nth(0)).toBeFocused();
  await page.keyboard.press("j");
  await expect(links(page).nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(links(page).nth(0)).toBeFocused();

  await page.keyboard.press("/");
  await expect(searchBox(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(links(page).nth(0)).toBeFocused();
});

test("a Note is listed as the plain text it was saved as, with its Markdown, HTML-like text and line breaks left alone", async () => {
  const { page } = screenOf();
  const word = marker("plainnote");

  const body = [
    `${word} **not bold** and [not a link](https://example.com/x) with _no_ emphasis`,
    "<b>not bold</b> & <img src=x onerror=alert(1)> &amp; `no code`",
    "",
    "# not a heading",
    "- not a list",
  ].join("\n");

  const itemId = await putPost(screenOf().context.request, `pl${run}`, "A post for a plain Note.");
  await keepNote(screenOf(), itemId, body, 1_700_000_100_000);

  await openPage(page, DESKTOP.width);
  await searchBox(page).fill(word);
  await expect(entries(page)).toHaveCount(1);

  const text = entries(page).locator(".hp-text");

  await expect(text).toHaveText(body);
  expect(
    await text.evaluate((element) => (element instanceof HTMLElement ? element.innerText : "")),
  ).toBe(body);
  await expect(text.locator("*")).toHaveCount(0);
  await expect(entries(page).locator("a:not(.hp-open)")).toHaveCount(0);
  await expect(entries(page).locator("img")).toHaveCount(0);
});
