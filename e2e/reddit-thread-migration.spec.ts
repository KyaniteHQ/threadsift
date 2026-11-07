import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, freshDir, newCode } from "./access.ts";
import { itemOf } from "./api.ts";
import { ownerOf } from "./files.ts";
import { type Seed, launchSeeded, migrationsBefore } from "./seeded.ts";
import { post } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, comment, savedThread, threadJson } from "./threads.ts";

const OLD_DIGEST = JSON.stringify({
  title: "Older digest",
  topic: "Reading",
  tags: ["Older"],
  summary: "An older summary.",
  keyPoints: ["An older point."],
});

const OLD_POST = "https://reddit.com/r/all/comments/oldpost/";
const OLD_EMPTY = "https://reddit.com/r/all/comments/oldempty/";

const BEFORE_REDDIT_THREADS: Seed = {
  files: migrationsBefore("0017"),
  sql: `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title, author, community, post_text, status, fetch_result, fetched_at) VALUES
    ('reddit', 'reddit-post', '${OLD_POST}', '${OLD_POST}', 1111, 'An older Reddit post', 'old_author', 'oldsub', 'Older post text.', 'ready', 'ok', 1500),
    ('reddit', 'reddit-post', '${OLD_EMPTY}', '${OLD_EMPTY}', 2222, 'Another older post', 'old_author', 'oldsub', 'Older text.', 'ready', 'ok', 2500);
  INSERT INTO ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, result) VALUES
    (1, 'digest', 'input one', 1, 'caller', 1, 11, 'done', '{}'),
    (2, 'digest', 'input two', 1, 'caller', 1, 22, 'done', '{}');
  INSERT INTO digests (item_id, digest, title, topic, task_id, generation, created_at) VALUES
    (1, '${OLD_DIGEST}', 'Older digest', 'Reading', 1, 0, 1),
    (2, '${OLD_DIGEST}', 'Older digest', 'Reading', 2, 0, 2)`,
};

const Count = z.array(z.object({ n: z.number() }));

async function expectOlderRead(owner: APIRequestContext, instance: Instance) {
  expect(await itemOf(owner, 1)).toMatchObject({
    digestTitle: "Older digest",
    digest: { summary: "An older summary.", keyPoints: ["An older point."], tags: [] },
    comments: { reported: null, received: 0, kept: 0, nodes: [] },
  });

  const tables = instance.query(
    "SELECT count(*) AS n FROM reddit_comments UNION ALL SELECT count(*) FROM reddit_threads",
    Count,
  );

  expect(tables.map(({ n }) => n)).toEqual([0, 0]);
}

test("Digests stored before the Kept comments still read, a refresh with a thread replaces one, and a refresh that leaves nothing to Digest marks the other as not updated", async () => {
  test.setTimeout(240_000);
  const code = newCode();
  const instance = launchSeeded(freshDir(), code, BEFORE_REDDIT_THREADS);

  try {
    const owner = await ownerOf(instance, code, "m".repeat(20));
    await expectOlderRead(owner, instance);

    const replaced = await savedThread(owner, {
      url: OLD_POST,
      content: threadJson(post("oldpost", "A new post text."), [
        comment("o1", "reader_a", "First-hand experience worth keeping."),
      ]),
      digest: { ...AUTHORED_DIGEST, keptComments: ["t1_o1"] },
    });

    expect(replaced.item).toMatchObject({
      digestTitle: AUTHORED_DIGEST.title,
      postText: "A new post text.",
    });
    expect(replaced.item.comments).toMatchObject({ received: 1, kept: 1 });

    const emptied = await savedThread(owner, {
      url: OLD_EMPTY,
      content: threadJson(post("oldempty", ""), [comment("o2", "reader_b", "+1")]),
    });

    expect(emptied.item).toMatchObject({
      digestTitle: "Older digest",
      digestOutcome: "failed",
      status: "ready",
      postText: null,
    });
    expect(emptied.item.comments).toMatchObject({ received: 0, kept: 0, nodes: [] });
    await owner.dispose();
  } finally {
    instance.stop();
  }
});
