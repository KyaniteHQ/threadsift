import { type Page, type Route, expect } from "@playwright/test";

import { STORAGE_KEY } from "../design/system/settings.ts";
import { ReadStateRequestSchema } from "../src/core/contract/item-route-wire.ts";
import { OP_LABEL, RELATED } from "../web/src/reader-text.ts";
import { MOTION_ITEM, motionOf, watchMotion } from "./reader-motion-flow.ts";
import { itemDetail, savedItem, savedTopicItem } from "./saved-item.ts";

const THREAD_ID = "3000000000000000001";

const THREAD_LINK = `https://x.com/oldname/status/${THREAD_ID}`;

const STATUS_ID = "3000000000000000002";

const STATUS_LINK = `https://x.com/i/status/${STATUS_ID}`;

const STATUS_TITLE = "A status link that names no handle";

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

const STATUS_POST = {
  post: {
    id: STATUS_ID,
    author: "someone",
    text: "Does the online backup command lock the database while it copies?",
    postedAt: "2026-03-05T09:00:00Z",
    replies: 0,
  },
  replies: [],
};

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
  await expect(page.locator(".reader")).toContainText(sentence);
  await expect(page.getByRole("heading", { name: RELATED.title })).toHaveCount(0);

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

export async function readerMotion(page: Page): Promise<void> {
  const id = await savedItem(page.request, MOTION_ITEM);
  const card = page.locator(`.it[data-key="${String(id)}"] .it-open`);
  const shared = [[`lib-item-${String(id)}`]];
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await page.addInitScript(watchMotion);
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify({ layout: "grid", openAs: "sheet" })] as const,
  );
  await page.goto("/");

  const opened = await motionOf(page, () => card.click(), 1);
  const escaped = await motionOf(page, () => page.keyboard.press("Escape"), 0);
  await motionOf(page, () => card.click(), 1);
  const backed = await motionOf(
    page,
    async () => {
      await page.goBack();
    },
    0,
  );

  expect(
    opened.map((run) => run.moved),
    "the open grows only this Item's card",
  ).toEqual(shared);
  expect(
    escaped.map((run) => run.moved),
    "Escape runs the Reader back into it",
  ).toEqual(shared);
  expect(
    backed.map((run) => run.moved),
    "Back runs the Reader back into it",
  ).toEqual(shared);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await motionOf(page, () => card.click(), 1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader-slot")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  expect(
    reduced.map((run) => run.changing),
    "reduced motion animates nothing",
  ).toEqual([0]);

  await page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    [STORAGE_KEY, stored] as const,
  );
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
