import { type Page, expect } from "@playwright/test";

import { codePointCount } from "../src/core/contract/code-points.ts";
import { selectorAt } from "../src/core/contract/highlight-anchor.ts";
import { HighlightResponseSchema } from "../src/core/contract/highlight-contract.ts";
import { PAGE_SIZE } from "../src/core/contract/paging.ts";
import { projectText } from "../src/core/contract/text-projection.ts";
import { itemDetail, savedItem } from "./saved-item.ts";

export const TITLE = "A page with a full page of highlights and a note";

export const NOTE = "Check that the copy opens before the old file goes.";

export const HIGHLIGHTS = PAGE_SIZE;

export const sentence = (number: number): string =>
  `Highlight ${String(number).padStart(2, "0")} keeps its own place in the text.`;

const MARKDOWN = Array.from({ length: HIGHLIGHTS }, (_unused, index) => sentence(index + 1)).join(
  "\n\n",
);

export async function keepHighlightsAndNote(
  page: Page,
): Promise<{ item: number; oldestHighlight: number }> {
  const item = await savedItem(page.request, {
    url: "https://example.com/guides/highlights",
    page: { markdown: MARKDOWN, title: TITLE },
    digest: {
      title: TITLE,
      topic: "Highlights",
      tags: ["highlights"],
      summary: "The page holds one passage for each Highlight.",
      keyPoints: ["A Highlight keeps a passage of the post text"],
    },
  });

  await expect.poll(async () => (await itemDetail(page.request, item)).postText).not.toBeNull();

  const detail = await itemDetail(page.request, item);

  if (detail.postText === null) throw new Error("the Item holds no post text");

  const text = projectText(detail.postText);

  const keep = async (number: number): Promise<number> => {
    const exact = sentence(number);
    const start = text.indexOf(exact);

    expect(start).toBeGreaterThanOrEqual(0);

    const selector = selectorAt(text, codePointCount(text, start), codePointCount(exact));

    expect(selector).not.toBeNull();

    const kept = await page.request.post(`/api/items/${String(item)}/highlights`, {
      data: {
        target: { kind: "post" },
        revision: detail.highlights.revisions.post,
        selector,
      },
    });

    expect(kept.status()).toBe(201);

    return HighlightResponseSchema.parse(await kept.json()).highlight.id;
  };

  const oldestHighlight = await keep(HIGHLIGHTS);

  for (let number = HIGHLIGHTS - 1; number >= 1; number -= 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- The page lists Highlights in the order they were kept.
    await keep(number);
  }

  const note = await page.request.put(`/api/items/${String(item)}/note`, {
    data: { body: NOTE, revision: detail.note.revision },
  });

  expect(note.status()).toBe(200);

  return { item, oldestHighlight };
}
