import { type Page, expect, test } from "@playwright/test";

import { NOT_FOUND } from "../web/src/reader-text.ts";
import { listEntries, marks, seedThread } from "./highlight-reader.ts";
import {
  POST_PHRASE,
  POST_TEXT,
  keepThroughApi,
  screenForFile,
  thread,
} from "./highlight-screen.ts";
import { entries, openPage } from "./highlights-page-ui.ts";
import { highlightsOf } from "./highlights.ts";
import { DESKTOP, type Stored, viewportAt } from "./look.ts";
import { noteField } from "./note-reader.ts";
import { saved } from "./notes.ts";
import { reader } from "./reader.ts";

const screenOf = screenForFile();

const PLACES: readonly (readonly [string, number, Stored])[] = [
  ["the List pane", DESKTOP.width, {}],
  ["a Grid sheet", DESKTOP.width, { layout: "grid", openAs: "sheet" }],
  ["a Grid page on a phone", 390, { layout: "grid", openAs: "page" }],
];

const FOLDED_QUOTE = "tmpfs fixed it";

const CODE_QUOTE = "echo step 28";

const REMOVED_QUOTE = "fallback folder is cleared on reboot";

const NOTE_TEXT = "Remember to try the tmpfs path.";

function entryFor(page: Page, tag: string, text: string) {
  return entries(page)
    .filter({ hasText: `Highlights in the Reader ${thread(tag).id}` })
    .filter({ hasText: text })
    .locator("a.hp-open");
}

for (const [where, width, stored] of PLACES) {
  test(`in ${where}, an entry opens the Reader at its Highlight with the folded comment or code block open and the mark focused, and a Note entry focuses the Note box`, async () => {
    const { page, context } = screenOf();
    const tag = `ar${width}${Object.values(stored).join("")}`;
    const id = await seedThread(screenOf(), thread(tag));

    await keepThroughApi(screenOf(), id, [
      ["t1_c1", FOLDED_QUOTE],
      ["t1_c3", CODE_QUOTE],
      ["post", POST_PHRASE],
    ]);

    await saved(context.request, id, NOTE_TEXT, 0);

    const ids = new Map(
      (await highlightsOf(context.request, id)).items.map(({ id: at, selector }) => [
        selector.exact,
        at,
      ]),
    );

    await openPage(page, width, stored);
    await expect(entryFor(page, tag, FOLDED_QUOTE)).toHaveCount(1);

    await entryFor(page, tag, FOLDED_QUOTE).click();
    await expect(page).toHaveURL(`/items/${id}?highlight=${ids.get(FOLDED_QUOTE)}`);
    const folded = reader(page).locator(".cm-fold").first();
    await expect(folded).not.toHaveClass(/folded/u);
    await expect(marks(folded)).toBeFocused();
    await expect(marks(folded)).toBeInViewport();

    await page.goBack();
    await expect(page).toHaveURL("/highlights");
    await entryFor(page, tag, CODE_QUOTE).click();
    await expect(page).toHaveURL(`/items/${id}?highlight=${ids.get(CODE_QUOTE)}`);
    const code = reader(page).locator(".code");
    await expect(code).not.toHaveClass(/folded/u);
    await expect(marks(code)).toBeFocused();
    await expect(marks(code)).toBeInViewport();

    await page.goBack();
    await entryFor(page, tag, NOTE_TEXT).click();
    await expect(page).toHaveURL(`/items/${id}?note`);
    await expect(noteField(page)).toBeFocused();
    await expect(noteField(page)).toBeInViewport();
    await expect(noteField(page)).toHaveValue(NOTE_TEXT);

    await page.goBack();
    await entryFor(page, tag, POST_PHRASE).click();
    await expect(marks(reader(page).locator(".md").first()).first()).toBeFocused();
  });
}

test("an entry whose passage a refresh removed says so, and opens the Reader at its place in the list of Highlights", async () => {
  const { page, context } = screenOf();
  const tag = "arnf";
  const id = await seedThread(screenOf(), thread(tag));
  await keepThroughApi(screenOf(), id, [["post", REMOVED_QUOTE]]);
  await seedThread(
    screenOf(),
    thread(tag, POST_TEXT.replace(REMOVED_QUOTE, "temp folder empties itself")),
  );
  const [gone] = (await highlightsOf(context.request, id)).items;

  await openPage(page, DESKTOP.width);
  const entry = entries(page).filter({ hasText: REMOVED_QUOTE });
  await expect(entry).toContainText(NOT_FOUND);

  await entry.locator("a.hp-open").click();
  await expect(page).toHaveURL(`/items/${id}?highlight=${gone?.id}`);
  await expect(listEntries(page).filter({ hasText: NOT_FOUND })).toBeFocused();
  await expect(listEntries(page).filter({ hasText: NOT_FOUND })).toBeInViewport();
});

const CROSSINGS = [
  ["a Highlight", "highlight"],
  ["the Note box", "note"],
] as const;

for (const [what, kind] of CROSSINGS) {
  test(`after arriving at ${what} and reading on, the Reader keeps its place and focus when the width turns a Grid sheet into a page`, async () => {
    const { page, context } = screenOf();
    const tag = `arx${kind}`;
    const id = await seedThread(screenOf(), thread(tag));

    await keepThroughApi(screenOf(), id, [
      ["t1_c3", CODE_QUOTE],
      ["post", POST_PHRASE],
    ]);

    await saved(context.request, id, NOTE_TEXT, 0);

    await openPage(page, DESKTOP.width, { layout: "grid", openAs: "sheet" });
    await entryFor(page, tag, kind === "note" ? NOTE_TEXT : CODE_QUOTE).click();
    await expect(page.locator(".sheet")).toBeVisible();

    const code = marks(reader(page).locator(".code"));
    const phrase = marks(reader(page).locator(".md").first()).first();

    if (kind === "note") await expect(noteField(page)).toBeFocused();
    else await expect(code).toBeFocused();

    await phrase.evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });

    await expect(phrase).toBeInViewport();
    await viewportAt(page, 390);
    await expect(page.locator(".sheet")).toHaveCount(0);
    await expect(phrase).toBeInViewport();
    await expect(phrase).not.toBeFocused();
    await expect(noteField(page)).not.toBeFocused();
    await expect(code).not.toBeFocused();
    await expect(noteField(page)).not.toBeInViewport();
    await expect(code).not.toBeInViewport();
  });
}
