import { type Page, expect } from "@playwright/test";

import { ItemDetailResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { OP_LABEL, RELATED } from "../web/src/reader-text.ts";
import { rowKeptLabel } from "../web/src/text.ts";

const THREAD_ID = "3000000000000000001";

const THREAD_LINK = `https://x.com/Someone/status/${THREAD_ID}`;

const THREAD_TITLE = "Online backups for a busy database file";

const FACT = "Run sqlite3 app.db '.backup copy.db', then run PRAGMA integrity_check on the copy.";

const reply = (id: string, parentId: string, author: string, text: string) => ({
  id,
  parentId,
  author,
  text,
  postedAt: "2026-03-04T10:00:00Z",
  likes: 2,
});

const THREAD = {
  post: {
    id: THREAD_ID,
    author: "someone",
    text: "How do you back up a SQLite file while the app is writing to it?",
    postedAt: "2026-03-04T09:00:00Z",
    replies: 3,
  },
  replies: [
    reply("3000000000000000011", THREAD_ID, "bob", FACT),
    reply("3000000000000000012", "3000000000000000011", "Someone", "That also works from Python."),
    reply("3000000000000000013", THREAD_ID, "carol", "lol"),
  ],
};

interface PastedCase {
  readonly topic: {
    readonly link: string;
    readonly name: string;
    readonly itemTitle: string;
    readonly summary: string;
  };
  readonly markdown: string;
  readonly sentence: string;
}

export async function readerWithoutProvider(
  page: Page,
  { topic, markdown, sentence }: Readonly<PastedCase>,
): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: topic.link,
      page: { markdown, title: topic.itemTitle },
      digest: {
        title: topic.itemTitle,
        topic: topic.name,
        tags: ["backups"],
        summary: topic.summary,
        keyPoints: ["No Provider is saved"],
      },
    },
  });

  expect(saved.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await saved.json());

  await page.goto("/");
  await page
    .locator("article.it")
    .filter({ hasText: topic.itemTitle })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(sentence);
  await expect(page.getByRole("heading", { name: RELATED.title })).toHaveCount(0);

  const detail = await page.request.get(`/api/items/${String(item.id)}`);

  expect(ItemDetailResponseSchema.parse(await detail.json()).item.related).toEqual([]);
}

export async function readXThread(page: Page): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: THREAD_LINK,
      content: JSON.stringify(THREAD),
      digest: {
        title: THREAD_TITLE,
        topic: "Databases",
        tags: ["sqlite"],
        summary: "Use the online backup command.\nCheck the copy opens.",
        keyPoints: ["A plain copy can tear a page"],
        keptComments: ["t1_3000000000000000011", "t1_3000000000000000012"],
      },
    },
  });

  expect(saved.status()).toBe(201);
  await page.goto("/");

  const row = page.locator("article.it").filter({ hasText: THREAD_TITLE });

  await expect(row).toContainText(rowKeptLabel(2, 3));
  await row.getByRole("link").first().click();

  const reader = page.locator(".reader");

  await expect(reader.locator(".rd-src span", { hasText: /@someone/iu })).toHaveCount(1);
  await expect(reader).toContainText(FACT);
  await expect(reader).toContainText("Likes: 2");
  await expect(reader.locator(".cm-author", { hasText: "@bob" })).toHaveCount(1);
  await expect(reader.locator(".op")).toHaveText(OP_LABEL);
  await expect(reader).not.toContainText("Arctic Shift");
}
