import { expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { pasteLink } from "./links.ts";
import { waitForRedditTurn } from "./reddit.ts";

const POST_ID = "2a4qo6";
const POST_URL = `https://reddit.com/r/all/comments/${POST_ID}/`;
const POST_TITLE = "Wallabag - A 'read it later' app similar like Instapaper or Pocket";
const COMMENT_URL = `${POST_URL}_/cisdfvv/`;

const OTHER_POST_ID = "1abcde";
const OTHER_POST_TITLE = "Facebook Backs Away Quietly From Its CISPA Support";
const WRONG_SUBREDDIT_PATH = `https://www.reddit.com/r/selfhosted/comments/${OTHER_POST_ID}/x/`;

const POST_FORMS = [
  `https://www.reddit.com/r/selfhosted/comments/${POST_ID}/wallabag_a_read_it_later_app_similar_like/`,
  `https://old.reddit.com/r/selfhosted/comments/${POST_ID}/another_slug/`,
  `https://new.reddit.com/r/selfhosted/comments/${POST_ID}/x/`,
  `https://m.reddit.com/r/selfhosted/comments/${POST_ID}/x/`,
  `https://np.reddit.com/r/selfhosted/comments/${POST_ID}/`,
  `https://www.reddit.com/user/tamale_uk/comments/${POST_ID}/x/`,
  `https://redd.it/${POST_ID}`,
  `https://www.reddit.com/r/typescript/comments/${POST_ID}/x/`,
];

test("a pasted Reddit post saves oEmbed's title, author and subreddit, whatever subreddit the path names", async ({
  page,
  request,
}) => {
  const url = `https://reddit.com/r/all/comments/${OTHER_POST_ID}/`;
  await page.goto("/");
  await pasteLink(page, WRONG_SUBREDDIT_PATH);

  const saved = (await listAll(request)).find((item) => item.normalizedUrl === url);

  expect(saved).toMatchObject({
    source: "reddit",
    kind: "reddit-post",
    title: OTHER_POST_TITLE,
    author: "UlkeshNaranek",
    community: "evolutionReddit",
    originalUrl: WRONG_SUBREDDIT_PATH,
  });

  const row = page.locator(`.it[data-key="${saved?.id}"]`);
  await expect(row.locator(".it-open")).toContainText(OTHER_POST_TITLE);
  await expect(row.locator(".it-meta > span").nth(0)).toHaveText("Reddit");
  await expect(row.locator(".it-meta > span").nth(1)).toHaveText("r/evolutionReddit");
});

test("one Reddit post pasted 8 ways is one Item, and its comments are Items of their own", async ({
  request,
}) => {
  test.setTimeout(120_000);
  const ids = new Set<number>();

  for (const url of POST_FORMS) {
    const { body } = await postLink(request, url);
    expect(body.fetch, url).toBe("ok");
    expect(body.item.normalizedUrl, url).toBe(POST_URL);
    expect(body.item.title, url).toBe(POST_TITLE);
    ids.add(body.item.id);
  }

  expect(ids.size).toBe(1);

  const comment = await postLink(
    request,
    `https://www.reddit.com/r/selfhosted/comments/${POST_ID}/wallabag_a_read_it_later_app_similar_like/cisdfvv/`,
  );

  const sameComment = await postLink(
    request,
    `https://old.reddit.com/r/selfhosted/comments/${POST_ID}/other_slug/cisdfvv/?context=3`,
  );

  const otherComment = await postLink(
    request,
    `https://www.reddit.com/r/selfhosted/comments/${POST_ID}/x/cirgrie/`,
  );

  expect(comment.body.item).toMatchObject({
    kind: "reddit-comment",
    normalizedUrl: COMMENT_URL,
    community: "selfhosted",
  });

  expect(sameComment.body.item.id).toBe(comment.body.item.id);
  expect(otherComment.body.item.id).not.toBe(comment.body.item.id);
  expect(comment.body.item.id).not.toBe([...ids][0]);

  const ofThePost = (await listAll(request)).filter((item) => item.normalizedUrl.includes(POST_ID));
  expect(ofThePost.map((item) => item.normalizedUrl).toSorted()).toEqual(
    [POST_URL, COMMENT_URL, `${POST_URL}_/cirgrie/`].toSorted(),
  );
});

test("a short link to a Reddit post gives the post's Item, and one to an X post gives an X Item without a title", async ({
  request,
}) => {
  const post = await postLink(request, POST_FORMS[0] ?? "");
  await waitForRedditTurn("https://tinyurl.com/264mqbvn");
  const viaShortLink = await postLink(request, "https://tinyurl.com/264mqbvn");

  expect(viaShortLink.body.item.id).toBe(post.body.item.id);
  expect(viaShortLink.body.item).toMatchObject({
    source: "reddit",
    normalizedUrl: POST_URL,
    title: POST_TITLE,
  });

  const x = await postLink(request, "https://tinyurl.com/283xytr8");
  expect(x.body.item).toMatchObject({
    source: "x",
    kind: "x-post",
    normalizedUrl: "https://x.com/jack/status/20",
    title: null,
    fetchedAt: null,
  });
  expect(x.body.fetch).toBe("ok");
});
