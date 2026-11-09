import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { postUrl, post, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, comment, savedThread, threadJson } from "./threads.ts";

const Published = z.object({ keptComments: z.array(z.string()) });

function kept(json: string | undefined): string[] {
  return Published.parse(JSON.parse(json ?? "{}")).keptComments;
}

const Stored = z.array(z.object({ digest: z.string(), result: z.string() }));

test("a caller-sent Digest keeps only the comments that were stored and eligible, once each, in the Digest and in its task", async ({
  request,
}) => {
  const id = `q${run}`;

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, "A post with two comments."), [
      comment("k1", "reader_a", "A comment worth keeping."),
      comment("k2", "reader_b", "Another comment worth keeping."),
    ]),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_k2", "t1_gone", "t1_k1", "t1_k2"] },
  });

  const [row] = mainInstance().query(
    `SELECT d.digest AS digest, t.result AS result FROM digests d JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${item.id}`,
    Stored,
  );

  expect(kept(row?.digest)).toEqual(["t1_k2", "t1_k1"]);
  expect(kept(row?.result)).toEqual(["t1_k2", "t1_k1"]);
  expect(item.comments).toMatchObject({ kept: 2 });
});
