import { type Page, expect, test } from "@playwright/test";
import { z } from "zod";

import { FIELDS, LOGIN, SETTINGS, SETUP } from "../web/src/access-text.ts";
import { IMPORT, countLabel } from "../web/src/import-text.ts";
import { ADD_LABEL, FILTERS_BUTTON, PASTE_LABEL } from "../web/src/text.ts";
import { TOPIC_PAGE, topicLinkLabel } from "../web/src/topic-text.ts";

const PASSWORD = "a smoke password of fifteen or more";

const X_LINK = "https://x.com/someone/status/1234567890";

const X_ROW = "x.com/i/status/1234567890";

const IMPORT_IDS = ["2000000001", "2000000002", "2000000003"];

const IMPORT_LIST = IMPORT_IDS.map((id) => `https://x.com/importer/status/${id}`);

const ARTICLE_LINK = "https://example.com/guides/backing-up-sqlite";

const ARTICLE_TITLE = "Backing up SQLite";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

const ARTICLE_TEXT = Array.from({ length: 8 }, () => SENTENCE).join("\n\n");

interface TopicCase {
  readonly link: string;
  readonly name: string;
  readonly itemTitle: string;
  readonly summary: string;
  readonly address: RegExp;
}

const DOTTED_TOPIC: TopicCase = {
  link: "https://example.com/guides/node-streams",
  name: "Node.js",
  itemTitle: "Streams in Node",
  summary: "Streams move data in chunks.\nBackpressure keeps memory flat.",
  address: /\/topics\/node%2Ejs$/u,
};

const DOTS_ONLY_TOPIC: TopicCase = {
  link: "https://example.com/guides/dots",
  name: "..",
  itemTitle: "Two dots",
  summary: "The Topic is made of two dots.",
  address: /\/topics\/~%2E%2E$/u,
};

const PHONE = { width: 390, height: 844 };

const TARGET_PX = 44;

const SETUP_CODE = z.string().min(16).parse(process.env["SETUP_CODE"]);

const libraryHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Threadsift" });

const passwordField = (page: Page) =>
  page.getByLabel(FIELDS.password, { exact: true }).and(page.locator("input"));

async function setUp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(SETUP.codeLabel).fill(SETUP_CODE);
  await page.getByRole("button", { name: SETUP.continue }).click();
  await passwordField(page).fill(PASSWORD);
  await page.getByLabel(FIELDS.confirmPassword).fill(PASSWORD);
  await page.getByRole("button", { name: SETUP.create }).click();
  await expect(libraryHeading(page)).toBeVisible();
}

async function signOutAndIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: SETTINGS.instanceSettings }).click();
  await page.getByRole("button", { name: SETTINGS.signOut }).click();
  await expect(page).toHaveTitle("Sign in to Threadsift");
  await passwordField(page).fill(PASSWORD);
  await page.getByRole("button", { name: LOGIN.signIn }).click();
  await expect(libraryHeading(page)).toBeVisible();
}

async function pasteXLink(page: Page): Promise<void> {
  const row = page.locator("article.it.it-link-only");

  await page.getByRole("textbox", { name: PASTE_LABEL }).fill(X_LINK);
  await page.getByRole("button", { name: ADD_LABEL }).click();
  await expect(row).toContainText(X_ROW);
  await page.reload();
  await expect(row).toContainText(X_ROW);
}

async function readSavedPage(page: Page): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: ARTICLE_LINK,
      page: { markdown: ARTICLE_TEXT, title: ARTICLE_TITLE, author: "Ada Example" },
    },
  });

  expect(saved.status()).toBe(201);
  await page.reload();
  await page
    .locator("article.it")
    .filter({ hasText: ARTICLE_TITLE })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(SENTENCE);
}

const importBox = (page: Page) => page.getByLabel(IMPORT.boxLabel, { exact: true });

async function importList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: IMPORT.settingsLink }).click();
  await expect(page).toHaveTitle("Import, Threadsift");
  await importBox(page).fill(IMPORT_LIST.join("\n"));
  await page.getByRole("button", { name: IMPORT.start }).click();
  await expect(
    page.getByText(countLabel(IMPORT_LIST.length, "added"), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(IMPORT.finished)).toBeVisible();
  await page.getByRole("link", { name: IMPORT.back }).click();
  await expect(libraryHeading(page)).toBeVisible();

  await expect(
    page
      .locator("article.it.it-link-only")
      .filter({ hasText: new RegExp(`x\\.com/i/status/(${IMPORT_IDS.join("|")})`, "u") }),
  ).toHaveCount(IMPORT_IDS.length);
}

async function importListAgain(page: Page): Promise<void> {
  await page.goto("/import");
  await importBox(page).fill(IMPORT_LIST.join("\n"));
  await expect(page.getByText(IMPORT.resumeComplete)).toBeVisible();
}

async function openTopicPage(page: Page, topic: TopicCase): Promise<void> {
  const saved = await page.request.post("/api/items", {
    data: {
      url: topic.link,
      page: { markdown: ARTICLE_TEXT, title: topic.itemTitle },
      digest: {
        title: topic.itemTitle,
        topic: topic.name,
        tags: ["streams"],
        summary: topic.summary,
        keyPoints: ["Pipe streams instead of buffering them"],
      },
    },
  });

  expect(saved.status()).toBe(201);
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
  await expect(page.locator(".tp-it")).toContainText(topic.itemTitle);
  await expect(page.locator(".tp-sum")).toContainText(topic.summary.split("\n").at(-1) ?? "");
  await expect(page.getByText(TOPIC_PAGE.noProvider)).toBeVisible();
}

async function phoneRailTarget(page: Page, topic: TopicCase): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await page.getByRole("button", { name: FILTERS_BUTTON, exact: true }).click();
  await page.getByRole("button", { name: topic.name }).click();

  const box = await page
    .getByRole("link", { name: TOPIC_PAGE.openPage, exact: true })
    .boundingBox();

  expect(box?.height).toBeGreaterThanOrEqual(TARGET_PX);
}

test("a new Instance is set up, signed out of and into again, keeps a pasted X link across a reload, opens a saved page in the Reader, imports a list of links once, and opens the Topic pages of a dotted name and of a name made only of dots", async ({
  page,
}) => {
  await test.step("set up the owner with the setup code", () => setUp(page));
  await test.step("sign out and sign in again", () => signOutAndIn(page));
  await test.step("paste an X link and find its Link-only row after a reload", () =>
    pasteXLink(page));
  await test.step("save a page through the API and read its text in the Reader", () =>
    readSavedPage(page));
  await test.step("import a list of three links from the settings panel and find its Items", () =>
    importList(page));
  await test.step("paste the same list after a reload and be told it was fully imported", () =>
    importListAgain(page));
  await test.step("open the Topic page from the Reader and reload it on its address", () =>
    openTopicPage(page, DOTTED_TOPIC));
  await test.step("open a Topic made only of dots, which needs the tilde address", () =>
    openTopicPage(page, DOTS_ONLY_TOPIC));
  await test.step("the filter rail's Topic link is a 44px target on a phone", () =>
    phoneRailTarget(page, DOTTED_TOPIC));
});
