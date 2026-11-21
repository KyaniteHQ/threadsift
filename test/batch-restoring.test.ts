import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { UnavailableResponseSchema } from "../src/core/contract/error-wire.ts";
import { ImportStateSchema } from "../src/core/contract/import-contract.ts";
import { ItemReadResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { RestoreErrorSchema, StartedRestoreSchema } from "../src/core/contract/restore-contract.ts";
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

describe("a Restore that failed and still holds the library refuses a second upload", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 409 restore-open for a gave-up run and accepts an upload after a refusal", async () => {
    const database = new DatabaseSync(instance.databaseFile);

    database.exec(
      "insert into restores (state, phase, failure, bytes, parts, part_bytes, created_at, updated_at) values ('failed', 'check', 'gave-up', 1, 1, 1, 1, 1)",
    );

    const refused = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(refused.status, 409);
    assert.equal(RestoreErrorSchema.parse(JSON.parse(refused.body)).code, "restore-open");

    database.exec("update restores set failure = 'no-manifest'");
    database.close();

    const accepted = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(accepted.status, 201);
    assert.equal(StartedRestoreSchema.parse(JSON.parse(accepted.body)).id, 2);
  });
});
