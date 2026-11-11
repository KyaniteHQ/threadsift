import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { ImportStateSchema } from "../src/core/import-cursor.ts";
import { Instance } from "./instance.ts";

const xLink = (id: number): string => `https://x.com/someone/status/${String(id)}`;

describe("a call that stops on a library being updated keeps its old cursor", () => {
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

    database.exec("delete from data_steps");
    database
      .prepare("insert into data_step_lease (id, holder, expires_at) values (1, 'another run', ?)")
      .run(Date.now() + 600_000);
    database.close();

    const stopped = await instance.send("POST", "/api/items/batch", {
      links: [{ url: link }, { url: xLink(3500000002) }],
      import: { name, cursor: "new" },
    });

    assert.equal(stopped.status, 503);

    const read = await instance.send("GET", `/api/imports/${name}`);

    assert.equal(ImportStateSchema.parse(JSON.parse(read.body)).cursor, "old");
  });
});
