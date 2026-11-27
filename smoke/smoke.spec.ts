import { type Page, expect, test } from "@playwright/test";

import { ADD_LABEL, PASTE_LABEL } from "../web/src/text.ts";
import { setUp, signOutAndIn } from "./access-flow.ts";
import { expectAnswerHeaders, watchContext } from "./document-checks.ts";
import { importList, importListAgain } from "./import-flow.ts";
import { type TopicCase, openIndex, openTopicPage, phoneRailTarget } from "./index-flow.ts";
import { failedLoadMore, logFlow } from "./log-flow.ts";
import { readXThread, readerWithoutProvider } from "./reader-flows.ts";
import { savedItem } from "./saved-item.ts";
import { settingsSteps } from "./settings-steps.ts";

const X_LINK = "https://x.com/someone/status/1234567890";

const X_ROW = "x.com/i/status/1234567890";

const ARTICLE_LINK = "https://example.com/guides/backing-up-sqlite";

const ARTICLE_TITLE = "Backing up SQLite";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

const ARTICLE_TEXT = Array.from({ length: 8 }, () => SENTENCE).join("\n\n");

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

const UNRELATED_TOPIC: TopicCase = {
  link: "https://example.com/guides/no-provider",
  name: "Backups",
  itemTitle: "A Digest sent with the Paste",
  summary: "A caller sent this Digest.",
  address: /\/topics\/backups$/u,
};

const INDEXED_TOPIC: TopicCase = {
  link: "https://example.com/guides/indexing",
  name: "Indexing",
  itemTitle: "One item on the Index",
  summary: "The Index lists every Topic.",
  address: /\/topics\/indexing$/u,
};

const SMOKE_TIMEOUT_MS = 240_000;

async function pasteXLink(page: Page): Promise<void> {
  const row = page.locator("article.it.it-link-only");

  await page.getByRole("textbox", { name: PASTE_LABEL }).fill(X_LINK);
  await page.getByRole("button", { name: ADD_LABEL }).click();
  await expect(row).toContainText(X_ROW);
  await page.reload();
  await expect(row).toContainText(X_ROW);
}

async function readSavedPage(page: Page): Promise<void> {
  await savedItem(page.request, {
    url: ARTICLE_LINK,
    page: { markdown: ARTICLE_TEXT, title: ARTICLE_TITLE, author: "Ada Example" },
  });
  await page.reload();
  await page
    .locator("article.it")
    .filter({ hasText: ARTICLE_TITLE })
    .getByRole("link")
    .first()
    .click();
  await expect(page.locator(".reader")).toContainText(SENTENCE);
}

test("a new Instance is set up, signed out of and into again, keeps a pasted X link across a reload, opens a saved page in the Reader, imports a list of links once, and opens the Topic pages of a dotted name and of a name made only of dots, lists its Topics on the Index, lists the Digests it published on the Log, and shows no Related Items without a Provider", async ({
  page,
  browser,
}) => {
  test.setTimeout(SMOKE_TIMEOUT_MS);

  const expectNoCspViolations = await watchContext(page.context());

  await test.step("every answer tells search engines not to list the Instance, and the app page carries its security headers on / and on a deep address", () =>
    expectAnswerHeaders(page));
  await test.step("set up the owner with the setup code", () => setUp(page));
  await test.step("sign out and sign in again", () => signOutAndIn(page));
  await test.step("paste an X link, find its Link-only row after a reload", () => pasteXLink(page));
  await test.step("save an X thread and read its Kept replies", () => readXThread(page));
  await test.step("save a page through the API and read its text in the Reader", () =>
    readSavedPage(page));
  await test.step("import a list of three links from the settings panel and find its Items", () =>
    importList(page));
  await test.step("paste the same list after a reload and be told it was fully imported", () =>
    importListAgain(page));
  await test.step("open the Topic page from the Reader and reload it on its address", () =>
    openTopicPage(page, DOTTED_TOPIC, ARTICLE_TEXT));
  await test.step("open a Topic made only of dots, which needs the tilde address", () =>
    openTopicPage(page, DOTS_ONLY_TOPIC, ARTICLE_TEXT));
  await test.step("follow the settings panel's Index link, see a Topic with its count, open its page from the row, and visit the Index signed out", () =>
    openIndex(page, browser, INDEXED_TOPIC, ARTICLE_TEXT));
  await test.step("follow the settings panel's Log link, see ingest above topic, open the Item and the Topic page, reload, see a phone-width line wrap with two links at least 44px across and tall, open the Log and Item at their trailing-slash addresses, and delete the Item", () =>
    logFlow(page));
  await test.step("a failed Load more on the Log keeps its rows and Try again reads the next page", () =>
    failedLoadMore(page));
  await settingsSteps(page);
  await test.step("a Pasted Item with a Digest and no Provider shows no Related Items section", () =>
    readerWithoutProvider(page, {
      topic: UNRELATED_TOPIC,
      markdown: ARTICLE_TEXT,
      sentence: SENTENCE,
    }));
  await test.step("the filter rail's Topic link is a 44px target on a phone", () =>
    phoneRailTarget(page, DOTTED_TOPIC));
  await test.step("the page reported no Content-Security-Policy violation and reports a probe", () =>
    expectNoCspViolations(page));
});
