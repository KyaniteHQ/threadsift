import { expect, test } from "@playwright/test";

import { listAll } from "./api.ts";
import { configuredExtensionSession } from "./extension-session.ts";
import { ACTION_TEXT } from "./extension.ts";
import { POST_ID, waitForRedditTurn } from "./reddit.ts";

test.describe.configure({ timeout: 300_000 });

const THREAD = `https://www.reddit.com/r/all/comments/${POST_ID}/`;

const session = configuredExtensionSession();

test("on a Reddit thread the Extension asks the tab for the thread's .json, and when Reddit refuses it the save ends instead of waiting", async () => {
  const { library, extension } = session();
  await waitForRedditTurn(THREAD);

  const tab = await extension.tab(THREAD);
  const asked = tab.waitForResponse((response) => response.url().includes("/.json?"));
  const popup = await extension.press(tab);
  const answer = await asked;

  expect(answer.url()).toBe(`${THREAD}.json?limit=500&raw_json=1`);
  expect(answer.status(), "Reddit's answer to a tab that is not signed in").toBe(403);

  const ended = new Set<string>([ACTION_TEXT.saved, ACTION_TEXT.failed]);

  await expect.poll(async () => ended.has(await popup.status()), { timeout: 60_000 }).toBe(true);

  const saved = await listAll(library.owner);
  const showsSaved = (await popup.status()) === ACTION_TEXT.saved;

  expect(saved.length).toBe(showsSaved ? 1 : 0);
});
