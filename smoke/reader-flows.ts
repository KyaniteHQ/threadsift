import { type Page, expect } from "@playwright/test";

import { ReadStateRequestSchema } from "../src/core/contract/item-route-wire.ts";
import { NOTE_TITLE, SECTION_TITLES, SUMMARY_LABEL } from "../src/core/contract/reader-text.ts";
import {
  CONTENTS_TITLE,
  NOTE_SAVE,
  OP_LABEL,
  READER_STALE,
  RELATED,
} from "../web/src/reader-text.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { holdListRead, listReads, refuseLater } from "./held-reads.ts";
import {
  FACT,
  FIRST_COPY,
  FIRST_TEXT,
  STALE_LINK,
  STALE_TITLE,
  STATUS_LINK,
  STATUS_POST,
  STATUS_TITLE,
  THREAD,
  THREAD_LINK,
  THREAD_TITLE,
} from "./reader-items.ts";
import { itemDetail, itemStatus, savedItem, savedTopicItem } from "./saved-item.ts";
import { atWideWidth } from "./screen-checks.ts";

async function expectStoredAuthor(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.locator("article.it").filter({ hasText: title }).getByRole("link").first().click();

  const meta = page.locator(".reader .rd-meta");

  await expect(meta.locator(".rd-part", { hasText: /^@someone$/u })).toHaveCount(1);
  await expect(meta).not.toContainText("oldname");
  await expect(meta).not.toContainText("x.com");
}

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

  await expect(reader).toContainText(FACT);
  await expect(reader).toContainText("Likes: 2");
  await expect(reader.locator(".cm-author", { hasText: "@bob" })).toHaveCount(1);
  await expect(reader.locator(".op")).toHaveText(OP_LABEL);
  await expect(reader).not.toContainText("Arctic Shift");
  await expectStoredAuthor(page, THREAD_TITLE);

  await savedItem(page.request, {
    url: STATUS_LINK,
    content: JSON.stringify(STATUS_POST),
    digest: {
      title: STATUS_TITLE,
      topic: "Databases",
      tags: ["sqlite"],
      summary: "The backup command copies pages while the app writes.",
      keyPoints: ["Writers wait only for the page being copied"],
    },
  });
  await expectStoredAuthor(page, STATUS_TITLE);
}

async function pressM(page: Page, id: number): Promise<void> {
  const written = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/items/${String(id)}/read-state`,
  );

  await page.keyboard.press("m");
  await written;
}

export async function retryStaleReader(page: Page): Promise<void> {
  const id = await savedItem(page.request, {
    url: STALE_LINK,
    page: { markdown: FIRST_TEXT, title: STALE_TITLE },
  });
  const reader = page.locator(".reader");

  await page.goto(`/items/${String(id)}`);
  await expect(reader).toContainText(FIRST_COPY);

  const detail = (url: URL) => url.pathname === `/api/items/${String(id)}`;
  const reads: string[] = [];

  page.on("request", (request) => {
    if (request.method() === "GET" && detail(new URL(request.url()))) reads.push(request.url());
  });
  await page.route(detail, refuseLater);

  const refreshed = await page.request.post("/api/items", {
    data: {
      url: STALE_LINK,
      page: { markdown: FIRST_TEXT.replaceAll("first", "later"), title: STALE_TITLE },
    },
  });

  expect(refreshed.ok()).toBe(true);
  await expect.poll(async () => (await itemStatus(page.request, id)).status).toBe("ready");

  await pressM(page, id);

  const staleLine = reader.locator(".rd-orig").filter({ hasText: READER_STALE });
  const retry = staleLine.getByRole("button", { name: RETRY_LABEL });

  await expect(retry).toBeVisible();
  await pressM(page, id);

  const before = reads.length;

  await retry.click();
  await expect(retry).toHaveAttribute("aria-busy", "true");
  await retry.click({ force: true });
  await expect(retry).not.toHaveAttribute("aria-busy", "true");
  await expect(reader).toContainText(FIRST_COPY);
  expect(reads.length - before).toBe(1);

  await page.unroute(detail, refuseLater);
  const removed = await page.request.delete(`/api/items/${String(id)}`, {
    headers: { origin: new URL(page.url()).origin },
  });

  expect(removed.status()).toBe(204);
  await retry.click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("article.it").filter({ hasText: STALE_TITLE })).toHaveCount(0);
}

export async function markReadTwice(page: Page): Promise<void> {
  const row = page.locator("article.it").filter({ hasText: THREAD_TITLE });
  const id = Number(await row.getAttribute("data-key"));
  const path = `/api/items/${String(id)}/read-state`;

  await row.getByRole("link").first().click();
  await expect(page.locator(".reader .rd-title")).toContainText(THREAD_TITLE);

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

export async function readSavedPage(
  page: Page,
  article: Readonly<{ link: string; title: string; text: string; sentence: string }>,
): Promise<void> {
  await savedItem(page.request, {
    url: article.link,
    page: { markdown: article.text, title: article.title, author: "Ada Example" },
  });
  await page.reload();
  await page
    .locator("article.it")
    .filter({ hasText: article.title })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(article.sentence);
}
