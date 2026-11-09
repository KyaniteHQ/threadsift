import { expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { postLinkRaw } from "./api.ts";
import { deferJobs } from "./ingest.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import { comment, savedThread, threadJson } from "./threads.ts";

const Closed = z.array(
  z.object({ state: z.string(), claimExpires: z.number().nullable(), staleRequeues: z.number() }),
);

test("a thread saved while a fetch job is open closes that job like a finished job does", async ({
  request,
}) => {
  const id = `j${run}`;
  const instance = mainInstance();
  const release = deferJobs(instance, "fetch");
  const pasted = await postLinkRaw(request, postUrl(id));

  release();
  instance.sql(
    `UPDATE jobs SET stale_requeues = 2, claim_expires = 1 WHERE item_id = ${pasted.body.item.id} AND kind = 'fetch'`,
  );

  await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, "A post saved by the Extension."), [
      comment("j1", "reader_a", "A comment."),
    ]),
  });

  expect(
    instance.query(
      `SELECT state, claim_expires AS claimExpires, stale_requeues AS staleRequeues FROM jobs WHERE item_id = ${pasted.body.item.id} AND kind = 'fetch'`,
      Closed,
    ),
  ).toEqual([{ state: "done", claimExpires: null, staleRequeues: 0 }]);
});
