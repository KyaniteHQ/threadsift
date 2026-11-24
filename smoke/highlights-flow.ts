import { type Page, expect } from "@playwright/test";

import { HighlightResponseSchema } from "../src/core/contract/highlight-contract.ts";
import {
  ItemDetailResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import { projectText } from "../src/core/contract/text-projection.ts";
import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { DELETE_CONFIRM, DELETE_LABEL } from "../web/src/reader-text.ts";
import { LOAD_MORE } from "../web/src/text.ts";
import { DESKTOP, PHONE, expectNoSidewaysScroll } from "./screen-checks.ts";

const TITLE = "A page with fifty highlights and a note";

const NOTE = "Check that the copy opens before the old file goes.";

const CONTEXT_CHARACTERS = 32;

const HIGHLIGHTS = 50;

const FIRST_PAGE = 50;

const sentence = (number: number): string =>
  `Highlight ${String(number).padStart(2, "0")} keeps its own place in the text.`;

const MARKDOWN = Array.from({ length: HIGHLIGHTS }, (_unused, index) => sentence(index + 1)).join(
  "\n\n",
);

async function detailOf(page: Page, id: number) {
  const read = await page.request.get(`/api/items/${String(id)}`);

  return ItemDetailResponseSchema.parse(await read.json()).item;
}

async function keepHighlightsAndNote(page: Page): Promise<{ item: number; first: number }> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: "https://example.com/guides/highlights",
      page: { markdown: MARKDOWN, title: TITLE },
      digest: {
        title: TITLE,
        topic: "Highlights",
        tags: ["highlights"],
        summary: "The page holds one passage for each Highlight.",
        keyPoints: ["A Highlight keeps a passage of the post text"],
      },
    },
  });

  expect(saved.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await saved.json());

  await expect.poll(async () => (await detailOf(page, item.id)).postText).not.toBeNull();

  const detail = await detailOf(page, item.id);
  const text = projectText(detail.postText ?? "");

  const keep = async (number: number): Promise<number> => {
    const exact = sentence(number);
    const hint = text.indexOf(exact);

    expect(hint).toBeGreaterThanOrEqual(0);

    const kept = await page.request.post(`/api/items/${String(item.id)}/highlights`, {
      data: {
        target: { kind: "post" },
        revision: detail.highlights.revisions.post,
        selector: {
          exact,
          prefix: text.slice(Math.max(0, hint - CONTEXT_CHARACTERS), hint),
          suffix: text.slice(hint + exact.length, hint + exact.length + CONTEXT_CHARACTERS),
          hint,
        },
      },
    });

    expect(kept.status()).toBe(201);

    return HighlightResponseSchema.parse(await kept.json()).highlight.id;
  };

  const ids = await Array.from(
    { length: HIGHLIGHTS },
    (_unused, index) => HIGHLIGHTS - index,
  ).reduce<Promise<readonly number[]>>(
    async (done, number) => [...(await done), await keep(number)],
    Promise.resolve([]),
  );

  const note = await page.request.put(`/api/items/${String(item.id)}/note`, {
    data: { body: NOTE, revision: detail.note.revision },
  });

  expect(note.status()).toBe(200);

  return { item: item.id, first: ids[0] ?? 0 };
}

export async function highlightsFlow(page: Page): Promise<void> {
  const { item, first } = await keepHighlightsAndNote(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: HIGHLIGHTS_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(/\/highlights$/u);
  await expect(page).toHaveTitle("Highlights, Threadsift");
  await expect(page.getByRole("heading", { level: 1, name: HIGHLIGHTS_PAGE.title })).toBeVisible();

  const entries = page.locator(".hp-it");

  await expect(entries).toHaveCount(FIRST_PAGE);
  await expect(entries.first().locator(".hp-kind .label")).toHaveText(HIGHLIGHTS_PAGE.kindNote);
  await expect(entries.first()).toContainText(NOTE);
  await expect(entries.nth(1)).toContainText(sentence(1));

  await page.getByRole("button", { name: LOAD_MORE, exact: true }).click();
  await expect(entries).toHaveCount(HIGHLIGHTS + 1);
  await expect(entries.last()).toContainText(sentence(HIGHLIGHTS));
  await expect(page.getByRole("button", { name: LOAD_MORE, exact: true })).toHaveCount(0);

  await entries.last().getByRole("link", { name: TITLE }).click();
  await expect(page).toHaveURL(
    new RegExp(`/items/${String(item)}\\?highlight=${String(first)}$`, "u"),
  );

  const mark = page.locator(`.reader mark[data-highlights~="${String(first)}"]`);

  await expect(mark).toContainText(sentence(HIGHLIGHTS));
  await expect(mark).toBeFocused();
  await expect(mark).toBeInViewport();

  await page.setViewportSize(PHONE);
  await page.goto("/highlights");
  await expect(entries).toHaveCount(FIRST_PAGE);
  await expectNoSidewaysScroll(page);
  await page.setViewportSize(DESKTOP);

  await page.goto(`/items/${String(item)}`);
  await expect(mark).not.toBeInViewport();
  await page.getByRole("button", { name: DELETE_LABEL, exact: true }).click();
  await page.getByRole("button", { name: DELETE_CONFIRM }).click();
  await expect(page).not.toHaveURL(new RegExp(`/items/${String(item)}`, "u"));
  await page.goto("/highlights");
  await expect(page.getByRole("heading", { name: HIGHLIGHTS_PAGE.emptyHeading })).toBeVisible();
}
