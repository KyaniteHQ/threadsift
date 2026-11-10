import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { itemOf } from "./api.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  generationOf,
  savedThread,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const WORDS = Array.from({ length: 140 }, (_, index) => `word${index}`).join(" ");

test("a page for a Reddit link whose Item holds a saved thread answers 409 and leaves the thread, its Kept comments and its text, also after a Digest sent with the page", async ({
  request,
}) => {
  const id = `k${run}`;
  const url = postUrl(id);

  const { item } = await savedThread(request, {
    url,
    content: threadJson(post(id, "The post text saved from the JSON."), [
      comment("c1", "reader_a", "A substantive remark that sets up the fix.", [
        comment("c2", "reader_b", "A reply worth keeping, with the command that worked."),
      ]),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_c2"] },
  });

  const before = await itemOf(request, item.id);
  const rows = commentRows(mainInstance(), item.id);

  expect(before.comments).toMatchObject({ received: 2, kept: 1 });

  const refused = await request.post("/api/items", {
    data: { url, page: { markdown: WORDS, title: "The rendered page" }, digest: AUTHORED_DIGEST },
  });

  expect(refused.status()).toBe(409);
  expect(z.object({ error: z.string() }).parse(await refused.json()).error).toBe(
    "page: the saved thread stays",
  );
  expect(await itemOf(request, item.id)).toEqual(before);
  expect(commentRows(mainInstance(), item.id)).toEqual(rows);
  expect(generationOf(mainInstance(), item.id)).toBe(1);
});
