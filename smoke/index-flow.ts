import { type Browser, type Page, expect } from "@playwright/test";

import { IMPORT } from "../web/src/import-text.ts";
import { INDEX_PAGE } from "../web/src/index-text.ts";
import { FILTERS_BUTTON, FILTER_GROUPS } from "../web/src/text.ts";
import { TOPIC_PAGE, itemsLabel, topicLinkLabel } from "../web/src/topic-text.ts";
import { visitSignedOut } from "./document-checks.ts";
import { DESKTOP, PHONE, TARGET_PX } from "./screen-checks.ts";

export interface TopicCase {
  readonly link: string;
  readonly name: string;
  readonly itemTitle: string;
  readonly summary: string;
  readonly address: RegExp;
}

export async function openIndex(
  page: Page,
  browser: Browser,
  topic: TopicCase,
  markdown: string,
): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: topic.link,
      page: { markdown, title: topic.itemTitle },
      digest: {
        title: topic.itemTitle,
        topic: topic.name,
        tags: ["index"],
        summary: topic.summary,
        keyPoints: ["The Index reads stored rows"],
      },
    },
  });

  expect(saved.status()).toBe(201);
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const boxes = await Promise.all(
    [IMPORT.settingsLink, INDEX_PAGE.masthead].map((name) =>
      page.getByRole("link", { name, exact: true }).boundingBox(),
    ),
  );

  for (const box of boxes) {
    expect(box?.width).toBeGreaterThanOrEqual(TARGET_PX);
    expect(box?.height).toBeGreaterThanOrEqual(TARGET_PX);
  }

  await page.getByRole("link", { name: INDEX_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(/\/topics$/u);
  await expect(page).toHaveTitle("Index, Threadsift");

  const row = page.locator(".ix-it").filter({ hasText: topic.name });

  await expect(row).toContainText(itemsLabel(1));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: INDEX_PAGE.title })).toBeVisible();
  await expect(row).toContainText(itemsLabel(1));
  expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(TARGET_PX);
  await row.getByRole("link", { name: topicLinkLabel(topic.name) }).click();
  await expect(page).toHaveURL(topic.address);
  await expect(page.getByRole("heading", { level: 1, name: topic.name })).toBeVisible();

  await visitSignedOut(browser, "/topics");
  await page.setViewportSize(DESKTOP);
}

export async function phoneRailTarget(page: Page, topic: TopicCase): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await page.getByRole("button", { name: FILTERS_BUTTON, exact: true }).click();
  await page
    .getByRole("group", { name: FILTER_GROUPS.topic })
    .getByRole("button", { name: topic.name })
    .click();

  const box = await page
    .getByRole("link", { name: TOPIC_PAGE.openPage, exact: true })
    .boundingBox();

  expect(box?.height).toBeGreaterThanOrEqual(TARGET_PX);
  await page.setViewportSize(DESKTOP);
}
