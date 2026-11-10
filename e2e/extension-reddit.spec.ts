import { expect, test } from "@playwright/test";

import { itemOf } from "./api.ts";
import { configuredExtensionSession } from "./extension-session.ts";
import { ACTION_TEXT } from "./extension.ts";
import { POST_ID, waitForRedditTurn } from "./reddit.ts";
import { AUTHORED_DIGEST, comment, commentRows, savedThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const THREAD = `https://www.reddit.com/r/all/comments/${POST_ID}/`;

const session = configuredExtensionSession();

test("on a Reddit thread the Extension asks the tab for the thread's .json, and when Reddit refuses it sends the rendered page, which the server refuses for an Item that holds a saved thread", async () => {
  const { library, extension } = session();
  const { owner, instance } = library;

  const { item } = await savedThread(owner, {
    url: THREAD,
    content: threadJson(
      {
        id: POST_ID,
        title: "A thread saved from its JSON",
        author: "author_one",
        subreddit: "all",
        selftext: "The post text saved from the JSON.",
        reported: 1,
      },
      [comment("c1", "reader_a", "A substantive remark that stays saved.")],
    ),
    digest: AUTHORED_DIGEST,
  });

  const before = await itemOf(owner, item.id);
  const rows = commentRows(instance, item.id);

  await waitForRedditTurn(THREAD);

  const tab = await extension.tab(THREAD);
  const asked = tab.waitForResponse((response) => response.url().includes("/.json?"));
  const popup = await extension.press(tab);
  const answer = await asked;

  expect(answer.url()).toBe(`${THREAD}.json?limit=500&raw_json=1`);
  expect(answer.status(), "Reddit's answer to a tab that is not signed in").toBe(403);

  await expect.poll(() => popup.status(), { timeout: 60_000 }).toBe(ACTION_TEXT.threadKept);

  expect(await itemOf(owner, item.id)).toEqual(before);
  expect(commentRows(instance, item.id)).toEqual(rows);
});
