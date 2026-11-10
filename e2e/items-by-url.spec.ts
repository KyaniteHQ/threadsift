import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { SUBREDDIT, normalized, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, comment, savedThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const Listed = z.object({
  items: z.array(z.object({ id: z.number(), normalizedUrl: z.string() })),
});

async function itemsAt(request: APIRequestContext, url: string, extra = "") {
  const response = await request.get(`/api/items?url=${encodeURIComponent(url)}${extra}`);

  expect(response.status(), await response.text()).toBe(200);

  return Listed.parse(await response.json()).items;
}

async function saved(request: APIRequestContext, id: string) {
  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, "A post that the url filter should find."), [
      comment("c1", "reader_a", "A remark that keeps the thread non-empty."),
    ]),
    digest: AUTHORED_DIGEST,
  });

  return item;
}

test("the url filter finds one Item by its normalized URL, whatever form of the link is given, and no other Item", async ({
  request,
}) => {
  const id = `ua${run}`;
  const wanted = await saved(request, id);
  await saved(request, `ub${run}`);

  const forms = [
    postUrl(id),
    `https://old.reddit.com/r/elsewhere/comments/${id}/another_slug/?utm_source=share#top`,
    `https://m.reddit.com/user/someone/comments/${id}/x/`,
    normalized(id),
  ];

  for (const form of forms) {
    const found = await itemsAt(request, form);

    expect(
      found.map(({ id: foundId }) => foundId),
      form,
    ).toEqual([wanted.id]);
    expect(found[0]?.normalizedUrl, form).toBe(normalized(id));
  }
});

test("the url filter answers nothing for a link that no Item has, and combines with the other filters", async ({
  request,
}) => {
  const id = `uc${run}`;
  await saved(request, id);

  expect(await itemsAt(request, normalized(`other${run}`))).toEqual([]);
  expect(await itemsAt(request, `https://www.reddit.com/r/${SUBREDDIT}/comments/${id}x/`)).toEqual(
    [],
  );
  expect(await itemsAt(request, `https://example.invalid/${id}`)).toEqual([]);
  expect(await itemsAt(request, postUrl(id), "&source=x")).toEqual([]);
  expect(await itemsAt(request, postUrl(id), "&source=reddit")).toHaveLength(1);
});

test("the url filter refuses a value that is not an absolute http or https link", async ({
  request,
}) => {
  for (const value of ["nope", "ftp://example.com/a", ""]) {
    const response = await request.get(`/api/items?url=${encodeURIComponent(value)}`);

    expect(response.status(), value).toBe(400);
  }
});
