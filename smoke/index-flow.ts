import { type Browser, type Page, expect } from "@playwright/test";

import { IMPORT } from "../web/src/import-text.ts";
import { INDEX_PAGE } from "../web/src/index-text.ts";
import { FILTERS_BUTTON, FILTER_GROUPS } from "../web/src/text.ts";
import { TOPIC_PAGE, itemsLabel, topicLinkLabel } from "../web/src/topic-text.ts";
import { visitSignedOut } from "./document-checks.ts";
import { savedTopicItem } from "./saved-item.ts";
import { atPhoneWidth, expectTarget, openSettings } from "./screen-checks.ts";

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
  await savedTopicItem(page.request, topic, markdown, {
    tag: "index",
    keyPoint: "The Index reads stored rows",
  });
  await atPhoneWidth(page, async () => {
    await openSettings(page);
    await Promise.all(
      [IMPORT.settingsLink, INDEX_PAGE.masthead].map((name) =>
        expectTarget(page.getByRole("link", { name, exact: true })),
      ),
    );

    await page.getByRole("link", { name: INDEX_PAGE.masthead, exact: true }).click();
    await expect(page).toHaveURL(/\/topics$/u);
    await expect(page).toHaveTitle("Index, Threadsift");

    const row = page.locator(".ix-it").filter({ hasText: topic.name });

    await expect(row).toContainText(itemsLabel(1));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: INDEX_PAGE.title })).toBeVisible();
    await expect(row).toContainText(itemsLabel(1));
    await expectTarget(row);
    await row.getByRole("link", { name: topicLinkLabel(topic.name) }).click();
    await expect(page).toHaveURL(topic.address);
    await expect(page.getByRole("heading", { level: 1, name: topic.name })).toBeVisible();

    await visitSignedOut(browser, "/topics");
  });
}

export async function openTopicPage(page: Page, topic: TopicCase, markdown: string): Promise<void> {
  await savedTopicItem(page.request, topic, markdown, {
    tag: "streams",
    keyPoint: "Pipe streams instead of buffering them",
  });
  await page.goto("/");
  await page
    .locator("article.it")
    .filter({ hasText: topic.itemTitle })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("link", { name: topicLinkLabel(topic.name) }).click();
  await expect(page).toHaveURL(topic.address);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: topic.name })).toBeVisible();
  await expect(page.locator(".rl-row")).toContainText(topic.itemTitle);
  await expect(page.locator(".rl-sum")).toContainText(topic.summary.split("\n").at(-1) ?? "");
  await expect(page.getByText(TOPIC_PAGE.noProvider)).toBeVisible();
}

export async function phoneRailTarget(page: Page, topic: TopicCase): Promise<void> {
  await atPhoneWidth(page, async () => {
    await page.goto("/");
    await page.getByRole("button", { name: FILTERS_BUTTON, exact: true }).click();
    await page
      .getByRole("group", { name: FILTER_GROUPS.topic })
      .getByRole("button", { name: topic.name })
      .click();
    await expectTarget(page.getByRole("link", { name: TOPIC_PAGE.openPage, exact: true }));
  });
}
