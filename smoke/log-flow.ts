import { type Browser, type Page, expect } from "@playwright/test";

import { LogPageSchema } from "../src/core/log-contract.ts";
import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { LOG_PAGE } from "../web/src/log-text.ts";
import { DELETE_CONFIRM, DELETE_LABEL } from "../web/src/reader-text.ts";
import { LOAD_MORE, RETRY_LABEL } from "../web/src/text.ts";
import { topicLinkLabel } from "../web/src/topic-text.ts";

const PHONE = { width: 390, height: 844 };

const TARGET_PX = 44;

const FILLERS = 22;

const MARKDOWN = Array.from(
  { length: 6 },
  () =>
    "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.",
).join("\n\n");

const LONG_TITLE =
  "A title that keeps going so the line has to wrap at the width of a phone and never scrolls sideways, with one very long word: " +
  "supercalifragilisticexpialidocious".repeat(2);

const LOGGED = {
  link: "https://example.com/guides/the-log",
  topic: "The Log smoke topic",
  tags: ["alpha-beta", "gamma", "delta-epsilon"],
};

async function save(
  page: Page,
  link: string,
  digest: Readonly<{ title: string; topic: string; tags: readonly string[] }>,
): Promise<number> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: link,
      page: { markdown: MARKDOWN, title: digest.title },
      digest: { ...digest, summary: "A short summary.", keyPoints: ["One point"] },
    },
  });

  expect(saved.status()).toBe(201);

  return SavedItemResponseSchema.parse(await saved.json()).item.id;
}

const rows = (page: Page) => page.locator(".lg-line");

async function openLogFromPanel(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: LOG_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(/\/log$/u);
  await expect(page).toHaveTitle("Log, Threadsift");
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    column: (document.querySelector("main")?.scrollWidth ?? 0) - window.innerWidth,
  }));

  expect(overflow.page).toBeLessThanOrEqual(0);
  expect(overflow.column).toBeLessThanOrEqual(0);
}

export async function logFlow(page: Page, browser: Browser): Promise<void> {
  const id = await save(page, LOGGED.link, {
    title: LONG_TITLE,
    topic: LOGGED.topic,
    tags: LOGGED.tags,
  });

  await openLogFromPanel(page);
  await expect(rows(page).first()).toContainText(
    new RegExp(
      `^\\[\\d{4}-\\d{2}-\\d{2}\\] ingest \\| ${LONG_TITLE} \\| topic: ${LOGGED.topic} \\| tags: ${LOGGED.tags.join(", ")}$`,
      "u",
    ),
  );
  await expect(rows(page).nth(1)).toContainText(
    new RegExp(`^\\[\\d{4}-\\d{2}-\\d{2}\\] topic \\| ${LOGGED.topic}$`, "u"),
  );

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: LOG_PAGE.title })).toBeVisible();
  await expect(rows(page).first()).toContainText("ingest");

  await rows(page).first().getByRole("link", { name: LONG_TITLE }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${String(id)}$`, "u"));
  await page.goBack();
  await expect(page).toHaveURL(/\/log$/u);
  await rows(page)
    .nth(1)
    .getByRole("link", { name: topicLinkLabel(LOGGED.topic) })
    .click();
  await expect(page).toHaveURL(/\/topics\/the%20log%20smoke%20topic$/u);

  await page.setViewportSize(PHONE);
  await page.goto("/log");
  await expect(rows(page).first()).toContainText("ingest");
  await expectNoSidewaysScroll(page);

  const links = await rows(page).first().getByRole("link").all();
  const boxes = await Promise.all(links.map((link) => link.boundingBox()));

  for (const box of boxes) expect(box?.height).toBeGreaterThanOrEqual(TARGET_PX);

  await page.setViewportSize({ width: 1280, height: 800 });
  await signedOutVisit(browser);
  await deleteAndReload(page, id);
}

async function signedOutVisit(browser: Browser): Promise<void> {
  const signedOut = await browser.newContext();

  try {
    const visitor = await signedOut.newPage();

    await visitor.goto("/log");
    await expect(visitor).toHaveTitle("Sign in to Threadsift");
  } finally {
    await signedOut.close();
  }
}

async function deleteAndReload(page: Page, id: number): Promise<void> {
  await page.goto(`/items/${String(id)}`);
  await page.getByRole("button", { name: DELETE_LABEL, exact: true }).click();
  await page.getByRole("button", { name: DELETE_CONFIRM }).click();
  await expect(page).not.toHaveURL(new RegExp(`/items/${String(id)}$`, "u"));
  await page.goto("/log");
  await expect(rows(page).first()).toContainText(`topic | ${LOGGED.topic}`);
  await expect(page.locator(".lg-line", { hasText: LONG_TITLE })).toHaveCount(0);
}

export async function failedLoadMore(page: Page): Promise<void> {
  await Promise.all(
    Array.from({ length: FILLERS }, (_, at) =>
      save(page, `https://example.com/guides/log-filler-${String(at)}`, {
        title: `Log filler ${String(at)}`,
        topic: `Log filler topic ${String(at)}`,
        tags: [],
      }),
    ),
  );

  await expect
    .poll(async () => {
      const answer = await page.request.get("/api/log");

      return LogPageSchema.parse(await answer.json()).next;
    })
    .not.toBeNull();

  await page.goto("/log");
  await expect(rows(page)).toHaveCount(50);
  await page.context().setOffline(true);
  await page.getByRole("button", { name: LOAD_MORE }).click();
  await expect(page.getByText(LOG_PAGE.loadMoreFailed)).toBeVisible();
  await expect(rows(page)).toHaveCount(50);
  await page.context().setOffline(false);
  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(rows(page).nth(50)).toBeVisible();
}
