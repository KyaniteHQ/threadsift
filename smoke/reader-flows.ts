import { type Page, type Route, expect } from "@playwright/test";

import { ReadStateRequestSchema } from "../src/core/contract/item-route-wire.ts";
import { NOTE_TITLE, SECTION_TITLES, SUMMARY_LABEL } from "../src/core/contract/reader-text.ts";
import { CONTENTS_TITLE, NOTE_SAVE, OP_LABEL, RELATED } from "../web/src/reader-text.ts";
import { itemDetail, savedItem, savedTopicItem } from "./saved-item.ts";
import { atWideWidth } from "./screen-checks.ts";

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
  const item = await savedTopicItem(page.request, topic, markdown, {
    tag: "backups",
    keyPoint: "No Provider is saved",
  });

  await page.goto("/");
  await page
    .locator("article.it")
    .filter({ hasText: topic.itemTitle })
    .getByRole("link")
    .first()
    .click();
  const reader = page.locator(".reader");

  await expect(reader).toContainText(sentence);
  await expect(page.getByRole("heading", { name: RELATED.title })).toHaveCount(0);

  const headings = await reader.getByRole("heading").allTextContents();

  expect(headings.indexOf(SUMMARY_LABEL)).toBeGreaterThan(-1);
  expect(headings.indexOf(SUMMARY_LABEL)).toBeLessThan(headings.indexOf(SECTION_TITLES.article));

  await atWideWidth(page, async () => {
    await page
      .getByRole("navigation", { name: CONTENTS_TITLE })
      .getByRole("link", { name: SECTION_TITLES.article })
      .click();
    await expect(reader.getByRole("heading", { name: SECTION_TITLES.article })).toBeFocused();

    const note = page.getByRole("textbox", { name: NOTE_TITLE });
    const save = page.getByRole("button", { name: NOTE_SAVE, exact: true });

    await expect(save).toHaveCount(0);
    await note.fill("Check the copy before trusting it.");
    await expect(save).toBeVisible();
    await note.fill("");
    await expect(save).toHaveCount(0);
  });

  expect((await itemDetail(page.request, item)).related).toEqual([]);
}

export async function readXThread(page: Page): Promise<void> {
  await savedItem(page.request, {
    url: THREAD_LINK,
    content: JSON.stringify(THREAD),
    digest: {
      title: THREAD_TITLE,
      topic: "Databases",
      tags: ["sqlite"],
      summary: "Use the online backup command.\nCheck the copy opens.",
      keyPoints: ["A plain copy can tear a page"],
      keptComments: ["3000000000000000011", "3000000000000000012"],
    },
  });
  await page.goto("/");

  const row = page.locator("article.it").filter({ hasText: THREAD_TITLE });

  await expect(row).toContainText("Kept 2 of 3");
  await row.getByRole("link").first().click();

  const reader = page.locator(".reader");

  await expect(reader.locator(".rd-src span", { hasText: /@someone/iu })).toHaveCount(1);
  await expect(reader).toContainText(FACT);
  await expect(reader).toContainText("Likes: 2");
  await expect(reader.locator(".cm-author", { hasText: "@bob" })).toHaveCount(1);
  await expect(reader.locator(".op")).toHaveText(OP_LABEL);
  await expect(reader).not.toContainText("Arctic Shift");
}

const LIST_READ_HOLD_MS = 1500;

const listReads = (url: URL) => url.pathname === "/api/items";

async function holdListRead(route: Route): Promise<void> {
  if (route.request().method() === "GET") {
    await new Promise<void>((wait) => {
      setTimeout(wait, LIST_READ_HOLD_MS);
    });
  }

  await route.fallback();
}

export async function markReadTwice(page: Page): Promise<void> {
  const row = page.locator("article.it").filter({ hasText: THREAD_TITLE });
  const id = Number(await row.getAttribute("data-key"));
  const path = `/api/items/${String(id)}/read-state`;

  expect((await itemDetail(page.request, id)).readState).toBe("unread");

  await page.route(listReads, holdListRead);

  const sent: string[] = [];
  const answered = () =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" && new URL(response.url()).pathname === path,
    );

  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === path) {
      sent.push(ReadStateRequestSchema.parse(request.postDataJSON()).readState);
    }
  });

  const first = answered();
  await page.keyboard.press("m");
  await first;
  const second = answered();
  await page.keyboard.press("m");
  await second;

  expect(sent).toStrictEqual(["read", "unread"]);
  expect((await itemDetail(page.request, id)).readState).toBe("unread");

  await page.unroute(listReads, holdListRead);
}
