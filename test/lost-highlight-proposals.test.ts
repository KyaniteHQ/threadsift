import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { tagId } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  ColumnsSchema,
  listedIds,
  keepLostHighlight,
  keepPassage,
  proposeLost,
  readPage,
  textHolding,
} from "./lost-highlight-fixtures.ts";
import { seedProposal } from "./proposal-seed.ts";
import { SECRET_KEY, paste, rows } from "./related-fixtures.ts";
import { topicId } from "./topic-accept-fixtures.ts";

const highlightColumns = (instance: Instance) =>
  rows(instance, ColumnsSchema, "select * from highlights order by id");

describe("lost-Highlight Proposals beside Tag and Topic rows", () => {
  let instance: Instance;
  let gone: { itemId: number; highlightId: number };
  let ambiguous: { itemId: number; highlightId: number };
  let lostIds: readonly number[];
  let bareId: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await paste(instance, "one", { title: "One", topic: "ML", tags: ["ml", "llm"] });
    await paste(instance, "two", {
      title: "Two",
      topic: "Machine learning",
      tags: ["llm", "llms"],
    });
    seedProposal(
      instance,
      "tag-merge",
      { from_tag_id: tagId(instance, "llms"), into_tag_id: tagId(instance, "llm") },
      { reason: "Plural." },
    );
    seedProposal(
      instance,
      "topic-merge",
      {
        from_topic_id: topicId(instance, "ML"),
        into_topic_id: topicId(instance, "Machine learning"),
      },
      { reason: "Short form." },
    );

    const bareItem = await paste(instance, "bare", {
      title: "unused",
      noDigest: true,
      pageTitle: "Fetched title",
      postText: textHolding("a bare passage"),
    });

    const bareHighlight = await keepPassage(instance, bareItem, "a bare passage");

    await paste(instance, "bare", {
      title: "unused",
      noDigest: true,
      pageTitle: "Fetched title",
      postText: textHolding("another"),
    });
    gone = await keepLostHighlight(instance, "gone", "gone", "the quoted passage");
    ambiguous = await keepLostHighlight(instance, "ambiguous", "ambiguous");

    bareId = await proposeLost(instance, bareHighlight);
    lostIds = [
      await proposeLost(instance, gone.highlightId),
      await proposeLost(instance, ambiguous.highlightId),
    ];
  });

  after(() => instance.close());

  it("lists the three Proposal kinds newest first", async () => {
    const owner = await readPage(instance);

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["highlight-lost", "highlight-lost", "highlight-lost", "topic-merge", "tag-merge"],
    );
  });

  it("gives a lost Highlight its quote and its Item, and no reason", async () => {
    const [newest] = (await readPage(instance)).proposals;

    assert.deepEqual(JSON.parse(JSON.stringify(newest)), {
      id: lostIds[1],
      kind: "highlight-lost",
      state: "open",
      highlight: {
        id: ambiguous.highlightId,
        quote: "the passage of ambiguous",
        item: { id: ambiguous.itemId, source: "article", title: "Title of ambiguous" },
      },
    });
  });

  it("reads the fetched title when the Item has no Digest", async () => {
    const row = (await readPage(instance)).proposals.find((each) => each.id === bareId);

    assert.equal(
      row?.kind === "highlight-lost" ? row.highlight.item.title : "none",
      "Fetched title",
    );
  });

  it("rejects a lost row once, keeps the Highlight as it was, and lists the row no more", async () => {
    const kept = highlightColumns(instance);
    const id = lostIds[0];

    assert.ok(id !== undefined);

    const first = await instance.send("POST", `/api/proposals/${String(id)}/reject`);
    const second = await instance.send("POST", `/api/proposals/${String(id)}/reject`);
    const accepted = await instance.send("POST", `/api/proposals/${String(id)}/accept`);

    assert.deepEqual([first.status, first.body], [200, JSON.stringify({ state: "rejected" })]);
    assert.deepEqual([second.status, second.body], [409, JSON.stringify({ error: "not-open" })]);
    assert.deepEqual(
      [accepted.status, accepted.body],
      [409, JSON.stringify({ error: "not-open" })],
    );
    assert.deepEqual(highlightColumns(instance), kept);
    assert.equal((await listedIds(instance, "all")).includes(id), false);
  });
});
