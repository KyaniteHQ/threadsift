import { type APIRequestContext, expect, test } from "@playwright/test";

import { mainInstance } from "./access.ts";
import { itemOf } from "./api.ts";
import { created, highlightsOf, selectorOf, statuses } from "./highlights.ts";
import { deferJobs, jobsOf, makeJobDue, sweepNow } from "./ingest.ts";
import { keptIds } from "./thread-agent.ts";
import { find, marker, post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, comment, savedThread, sendThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 300_000 });

function asked(quote: string): string {
  return `${quote} Pointing the path at tmpfs fixed it for me.`;
}

function keeping(title: string, keptComments: readonly string[]) {
  return { ...AUTHORED_DIGEST, title, keptComments };
}

const KEEP_BOTH = keeping(AUTHORED_DIGEST.title, ["t1_c1", "t1_c2"]);

const KEEP_SECOND = keeping("Second title", ["t1_c2"]);

function thread(id: string, tree: ReturnType<typeof comment>[]): string {
  return threadJson(post(id, "A post body."), tree);
}

function withHeld(id: string, quote: string): string {
  return thread(id, [
    comment("c0", "reader_0", "A parent remark that the Digest does not keep.", [
      comment("c1", "reader_a", asked(quote)),
    ]),
    comment("c2", "reader_b", "A comment the Digest keeps."),
  ]);
}

function withoutHeld(id: string): string {
  return thread(id, [
    comment("c0", "reader_0", "A parent remark that the Digest does not keep."),
    comment("c2", "reader_b", "A comment the Digest keeps."),
  ]);
}

async function sendAgain(
  request: APIRequestContext,
  id: string,
  content: string,
  digest: ReturnType<typeof keeping>,
) {
  const sent = await sendThread(request, { url: postUrl(id), content, digest });
  expect(sent.status, await sent.response.text()).toBeLessThan(300);
}

async function saveHeld(request: APIRequestContext, id: string, quote: string) {
  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: withHeld(id, quote),
    digest: KEEP_BOTH,
  });

  const { revisions } = await highlightsOf(request, item.id);

  const saved = await created(request, item.id, {
    target: { kind: "comment", commentId: "t1_c1" },
    revision: revisions.comments ?? -1,
    selector: selectorOf(asked(quote), quote),
  });

  expect(saved.status).toBe("attached");
  expect(keptIds(item)).toEqual(["t1_c1", "t1_c2"]);

  return { itemId: item.id, highlightId: saved.id, revision: revisions.comments };
}

test("a highlighted comment that a new Digest stops keeping stays readable under its ancestors, and the Kept count does not change", async ({
  request,
}) => {
  const id = `h${run}`;
  const quote = marker("held");
  const { itemId, highlightId, revision } = await saveHeld(request, id, quote);

  await sendAgain(request, id, withHeld(id, quote), KEEP_SECOND);
  const held = await itemOf(request, itemId);

  expect(held.comments.kept, "the Kept count counts only the Digest's choice").toBe(1);
  expect(held.comments.nodes).toMatchObject([
    { kind: "stub", id: "t1_c0", depth: 0 },
    { kind: "comment", id: "t1_c1", parentId: "t1_c0", depth: 1, body: asked(quote) },
    { kind: "comment", id: "t1_c2", depth: 0 },
  ]);
  expect(statuses(held.highlights)).toEqual([
    {
      id: highlightId,
      status: "attached",
      revision: held.highlights.revisions.comments,
      start: 0,
    },
  ]);
  expect(held.highlights.revisions.comments).not.toBe(revision);
  expect(await find(request, quote)).toEqual([itemId]);
});

test("a later generation without the comment leaves the Highlight gone with its quote, still searchable, and a generation where the quote returns attaches it again", async ({
  request,
}) => {
  const id = `g${run}`;
  const quote = marker("lost");
  const { itemId, highlightId } = await saveHeld(request, id, quote);

  await sendAgain(request, id, withoutHeld(id), KEEP_SECOND);
  const gone = await itemOf(request, itemId);

  expect(keptIds(gone)).toEqual(["t1_c2"]);
  expect(statuses(gone.highlights)).toEqual([
    { id: highlightId, status: "gone", revision: gone.highlights.revisions.comments, start: null },
  ]);
  expect(gone.highlights.items[0]?.selector.exact).toBe(quote);
  expect(await find(request, quote), "an unattached Highlight stays searchable").toEqual([itemId]);

  await sendAgain(request, id, withHeld(id, quote), KEEP_SECOND);
  const back = await itemOf(request, itemId);

  expect(keptIds(back)).toEqual(["t1_c1", "t1_c2"]);
  expect(statuses(back.highlights)).toEqual([
    {
      id: highlightId,
      status: "attached",
      revision: back.highlights.revisions.comments,
      start: 0,
    },
  ]);
});

function racingHighlight(itemId: number, quote: string): string {
  const suffix = asked(quote).slice(quote.length);

  return `
    INSERT INTO highlights (item_id, comment_id, exact, prefix, suffix, hint, projection, created_at, status, start)
      VALUES (${itemId}, 't1_c1', '${quote}', '', '${suffix}', 0, 1, 1700000000000, 'attached', 0);
    INSERT INTO search_parts (item_id, kind, body, highlight_id)
      SELECT ${itemId}, 'highlight', exact, id FROM highlights WHERE item_id = ${itemId}`;
}

async function publishBehindRace(
  request: APIRequestContext,
  itemId: number,
  race: string,
): Promise<void> {
  const instance = mainInstance();
  const trigger = `race_${run}`;

  instance.sql(
    `CREATE TRIGGER ${trigger} AFTER INSERT ON ai_tasks WHEN NEW.executor = 'caller' AND NEW.item_id = ${itemId} AND NOT EXISTS (SELECT 1 FROM highlights WHERE item_id = ${itemId}) BEGIN ${race}; END`,
  );

  try {
    for (const job of jobsOf(itemId, instance, "digest")) makeJobDue(job.id, instance);
    await sweepNow(request, instance);

    await expect
      .poll(async () => (await itemOf(request, itemId)).digestTitle, { timeout: 60_000 })
      .toBe(KEEP_SECOND.title);
  } finally {
    instance.sql(`DROP TRIGGER ${trigger}`);
  }
}

test("a Highlight created between a Digest's snapshot and its commit is checked against the published generation, which no longer has its comment", async ({
  request,
}) => {
  const id = `r${run}`;
  const quote = marker("raced");

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: withHeld(id, quote),
    digest: KEEP_BOTH,
  });

  const { revisions } = await highlightsOf(request, item.id);
  const restore = deferJobs(mainInstance(), "digest");

  try {
    await sendAgain(request, id, withoutHeld(id), KEEP_SECOND);
  } finally {
    restore();
  }

  expect((await highlightsOf(request, item.id)).items).toEqual([]);

  await publishBehindRace(request, item.id, racingHighlight(item.id, quote));

  const published = await itemOf(request, item.id);

  expect(statuses(published.highlights)).toMatchObject([
    { status: "gone", revision: published.highlights.revisions.comments, start: null },
  ]);
  expect(published.highlights.revisions.comments).not.toBe(revisions.comments);
  expect(keptIds(published)).toEqual(["t1_c2"]);
  expect(await find(request, quote)).toEqual([item.id]);
});
