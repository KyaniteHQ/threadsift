import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { itemOf, settled } from "./api.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import {
  AUTHORED_DIGEST,
  comment,
  commentRows,
  generationOf,
  savedThread,
  threadHeaders,
  threadJson,
} from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

const SAVED = z.object({ item: z.object({ id: z.number() }) });
const REFUSAL = z.object({ error: z.string() });

const WAITING = "fill: no Item with this link is waiting for its thread";

function thread(id: string, text: string) {
  return threadJson(post(id, text), [
    comment("c1", "reader_a", "A substantive remark that sets up the fix.", [
      comment("c2", "reader_b", "A reply worth keeping, with the command that worked."),
    ]),
  ]);
}

async function shortPage(request: APIRequestContext, id: string) {
  const response = await request.post("/api/items", {
    data: { url: postUrl(id), page: { markdown: "Only a few words.", title: "A shared post" } },
  });

  expect(response.status(), await response.text()).toBe(201);

  return settled(request, SAVED.parse(await response.json()).item.id);
}

function fill(request: APIRequestContext, id: string, content: string) {
  return request.post("/api/items", {
    data: {
      url: postUrl(id),
      content,
      fill: true,
      digest: { ...AUTHORED_DIGEST, keptComments: ["t1_c2"] },
    },
  });
}

test("a fill saves the thread of a Reddit Item that has none, once, and the Item stops being fillable", async ({
  request,
}) => {
  const id = `fa${run}`;
  const waiting = await shortPage(request, id);

  expect(waiting).toMatchObject({ source: "reddit", kind: "reddit-post", fillable: true });
  expect(threadHeaders(mainInstance(), waiting.id)).toEqual([]);

  const first = await fill(request, id, thread(id, "The post text from the thread."));

  expect(first.status(), await first.text()).toBe(200);

  const filled = await settled(request, waiting.id);

  expect(filled).toMatchObject({ fillable: false, postText: "The post text from the thread." });
  expect(filled.comments).toMatchObject({ received: 2, kept: 1 });
  expect(threadHeaders(mainInstance(), waiting.id)).toHaveLength(1);

  const before = await itemOf(request, waiting.id);
  const rows = commentRows(mainInstance(), waiting.id);
  const generation = generationOf(mainInstance(), waiting.id);

  const again = await fill(request, id, thread(id, "A different text that must not replace it."));

  expect(again.status()).toBe(409);
  expect(REFUSAL.parse(await again.json()).error).toBe(WAITING);
  expect(await itemOf(request, waiting.id)).toEqual(before);
  expect(commentRows(mainInstance(), waiting.id)).toEqual(rows);
  expect(generationOf(mainInstance(), waiting.id)).toBe(generation);
});

test("a fill leaves an Item that already holds a thread alone, also when no Digest was published for it", async ({
  request,
}) => {
  const kept = `fb${run}`;

  const { item } = await savedThread(request, {
    url: postUrl(kept),
    content: thread(kept, "The saved thread."),
    digest: AUTHORED_DIGEST,
  });

  const bare = `fc${run}`;

  const { item: noDigest } = await savedThread(request, {
    url: postUrl(bare),
    content: threadJson(post(bare, "A thread whose Digest never published.", 0), []),
  });

  for (const [id, saved] of [
    [kept, item],
    [bare, noDigest],
  ] as const) {
    expect(saved.fillable, id).toBe(false);

    const before = await itemOf(request, saved.id);
    const rows = commentRows(mainInstance(), saved.id);
    const refused = await fill(request, id, thread(id, "Another text."));

    expect(refused.status(), id).toBe(409);
    expect(await itemOf(request, saved.id), id).toEqual(before);
    expect(commentRows(mainInstance(), saved.id), id).toEqual(rows);
    expect(generationOf(mainInstance(), saved.id), id).toBe(1);
  }
});

test("a fill for a link that no Item has answers 409 and saves nothing", async ({ request }) => {
  const id = `fd${run}`;
  const refused = await fill(request, id, thread(id, "A thread for nobody."));

  expect(refused.status()).toBe(409);
  expect(REFUSAL.parse(await refused.json()).error).toBe(WAITING);

  const listed = await request.get(`/api/items?url=${encodeURIComponent(postUrl(id))}`);

  expect(z.object({ items: z.array(z.unknown()) }).parse(await listed.json()).items).toEqual([]);
});

test("two fills sent together save the thread once", async ({ request }) => {
  const id = `fe${run}`;
  const waiting = await shortPage(request, id);

  const answers = await Promise.all([
    fill(request, id, thread(id, "The first text.")),
    fill(request, id, thread(id, "The second text.")),
  ]);

  expect(answers.map((answer) => answer.status()).toSorted((a, b) => a - b)).toEqual([200, 409]);
  expect(threadHeaders(mainInstance(), waiting.id)).toHaveLength(1);
  expect(await settled(request, waiting.id)).toMatchObject({ fillable: false });
});

test("a fill takes a thread only: with a page or with no content it answers 400 and changes nothing", async ({
  request,
}) => {
  const id = `ff${run}`;
  const waiting = await shortPage(request, id);
  const before = await itemOf(request, waiting.id);

  const withPage = await request.post("/api/items", {
    data: {
      url: postUrl(id),
      fill: true,
      page: { markdown: "Another few words.", title: "A page" },
    },
  });

  const bare = await request.post("/api/items", { data: { url: postUrl(id), fill: true } });

  expect(withPage.status()).toBe(400);
  expect(bare.status()).toBe(400);
  expect(REFUSAL.parse(await bare.json()).error).toContain("fill:");
  expect(await itemOf(request, waiting.id)).toEqual(before);
});
