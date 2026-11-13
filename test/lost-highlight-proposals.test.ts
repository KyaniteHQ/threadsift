import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import {
  keepLostHighlight,
  keepPassage,
  proposalRows,
  proposeLost,
  readPage,
  textHolding,
} from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, paste, rows } from "./related-fixtures.ts";

const ColumnsSchema = z.object({
  id: z.number(),
  item_id: z.number(),
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  hint: z.number(),
  projection: z.number(),
  status: z.string(),
  start: z.number().nullable(),
});

const highlightColumns = (instance: Instance) =>
  rows(instance, ColumnsSchema, "select * from highlights order by id");

const listedIds = async (instance: Instance) =>
  (await readPage(instance)).proposals.map(({ id }) => id);

describe("lost-Highlight Proposals beside Tag and Topic rows", () => {
  let instance: Instance;
  let token: string;
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
    exec(
      instance,
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) select 'tag-merge', (select id from tags where name = 'llms'), (select id from tags where name = 'llm'), 'Plural.', 'open', 1",
    );
    exec(
      instance,
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) select 'topic-merge', (select id from topics where name = 'ML'), (select id from topics where name = 'Machine learning'), 'Short form.', 'open', 1",
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
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "lost-highlights",
    }));
  });

  after(() => instance.close());

  it("lists the three kinds in one order to the owner and an agent token, and 401 signed out", async () => {
    const owner = await readPage(instance);
    const agent = await instance.sendWithToken(token, "GET", "/api/proposals");
    const signedOut = await instance.fetch("/api/proposals");

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["highlight-lost", "highlight-lost", "highlight-lost", "topic-merge", "tag-merge"],
    );
    assert.deepEqual([agent.status, signedOut.status], [200, 401]);
    assert.equal(agent.body, JSON.stringify(owner));
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

  it("refuses a token and a signed-out call an Accept and a Reject, and reports an unknown id", async () => {
    const [newest] = lostIds.toReversed();

    assert.ok(newest !== undefined);

    const answers = await Promise.all(
      ["accept", "reject"].map(async (action) => {
        const path = `/api/proposals/${String(newest)}/${action}`;

        return [
          (await instance.sendWithToken(token, "POST", path)).status,
          (await instance.fetch(path, { method: "POST" })).status,
          (await instance.send("POST", `/api/proposals/999999/${action}`)).status,
          (await instance.send("POST", `/api/proposals/abc/${action}`)).status,
        ];
      }),
    );

    assert.deepEqual(answers, [
      [403, 401, 404, 400],
      [403, 401, 404, 400],
    ]);
    assert.deepEqual(
      proposalRows(instance).map(({ state }) => state),
      ["open", "open", "open", "open", "open"],
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
    assert.equal((await listedIds(instance)).includes(id), false);
  });
});
