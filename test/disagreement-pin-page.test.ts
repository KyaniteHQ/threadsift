import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { proposeDisagreement, seedDigested, seedTopics } from "./disagreement-fixtures.ts";
import {
  acceptStatus,
  pinRows,
  replaceDigestToken,
  topicDisagreements,
} from "./disagreement-pin-fixtures.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, exec, rows } from "./related-fixtures.ts";

describe("the Topic page lists the disagreement Pins that still hold", () => {
  let instance: Instance;
  let token: string;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading", 2: "Other", 3: "Empty" });
    seedDigested(instance, [
      { id: 1, topic: 1, title: "First title" },
      { id: 2, topic: 1, title: "Second title" },
      { id: 3, topic: 2 },
    ]);
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "disagreement-pin-page",
    }));
    await acceptStatus(instance, proposeDisagreement(instance, [1, 2]));
  });

  after(() => instance.close());

  it("lists the Pin with live titles to the owner and to an agent token, and an empty list for a Topic with none", async () => {
    const [pin] = pinRows(instance);

    const wanted = [
      {
        id: pin?.id,
        reason: "They give opposite advice.",
        items: [
          { id: 1, title: "First title" },
          { id: 2, title: "Second title" },
        ],
      },
    ];

    assert.deepEqual(await topicDisagreements(instance, "reading"), wanted);

    const agent = await instance.sendWithToken(token, "GET", "/api/topics/reading");

    assert.deepEqual(
      z.object({ disagreements: z.unknown() }).parse(JSON.parse(agent.body)).disagreements,
      wanted,
    );
    assert.deepEqual(await topicDisagreements(instance, "empty"), []);
    assert.deepEqual(await topicDisagreements(instance, "other"), []);

    exec(instance, "update digests set title = 'Renamed' where item_id = 1");
    assert.equal((await topicDisagreements(instance, "reading"))[0]?.items[0]?.title, "Renamed");
    exec(instance, "update digests set title = 'First title' where item_id = 1");
  });

  it("hides the entry after either Item gets a new Digest or leaves the Topic, keeps the Pin, and shows it again when the Items are back with the same Digests", async () => {
    const original = rows(
      instance,
      z.object({ task_id: z.number() }),
      "select task_id from digests where item_id = 2",
    )[0]?.task_id;

    replaceDigestToken(instance, 2, 900);
    assert.deepEqual(await topicDisagreements(instance, "reading"), []);
    exec(instance, "update digests set task_id = ? where item_id = 2", original ?? 0);
    assert.equal((await topicDisagreements(instance, "reading")).length, 1);

    exec(instance, "update items set topic_id = 2 where id = 2");
    assert.deepEqual(await topicDisagreements(instance, "reading"), []);
    assert.deepEqual(await topicDisagreements(instance, "other"), []);
    exec(instance, "update items set topic_id = 1 where id = 2");
    assert.equal((await topicDisagreements(instance, "reading")).length, 1);
    assert.equal(pinRows(instance).length, 1);
  });

  it("answers the closed OpenAPI route with the new field", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.match(JSON.stringify(document.paths["/api/topics/{key}"]), /disagreements/u);
  });
});

describe("the Topic page shows at most 20 entries, newest first", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(
      instance,
      Array.from({ length: 46 }, (_, at) => ({ id: at + 1, topic: 1 })),
    );
  });

  after(() => instance.close());

  it("lists 20 of 23 Pins, the newest first", async () => {
    for (let pair = 0; pair < 23; pair += 1) {
      exec(
        instance,
        "insert into pins (kind, from_key, from_name, from_item_id, into_item_id, from_digest, into_digest, created_at) values ('items-disagree', ?, 'Reason.', ?, ?, ?, ?, ?)",
        `${String(pair * 2 + 1)}:${String(pair * 2 + 2)}`,
        pair * 2 + 1,
        pair * 2 + 2,
        pair * 2 + 1,
        pair * 2 + 2,
        pair,
      );
    }

    const listed = await topicDisagreements(instance, "reading");

    assert.equal(listed.length, 20);
    assert.deepEqual(
      listed.map(({ items }) => items[0]?.id),
      Array.from({ length: 20 }, (_, at) => (22 - at) * 2 + 1),
    );
  });
});

describe("deleting either Item removes the Pin that names it", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(
      instance,
      Array.from({ length: 4 }, (_, at) => ({ id: at + 1, topic: 1 })),
    );
    await acceptStatus(instance, proposeDisagreement(instance, [1, 2]));
    await acceptStatus(instance, proposeDisagreement(instance, [3, 4]));
  });

  after(() => instance.close());

  it("removes the Pin of the first Item and the Pin of the second Item, and leaves the others", async () => {
    assert.equal(pinRows(instance).length, 2);
    assert.equal((await instance.send("DELETE", "/api/items/1")).status, 204);
    assert.deepEqual(
      pinRows(instance).map(({ from_key: key }) => key),
      ["3:4"],
    );
    assert.equal((await instance.send("DELETE", "/api/items/4")).status, 204);
    assert.deepEqual(pinRows(instance), []);
    assert.deepEqual(await topicDisagreements(instance, "reading"), []);
  });
});
