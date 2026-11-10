import { expect, test } from "@playwright/test";

import { itemOf } from "./api.ts";
import { configuredExtensionSession, ready, savedItemId } from "./extension-session.ts";
import { ACTION_TEXT } from "./extension.ts";
import { POST_ID, waitForRedditTurn } from "./reddit.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  savedThread,
  threadHeaders,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const THREAD = `https://www.reddit.com/r/all/comments/${POST_ID}/`;

const session = configuredExtensionSession();

async function pressOnThread() {
  const { extension } = session();

  await waitForRedditTurn(THREAD);

  const tab = await extension.tab(THREAD);
  const asked = tab.waitForResponse((response) => response.url().includes("/.json?"));
  const popup = await extension.press(tab);
  const answer = await asked;

  expect(answer.url()).toBe(`${THREAD}.json?limit=500&raw_json=1`);

  const usable =
    answer.status() === 200 && (answer.headers()["content-type"] ?? "").includes("json");

  return { popup, usable, status: answer.status() };
}

test("when Reddit answers the thread's .json, the Extension saves the thread from it", async () => {
  const { library } = session();
  const { owner, instance } = library;
  const { popup, usable, status } = await pressOnThread();

  test.skip(
    !usable,
    `not run: Reddit answered the tab's .json with ${status}, so the thread save was not reached`,
  );

  const id = await savedItemId(popup, instance.url);
  const item = await ready(owner, id);

  expect(item).toMatchObject({
    source: "reddit",
    kind: "reddit-post",
    fetch: "ok",
    normalizedUrl: `https://reddit.com/r/all/comments/${POST_ID}/`,
  });
  expect(threadHeaders(instance, id)).toHaveLength(1);
  expect(item.comments.received, "comments saved from the JSON").toBeGreaterThan(0);
});

test("when Reddit refuses the thread's .json, the Extension sends the rendered page, which the server refuses for an Item that holds a saved thread", async () => {
  const { library } = session();
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
  const { popup, usable, status } = await pressOnThread();

  test.skip(
    usable,
    `not run: Reddit answered the tab's .json with ${status}, so the fallback was not reached`,
  );

  await expect.poll(() => popup.status(), { timeout: 60_000 }).toBe(ACTION_TEXT.threadKept);

  expect(await itemOf(owner, item.id)).toEqual(before);
  expect(commentRows(instance, item.id)).toEqual(rows);
});
