import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { BatchResponseSchema } from "../src/core/contract/batch-wire.ts";
import { type ImportState, ImportStateSchema } from "../src/core/contract/import-contract.ts";
import { Instance, type Json } from "./instance.ts";

const linkFor = (cursor: string) => ({
  url: `https://x.com/someone/status/${String(3300000000 + Number(cursor))}`,
});

const storedImport = (answer: Readonly<{ body: string }>) =>
  BatchResponseSchema.parse(JSON.parse(answer.body)).import;

describe("a late batch call cannot move a cursor back over a later run that wrote the same values again", () => {
  let instance: Instance;

  const batch = (body: Json) => instance.send("POST", "/api/items/batch", body);

  const savedState = async (name: string): Promise<ImportState> => {
    const answer = await instance.send("GET", `/api/imports/${name}`);

    assert.equal(answer.status, 200);

    return ImportStateSchema.parse(JSON.parse(answer.body));
  };

  const guarded = (name: string, cursor: string, previous: Readonly<ImportState>) =>
    batch({
      links: [linkFor(cursor)],
      import: { name, cursor, previous: previous.cursor, previousUpdatedAt: previous.updatedAt },
    });

  const moveFromRead = async (name: string, cursor: string) => {
    const read = await savedState(name);
    const moved = await guarded(name, cursor, read);

    assert.equal(moved.status, 200);
    assert.deepEqual(storedImport(moved), { name, cursor });
    assert.ok((await savedState(name)).updatedAt > read.updatedAt);
  };

  const lateCallKeepsCursor = async (name: string) => {
    await batch({ links: [linkFor("20")], import: { name, cursor: "20", previous: null } });

    const finished = await savedState(name);

    await moveFromRead(name, "7");
    await moveFromRead(name, "14");
    await moveFromRead(name, "20");

    const late = await guarded(name, "7", finished);

    assert.equal(late.status, 200);
    assert.deepEqual(storedImport(late), { name, cursor: "20" });
    assert.equal((await savedState(name)).cursor, "20");
  };

  before(async () => {
    instance = await Instance.start({
      fetchers: new URL("./fetchers/batch.mts", import.meta.url).href,
    });
    await instance.setUp();
  });

  after(async () => {
    await instance.close();
  });

  it("keeps a cursor that a later run wrote again when a late call sent from the earlier value arrives", () =>
    lateCallKeepsCursor("list-0123456789abcdef"));

  it("keeps that cursor when every save lands in the same millisecond", (t) => {
    const now = Date.now();

    t.mock.method(Date, "now", () => now);

    return lateCallKeepsCursor("list-1111111111111111");
  });

  it("keeps that cursor when the clock steps back before every save", (t) => {
    let now = Date.now();

    t.mock.method(Date, "now", () => {
      now -= 1000;

      return now;
    });

    return lateCallKeepsCursor("list-2222222222222222");
  });
});
