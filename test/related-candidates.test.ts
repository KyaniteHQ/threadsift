import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { REDDIT_THREAD, paste, pasteInOrder, saveProvider, until } from "./library-fixtures.ts";
import { keepPassage } from "./lost-highlight-fixtures.ts";
import { pairsOf } from "./related-fixtures.ts";
import { firstPickTask, pickTasks, sentInput } from "./related-pick-fixtures.ts";
import { restoreLibrary } from "./restore-fixtures.ts";

const TWELVE = "quasar lattice decoder notes alpha beta gamma delta epsilon zeta eta theta";

const SOURCE_TITLE = `${TWELVE} iota kappa`;

const TaskIdSchema = z.object({ task_id: z.number() });

const FIRST_TASK_ID_FLOOR = 1_000_000;

describe("the related pick sends the best-ranked candidates", () => {
  let instance: Instance;
  let equal: number[];
  let strong: number;
  let source: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();

    const from = await Instance.start();
    try {
      await from.setUp();
      from.database.exec("delete from sqlite_sequence where name = 'ai_tasks'");
      from.database.exec(
        "insert into sqlite_sequence (name, seq) values ('ai_tasks', ?)",
        FIRST_TASK_ID_FLOOR,
      );

      const undigested = await paste(from, "undigested", { title: "-", noDigest: true });

      strong = await paste(from, "strong", {
        title: "Quasar lattice",
        summary: "The quasar lattice in short.",
        tags: ["quasar"],
      });

      from.database.exec(
        "insert into item_tags (item_id, tag_id) select ?, id from tags where key = 'quasar'",
        undigested,
      );
      await restoreLibrary({ from, into: instance });
      assert.deepEqual(
        instance.database.rows(
          z.object({ body: z.string() }),
          "select body from search_parts where item_id = ? and kind = 'tags' and not exists (select 1 from digests where item_id = ?)",
          undigested,
          undigested,
        ),
        [{ body: "quasar" }],
      );
    } finally {
      await from.close();
    }

    equal = await pasteInOrder(
      instance,
      Array.from({ length: 23 }, (_, index) => [
        `equal-${String(index)}`,
        { title: "Quasar report", summary: "A quasar report." },
      ]),
    );

    await saveProvider(instance);

    source = await paste(instance, "source", {
      title: SOURCE_TITLE,
      summary: "The source Summary.",
      tags: ["quasar", "nebula"],
    });

    const [digest] = instance.database.rows(
      TaskIdSchema,
      "select task_id from digests where item_id = ?",
      source,
    );

    assert.ok(
      digest !== undefined && digest.task_id > FIRST_TASK_ID_FLOOR,
      "the ai_tasks id sequence was not seeded above every Item id",
    );
  });

  after(() => instance.close());

  it("sends at most 20 candidates, each digested Item once, skipping a matching restored Tag on an undigested Item, with ties in Item id order", async () => {
    const task = await firstPickTask(instance, source);
    const sent = sentInput(task.inputs);
    const ids = sent.candidates.map(({ id }) => id);

    assert.equal(sent.source.id, source);
    assert.deepEqual(sent.source.tags, ["quasar", "nebula"]);
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    assert.equal(ids.includes(source), false);
    assert.equal(ids[0], strong);
    assert.deepEqual(
      ids.filter((id) => equal.includes(id)),
      equal.slice(0, 19),
    );
  });

  it("records the source's Digest task id as the input revision", async () => {
    const [task] = await until(
      `Item ${String(source)} has a Related pick task`,
      () => pickTasks(instance, source),
      (tasks) => tasks.length > 0,
    );

    const [digest] = instance.database.rows(
      TaskIdSchema,
      "select task_id from digests where item_id = ?",
      source,
    );

    assert.ok(task !== undefined);
    assert.ok(digest !== undefined);
    assert.equal(task.input_revision, digest.task_id);
    assert.equal(pairsOf(instance, source).length, 0);
  });
});

describe("the related pick matches only the Digest parts of an Item that has a Digest, through the first 12 words", () => {
  let instance: Instance;
  let inside: number;
  let source: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();

    inside = await paste(instance, "inside", {
      title: "Quasar report",
      summary: "A longer quasar report that mentions the word once among many other words.",
    });

    await paste(instance, "beyond", {
      title: "Iota",
      summary: "Only the thirteenth word.",
    });

    await paste(instance, "beyond-tag", { title: "Other", tags: ["kappa"] });

    await paste(instance, "post", {
      title: "Pasta",
      postText: "quasar lattice decoder",
    });

    await paste(instance, "title", {
      title: "Pasta again",
      pageTitle: "Quasar lattice decoder",
    });

    await paste(instance, "comment", {
      title: "Thread about food",
      url: "https://www.reddit.com/r/science/comments/q1/a_thread/",
      content: JSON.stringify(REDDIT_THREAD),
      kept: ["c1"],
    });

    const noted = await paste(instance, "noted", {
      title: "Pasta with a note",
      postText:
        "A long enough introduction stands before the quasar sentence, and a long enough conclusion follows it here.",
    });

    const highlighted = await paste(instance, "highlighted", {
      title: "Pasta with a highlight",
      postText:
        "A long enough introduction stands before the quasar sentence, and a long enough conclusion follows it here.",
    });

    const reader = await instance.detail(noted);

    await instance.read("PUT", `/api/items/${String(noted)}/note`, NoteResponseSchema, {
      body: "quasar lattice decoder",
      revision: reader.note.revision,
    });

    await keepPassage(instance, highlighted, "quasar sentence");

    await saveProvider(instance);

    source = await paste(instance, "source", {
      title: SOURCE_TITLE,
      summary: "The source Summary.",
      tags: ["quasar", "nebula"],
    });
  });

  after(() => instance.close());

  it("sends the matching Item and no Item that matches only through its fetched title, post text, comment, Highlight, Note or a word past the 12th", async () => {
    const sent = sentInput((await firstPickTask(instance, source)).inputs);

    assert.deepEqual(
      sent.candidates.map(({ id }) => id),
      [inside],
    );
  });
});
