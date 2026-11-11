import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { HighlightResponseSchema } from "../src/core/highlight-contract.ts";
import { NoteResponseSchema } from "../src/core/note-contract.ts";
import { Instance } from "./instance.ts";
import {
  SECRET_KEY,
  firstPickTask,
  pairsOf,
  paste,
  pasteInOrder,
  pickJobs,
  pickTasks,
  saveProvider,
  sentInput,
  until,
} from "./related-fixtures.ts";

const TWELVE = "quasar lattice decoder notes alpha beta gamma delta epsilon zeta eta theta";

const SOURCE_TITLE = `${TWELVE} iota kappa`;

const THREAD = [
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id: "q1",
            title: "A thread",
            author: "asker",
            subreddit: "science",
            selftext: "Nothing to see.",
            created_utc: 1_700_000_000,
            num_comments: 1,
          },
        },
      ],
    },
  },
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t1",
          data: {
            id: "c1",
            author: "someone",
            body: "A quasar decoder remark that explains the lattice trick in detail.",
            parent_id: "t3_q1",
            score: 5,
            created_utc: 1_700_000_100,
            replies: "",
          },
        },
      ],
    },
  },
];

describe("the related pick sends the best-ranked candidates and no text outside the Digest parts", () => {
  let instance: Instance;
  let equal: number[];
  let strong: number;
  let excluded: number[];
  let source: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();

    strong = await paste(instance, "strong", {
      title: "Quasar lattice",
      summary: "The quasar lattice in short.",
      tags: ["quasar"],
    });

    equal = await pasteInOrder(
      instance,
      Array.from({ length: 23 }, (_, index) => [
        `equal-${String(index)}`,
        { title: "Quasar report", summary: "A quasar report." },
      ]),
    );

    const beyondTerms = await paste(instance, "beyond", {
      title: "Iota",
      summary: "Only the thirteenth word.",
    });

    const beyondTag = await paste(instance, "beyond-tag", { title: "Other", tags: ["kappa"] });

    const postTextOnly = await paste(instance, "post", {
      title: "Pasta",
      postText: "quasar lattice decoder",
    });

    const titleOnly = await paste(instance, "title", {
      title: "Pasta again",
      pageTitle: "Quasar lattice decoder",
    });

    const noDigest = await paste(instance, "none", {
      title: "-",
      pageTitle: "Quasar",
      noDigest: true,
    });

    const commentOnly = await paste(instance, "comment", {
      title: "Thread about food",
      url: "https://www.reddit.com/r/science/comments/q1/a_thread/",
      content: JSON.stringify(THREAD),
      kept: ["t1_c1"],
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

    const text = (await instance.detail(highlighted)).postText ?? "";
    const quote = "quasar sentence";
    const start = text.indexOf(quote);

    await instance.read(
      "POST",
      `/api/items/${String(highlighted)}/highlights`,
      HighlightResponseSchema,
      {
        target: { kind: "post" },
        revision: (await instance.detail(highlighted)).highlights.revisions.post,
        selector: {
          exact: quote,
          prefix: text.slice(Math.max(0, start - 32), start),
          suffix: text.slice(start + quote.length, start + quote.length + 32),
          hint: start,
        },
      },
    );

    excluded = [
      beyondTerms,
      beyondTag,
      postTextOnly,
      titleOnly,
      noDigest,
      commentOnly,
      noted,
      highlighted,
    ];

    await saveProvider(instance);

    source = await paste(instance, "source", {
      title: SOURCE_TITLE,
      summary: "The source Summary.",
      tags: ["quasar", "nebula"],
    });
  });

  after(() => instance.close());

  it("sends at most 20 candidates, each Item once, the source never, and ties in Item id order", async () => {
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

  it("matches no Item through its fetched title, post text, comment, Highlight or Note, nor through a word past the 12th", async () => {
    const ids = new Set(
      sentInput((await firstPickTask(instance, source)).inputs).candidates.map(({ id }) => id),
    );

    assert.deepEqual(
      excluded.filter((id) => ids.has(id)),
      [],
    );
  });

  it("records the source's Digest as the input revision and runs one pick job", async () => {
    const [task] = await until(
      () => pickTasks(instance, source),
      (tasks) => tasks.length > 0,
    );

    const [job] = pickJobs(instance, source);

    assert.ok(task !== undefined);
    assert.equal(task.input_revision > 0, true);
    assert.equal(job?.kind, "related_pick");
    assert.equal(pairsOf(instance, source).length, 0);
  });
});
