import { expect, test } from "@playwright/test";
import { z } from "zod";

import { admit, emptyRequest } from "../src/core/thread-answers.ts";
import { mainInstance } from "./access.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  more,
  savedThread,
  sendThread,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const REQUEST_CAP_BYTES = 8 * 1024 * 1024;

const QUOTES_PER_BODY = 700_000;

const HIDDEN = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;

const POST_ID = `r${run}`;

const THREAD = post(POST_ID, "A post whose hidden replies are large.");

const MAIN = threadJson(THREAD, [
  comment("c1", "reader_a", "The first comment explains the setup in two sentences.", [
    more(...HIDDEN),
  ]),
]);

function answerFor(id: string): string {
  return threadJson(THREAD, [comment(id, "reader_b", '"'.repeat(QUOTES_PER_BODY))], "t1_c1");
}

const Kinds = z.array(z.object({ id: z.string(), kind: z.string() }));

function fitting(url: string, answers: readonly string[]) {
  const taken: string[] = [];
  let sent = admit(emptyRequest(url), MAIN);

  for (const answer of answers) {
    const next = sent === null ? null : admit(sent, answer);

    if (next === null) break;

    sent = next;
    taken.push(answer);
  }

  return { taken, bytes: sent?.bytes };
}

test("the answers that fit the request cap are saved, one more is refused, and the stubs of the answers left out stay as stubs", async ({
  request,
}) => {
  const url = postUrl(POST_ID);
  const answers = HIDDEN.map((id) => answerFor(id));
  const { taken, bytes } = fitting(url, answers);

  expect(taken, "answers that fit beside the first").toHaveLength(2);
  expect(bytes).toBeLessThanOrEqual(REQUEST_CAP_BYTES);
  expect(Buffer.byteLength(JSON.stringify({ url, content: [MAIN, ...taken] }))).toBe(bytes);

  const over = await sendThread(request, { url, content: [MAIN, ...taken, answers[2] ?? ""] });

  expect(over.status).toBe(413);
  expect(z.object({ error: z.string() }).parse(await over.response.json()).error).toBe(
    "The request body is larger than 8 MiB",
  );

  const { item } = await savedThread(request, {
    url,
    content: [MAIN, ...taken],
    digest: AUTHORED_DIGEST,
  });

  const rows = mainInstance().query(
    `SELECT id, kind FROM reddit_comments WHERE item_id = ${item.id} AND generation = (SELECT generation FROM items WHERE id = ${item.id}) ORDER BY position`,
    Kinds,
  );

  expect(rows).toEqual([
    { id: "t1_c1", kind: "comment" },
    { id: "t1_p1", kind: "comment" },
    { id: "t1_p2", kind: "comment" },
    { id: "more_3", kind: "more" },
  ]);
  expect(commentRows(mainInstance(), item.id)).toHaveLength(4);
});
