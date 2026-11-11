import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { entryCount, lines, paste, readLog, seedEntries } from "./log-fixtures.ts";
import { exec, rows } from "./related-fixtures.ts";

const VersionSchema = z.object({ version: z.number() });

const catalogVersion = (instance: Instance): number =>
  rows(instance, VersionSchema, "select version from catalog_version")[0]?.version ?? 0;

describe("the Log records a first Digest, a second Item and a Digest sent again", () => {
  let instance: Instance;
  let first: number;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("starts empty with the time the Log began", async () => {
    const page = await readLog(instance);

    assert.deepEqual(page.entries, []);
    assert.equal(page.next, null);
    assert.ok(page.startedAt > 0 && page.startedAt <= Date.now());
  });

  it("writes topic and ingest for a first Digest in a new Topic, and lists ingest above topic", async () => {
    first = await paste(instance, "first", {
      title: "Ferries on the Bosphorus",
      topic: "İstanbul",
      tags: ["ferries", "Transport", "ferries"],
    });

    assert.deepEqual(await lines(instance), [
      "ingest | Ferries on the Bosphorus | topic: İstanbul | tags: ferries, Transport",
      "topic | İstanbul",
    ]);
  });

  it("writes ingest only for a second Item in that Topic, under another spelling and with no new version", async () => {
    const versionBefore = catalogVersion(instance);

    await paste(instance, "second", { title: "Bridges", topic: "istanbul", tags: ["ferries"] });

    assert.deepEqual((await lines(instance)).slice(0, 1), [
      "ingest | Bridges | topic: İstanbul | tags: ferries",
    ]);
    assert.equal((await lines(instance)).length, 3);
    assert.equal(catalogVersion(instance), versionBefore);
  });

  it("writes digest when a Digest is sent again for the same Item", async () => {
    await paste(instance, "first", {
      title: "Ferries, revised",
      topic: "İstanbul",
      tags: ["ferries"],
    });

    assert.deepEqual((await lines(instance)).slice(0, 1), [
      "digest | Ferries, revised | topic: İstanbul | tags: ferries",
    ]);
  });

  it("leaves an earlier line unchanged when the Digest is replaced, and its links still open the Item and the Topic", async () => {
    await paste(instance, "first", { title: "Moved on", topic: "Elsewhere", tags: ["new"] });

    const { entries } = await readLog(instance);

    const early = entries.find(
      (entry) => entry.action === "ingest" && entry.item.title === "Ferries on the Bosphorus",
    );

    assert.ok(early?.action === "ingest");
    assert.deepEqual(
      [early.item.title, early.topic.name, early.tags],
      ["Ferries on the Bosphorus", "İstanbul", ["ferries", "Transport"]],
    );
    assert.equal(early.item.id, first);
    assert.equal((await instance.send("GET", `/api/items/${String(early.item.id)}`)).status, 200);
    assert.equal((await instance.send("GET", `/api/topics/${early.topic.key}`)).status, 200);
  });

  it("records two publications that race for one new Topic as one topic entry and one version step", async () => {
    const versionBefore = catalogVersion(instance);

    await Promise.all(
      ["one", "two"].map((slug) =>
        paste(instance, `race-${slug}`, { title: slug, topic: "Racing" }),
      ),
    );

    const racing = (await lines(instance)).filter((line) => line === "topic | Racing");

    assert.equal(racing.length, 1);
    assert.equal(catalogVersion(instance), versionBefore + 1);
  });
});

describe("the Log is paged newest first by id", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("holds exactly 50 entries on an exact-full page with no next page", async () => {
    seedEntries(instance, 50, 1000);

    const page = await readLog(instance);

    assert.deepEqual([page.entries.length, page.next], [50, null]);
  });

  it("gives 50 then 1 for 51 entries with equal times, with no repeat and no gap at the boundary", async () => {
    seedEntries(instance, 1, 1000);

    const first = await readLog(instance);
    const next = first.next;

    assert.equal(first.entries.length, 50);
    assert.ok(next !== null);

    const second = await readLog(instance, `?cursor=${next}`);
    const ids = [...first.entries, ...second.entries].map(({ id }) => id);

    assert.equal(second.entries.length, 1);
    assert.equal(second.next, null);
    assert.deepEqual(
      ids,
      Array.from({ length: 51 }, (_, index) => 51 - index),
    );
  });

  it("answers 400 for a cursor that is malformed, not a safe integer or over 16 digits", async () => {
    const cursors = ["abc", "-1", "1.5", "9007199254740993", "12345678901234567", ""];

    const answers = await Promise.all(
      cursors.map((cursor) => instance.send("GET", `/api/log?cursor=${cursor}`)),
    );

    assert.deepEqual(
      answers.map(({ status }) => status),
      cursors.map(() => 400),
    );
  });
});

describe("the Log is read by the owner and an agent token and by nobody signed out", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers the owner's session and an agent token alike, and a signed-out call 401", async () => {
    await paste(instance, "access", { title: "Access" });

    const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "log",
    });

    const owner = await instance.send("GET", "/api/log");
    const agent = await instance.sendWithToken(value, "GET", "/api/log");
    const signedOut = await instance.fetch("/api/log");

    assert.deepEqual([owner.status, agent.status, signedOut.status], [200, 200, 401]);
    assert.equal(agent.body, owner.body);
  });
});

describe("deleting an Item removes its entries and keeps the Topic's", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("removes ingest and digest lines of the Item and keeps the topic line", async () => {
    const id = await paste(instance, "gone", { title: "Gone soon", topic: "Staying" });

    await paste(instance, "gone", { title: "Gone soon, again", topic: "Staying" });
    assert.equal((await lines(instance)).length, 3);
    assert.equal((await instance.send("DELETE", `/api/items/${String(id)}`)).status, 204);
    assert.deepEqual(await lines(instance), ["topic | Staying"]);
  });
});

describe("the Log lists only the actions this release knows", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 200 and leaves out a row with an action of a later release", async () => {
    await paste(instance, "known", { title: "Known", topic: "Staying" });
    exec(instance, "drop trigger log_entries_action_insert");
    exec(instance, "insert into log_entries (at, action) values (1, 'merge')");

    assert.equal((await instance.send("GET", "/api/log")).status, 200);
    assert.equal(entryCount(instance, "merge"), 1);
    assert.deepEqual(
      (await lines(instance)).filter((line) => line.startsWith("merge")),
      [],
    );
  });
});
