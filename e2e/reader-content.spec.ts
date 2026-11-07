import { expect, test } from "@playwright/test";

import { KEY_POINTS_LABEL, OPEN_LABELS, SUMMARY_LABEL } from "../web/src/reader-text.ts";
import { SOURCE_LABELS } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { ESSAY, ESSAY_AUTHOR, ESSAY_SENTENCE, pasteGutenberg } from "./articles.ts";
import { SENT_DIGEST, agentHeaders, sendDigest } from "./catalog.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { openLibrary, openRow, reader } from "./reader.ts";
import { BOOK, digestOf } from "./search.ts";

const BOOK_LAST_WORDS = "the persons who, by bringing her into Derbyshire";
const DESKTOP_WIDTH = 1440;
const BOOK_TITLE = "Quillfeather ledger";

let screen: FreshScreen;

test.describe.configure({ timeout: 360_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("an Article sent with a caller Digest opens in the Reader with its header, Summary, Key points and post text, and the end of Gutenberg 1342 is there too", async () => {
  const { page, context } = screen;

  const essay = await sendDigest(screen, ESSAY, {
    tags: ["Craft", "Tools"],
    headers: await agentHeaders(screen),
  });

  const {
    last: { item: book },
  } = await pasteGutenberg(context.request, {
    name: "pride-and-prejudice",
    url: BOOK,
    digest: digestOf(BOOK_TITLE, "Regency", "A marmalade summary."),
  });

  await openLibrary(page, DESKTOP_WIDTH, "/", 2);

  await openRow(page, essay.id);
  const head = reader(page).locator(".rd-head");
  await expect(head.locator(".src")).toHaveText(SOURCE_LABELS.article);
  await expect(head).toContainText("stephango.com");
  await expect(head).toContainText(ESSAY_AUTHOR);
  await expect(head).toContainText(/posted /u);
  await expect(head).toContainText(/saved /u);
  await expect(head.locator(".rd-title")).toHaveText(essay.digestTitle ?? "");
  const agent = reader(page).getByRole("complementary", { name: SUMMARY_LABEL });
  await expect(agent.locator(".rd-topic")).toHaveText(SENT_DIGEST.topic);
  await expect(agent.locator(".tag")).toHaveCount(2);
  await expect(agent.locator(".rd-summary")).toHaveText(SENT_DIGEST.summary);
  await expect(agent.getByRole("heading", { name: KEY_POINTS_LABEL })).toBeVisible();
  await expect(agent.locator(".rd-points li")).toHaveText(SENT_DIGEST.keyPoints);
  await expect(page.locator(".md")).toContainText(ESSAY_SENTENCE);

  const sourceTab = context.waitForEvent("page");
  await reader(page).getByRole("link", { name: OPEN_LABELS.article }).click();
  const source = await sourceTab;
  await expect(source).toHaveURL(new RegExp(`^${ESSAY.replaceAll(".", "\\.")}/?$`, "u"));
  await source.close();

  await openRow(page, book.id);
  await expect(reader(page).locator(".rd-title")).toHaveText(BOOK_TITLE);
  await expect(reader(page).locator(".rd-summary")).toHaveText("A marmalade summary.");
  await expect(page.locator(".md")).toContainText("Pride and Prejudice");
  await expect(page.locator(".md")).toContainText(BOOK_LAST_WORDS);
});
