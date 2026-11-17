import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { ImportStateSchema } from "../src/core/import-contract.ts";
import { ItemReadResponseSchema, UnavailableResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";

const xLink = (id: number): string => `https://x.com/someone/status/${String(id)}`;

describe("a batch refused while a Restore holds the library keeps its old cursor", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 503 for every link, saves none and leaves the cursor where it was", async () => {
    const link = xLink(3500000001);
    const name = "cursor";

    await instance.send("POST", "/api/items/batch", {
      links: [{ url: link }],
      import: { name, cursor: "old" },
    });

    const database = new DatabaseSync(instance.databaseFile);

    database.exec(
      "insert into restores (state, phase, bytes, parts, part_bytes, created_at, updated_at) values ('running', 'tables', 1, 1, 1, 1, 1)",
    );
    database.close();

    const stopped = await instance.send("POST", "/api/items/batch", {
      links: [{ url: link }, { url: xLink(3500000002) }],
      import: { name, cursor: "new" },
    });

    assert.equal(stopped.status, 503);
    assert.equal(UnavailableResponseSchema.parse(JSON.parse(stopped.body)).code, "restoring");
    assert.equal(
      (await instance.read("GET", "/api/items", ItemReadResponseSchema)).counts?.total,
      1,
    );

    const read = await instance.send("GET", `/api/imports/${name}`);

    assert.equal(ImportStateSchema.parse(JSON.parse(read.body)).cursor, "old");
  });
});
