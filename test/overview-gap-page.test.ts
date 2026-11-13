import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { writingAfterTheFirstRead } from "./interrupted-database.ts";
import { proposalRows, readPage } from "./lost-highlight-fixtures.ts";
import {
  addTopics,
  gapRows,
  gapsOf,
  sole,
  pasteTopics,
  proposeGap,
  queueOverview,
  storePage,
} from "./overview-gap-fixtures.ts";
import { SECRET_KEY, exec, paste } from "./related-fixtures.ts";

const READ_BY_THE_PAGE = ['"proposals"', '"topics"', '"items"', '"digests"', '"topic_pages"'];

const readsThePage = (sql: string) => READ_BY_THE_PAGE.some((table) => sql.includes(table));

const synchronously = (write: () => void) => () => {
  write();

  return Promise.resolve();
};

describe("overview-gap rows beside the other kinds", () => {
  let instance: Instance;
  let token: string;
  let made: Readonly<Record<string, readonly number[]>>;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    made = await pasteTopics(instance, {
      Behind: ["b1", "b2", "b3"],
      Merged: ["m1"],
      "Merged into": ["i1"],
    });
    exec(
      instance,
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) select 'topic-merge', (select id from topics where name = 'Merged'), (select id from topics where name = 'Merged into'), 'Same subject.', 'open', 1",
    );
    proposeGap(instance, "Behind");
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "overview-gap-page",
    }));
  });

  after(() => instance.close());

  it("lists the row to the owner and to an agent token in the same shape, and 401 signed out", async () => {
    const owner = await readPage(instance);
    const agent = await instance.sendWithToken(token, "GET", "/api/proposals");
    const signedOut = await instance.fetch("/api/proposals");

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["overview-gap", "topic-merge"],
    );
    assert.equal(agent.body, JSON.stringify(owner));
    assert.equal(signedOut.status, 401);
    assert.deepEqual(JSON.parse(JSON.stringify(sole(gapsOf(owner)))), {
      id: 2,
      kind: "overview-gap",
      state: "open",
      topic: { key: "behind", name: "Behind", uncovered: 3, items: 3 },
    });
  });

  it("counts the uncovered Items live: a Topic page that covers some of them, and an Item deleted", async () => {
    const [first] = made["Behind"] ?? [];

    assert.ok(first !== undefined);
    storePage(instance, "Behind", { builtFrom: [first] });
    assert.deepEqual(sole(gapsOf(await readPage(instance))).topic, {
      key: "behind",
      name: "Behind",
      uncovered: 2,
      items: 3,
    });

    const [, second] = made["Behind"] ?? [];

    assert.equal((await instance.send("DELETE", `/api/items/${String(second)}`)).status, 204);
    assert.deepEqual(sole(gapsOf(await readPage(instance))).topic, {
      key: "behind",
      name: "Behind",
      uncovered: 1,
      items: 2,
    });
    assert.deepEqual(
      gapRows(instance).map(({ state }) => state),
      ["open"],
    );
  });

  it("hides the row while an overview run is open for the Topic and shows it again when the run is done", async () => {
    const [first] = made["Behind"] ?? [];

    assert.ok(first !== undefined);
    queueOverview(instance, first);
    assert.deepEqual(gapsOf(await readPage(instance)), []);
    exec(instance, "update jobs set state = 'done' where kind = 'topic_overview'");
    assert.equal(gapsOf(await readPage(instance)).length, 1);
  });
});

describe("the Proposals list filters overview-gap rows before the page limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    addTopics(
      instance,
      Array.from({ length: 62 }, (_, at) => ({
        id: at + 1,
        name: `topic${String(at + 1).padStart(2, "0")}`,
        items: 1,
        from: at + 1,
      })),
    );
    exec(
      instance,
      "insert into proposals (kind, topic_id, reason, state, created_at) select 'overview-gap', id, 'plain-check', 'open', 1 from topics order by id",
    );
    exec(
      instance,
      "insert into topic_pages (topic_id, overview, revision, built_from, failure, updated_at) select topics.id, 'O', 1, json_array(json_object('item', topics.id, 'digest', topics.id)), null, 1 from topics where topics.id > 51",
    );
  });

  after(() => instance.close());

  it("fills the page with 50 eligible rows and pages on by the last id", async () => {
    const first = await readPage(instance);

    assert.equal(first.proposals.length, 50);
    assert.equal(first.proposals[0]?.id, 51);
    assert.equal(first.next, String(first.proposals.at(-1)?.id));

    const second = await readPage(instance, `?cursor=${first.next ?? ""}`);

    assert.deepEqual(
      second.proposals.map(({ id }) => id),
      [1],
    );
    assert.equal(second.next, null);
  });
});

describe("the Proposals page reads an overview-gap row and its counts in one snapshot", () => {
  let instance: Instance;
  let made: Readonly<Record<string, readonly number[]>>;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    made = await pasteTopics(instance, {
      Mover: ["m1", "m2"],
      Remover: ["r1", "r2"],
      Replacer: ["p1", "p2"],
      Receiving: ["v1"],
    });
    storePage(instance, "Replacer", { builtFrom: [made["Replacer"]?.[0] ?? 0] });
  });

  after(() => instance.close());

  const readDuring = (write: () => Promise<void>) =>
    instance.readThrough(
      writingAfterTheFirstRead(instance.databaseFile, readsThePage, write),
      "/api/proposals",
      ProposalPageSchema,
    );

  const moveAway = (topic: string) => {
    exec(
      instance,
      "update items set topic_id = (select id from topics where name = 'Receiving') where topic_id = (select id from topics where name = ?)",
      topic,
    );
  };

  it("shows the row with the counts it had when the read began when its Items move to another Topic right after", async () => {
    proposeGap(instance, "Mover");

    const listed = await readPage(instance);

    const during = await readDuring(
      synchronously(() => {
        moveAway("Mover");
      }),
    );

    assert.deepEqual(sole(gapsOf(listed)).topic, {
      key: "mover",
      name: "Mover",
      uncovered: 2,
      items: 2,
    });
    assert.deepEqual(during, listed);
    assert.deepEqual(gapsOf(await readPage(instance)), []);
    exec(instance, "delete from proposals");
  });

  it("lists the row when its Topic is deleted right after the read began", async () => {
    proposeGap(instance, "Remover");

    const listed = await readPage(instance);

    const during = await readDuring(
      synchronously(() => {
        moveAway("Remover");
        exec(
          instance,
          "delete from log_entries where topic_id = (select id from topics where name = 'Remover')",
        );
        exec(instance, "delete from topics where name = 'Remover'");
      }),
    );

    assert.equal(gapsOf(listed).length, 1);
    assert.deepEqual(during, listed);
    assert.deepEqual(proposalRows(instance), []);
  });

  it("shows the counts from before a Digest is replaced when it is replaced right after the read began", async () => {
    proposeGap(instance, "Replacer");

    const listed = await readPage(instance);

    const during = await readDuring(async () => {
      await paste(instance, "p1", { title: "p1 again", topic: "Replacer" });
    });

    assert.deepEqual(sole(gapsOf(listed)).topic.uncovered, 1);
    assert.deepEqual(during, listed);
    assert.deepEqual(sole(gapsOf(await readPage(instance))).topic.uncovered, 2);
  });
});
