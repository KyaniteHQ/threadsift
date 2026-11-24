import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { UnavailableResponseSchema } from "../src/core/contract/error-wire.ts";
import { ImportStateSchema } from "../src/core/contract/import-contract.ts";
import {
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../src/core/contract/restore-contract.ts";
import { saveUnresolved } from "../src/features/paste/core/item-save.ts";
import { Instance } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { redditAddressOf, threadOf } from "./reader-thread-fixtures.ts";
import { holdLibrary } from "./restore-fixtures.ts";

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

    holdLibrary(instance, "running", null);

    const stopped = await instance.send("POST", "/api/items/batch", {
      links: [{ url: link }, { url: xLink(3500000002) }],
      import: { name, cursor: "new" },
    });

    assert.equal(stopped.status, 503);
    assert.equal(UnavailableResponseSchema.parse(JSON.parse(stopped.body)).code, "restoring");
    assert.equal(await instance.itemTotal(), 1);

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
    holdLibrary(instance, "failed", "gave-up", "check");

    const refused = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(refused.status, 409);
    assert.equal(RestoreErrorSchema.parse(JSON.parse(refused.body)).code, "restore-open");

    holdLibrary(instance, "failed", "no-manifest", "check");

    const accepted = await instance.send("POST", "/api/restore", { bytes: 1, parts: 1 });

    assert.equal(accepted.status, 201);
    const started = StartedRestoreSchema.parse(JSON.parse(accepted.body));
    const status = await instance.read("GET", "/api/restore", RestoreStatusSchema);

    assert.equal(status.state, "uploading");
    assert.deepEqual([started.id, status.id], [2, 2]);
  });
});

describe("an Item is refused through every door while a Restore holds the library", () => {
  let instance: Instance;
  let agentToken: string;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    agentToken = (await createAgentToken(instance, "agent")).value;
  });

  after(() => instance.close());

  it("answers 503 restoring and stores nothing through each door", async () => {
    const known = xLink(3600000010);
    const page = { markdown: "A page.", title: "A page" };

    await instance.send("POST", "/api/items", { url: known });
    holdLibrary(instance, "running", null);

    const stored = await instance.itemTotal();

    const doors = [
      {
        door: "owner Paste",
        send: () => instance.send("POST", "/api/items", { url: xLink(3600000001) }),
      },
      {
        door: "Paste with a page",
        send: () => instance.send("POST", "/api/items", { url: "https://held.test/page", page }),
      },
      {
        door: "Paste with a Reddit page",
        send: () => instance.send("POST", "/api/items", { url: redditAddressOf("held2"), page }),
      },
      {
        door: "Paste with content",
        send: () =>
          instance.send("POST", "/api/items", {
            url: redditAddressOf("held3"),
            content: threadOf("held3"),
          }),
      },
      {
        door: "agent token Paste",
        send: () =>
          instance.sendWithToken(agentToken, "POST", "/api/items", { url: xLink(3600000002) }),
      },
      {
        door: "batch of new links",
        send: () =>
          instance.send("POST", "/api/items/batch", {
            links: [{ url: xLink(3600000003) }, { url: xLink(3600000004) }],
          }),
      },
      {
        door: "batch of a known link",
        send: () => instance.send("POST", "/api/items/batch", { links: [{ url: known }] }),
      },
    ];

    for (const { door, send } of doors) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each door answers on its own, in the order listed.
      const answer = await send();

      assert.equal(answer.status, 503, door);
      assert.equal(
        UnavailableResponseSchema.parse(JSON.parse(answer.body)).code,
        "restoring",
        door,
      );
    }

    assert.equal(await instance.itemTotal(), stored);
  });

  it("stores no failed short link while a Restore holds the library and stores it once the run is no longer holding", async () => {
    const short = "https://t.co/heldfailure";

    const unresolved = () =>
      saveUnresolved(instance.core, {
        paste: { address: short, addedByToken: null },
        link: { source: "other", kind: "link", normalizedUrl: short },
        fetched: { status: "unresolved" },
        existing: "refresh",
      });

    holdLibrary(instance, "running", null);

    const stored = await instance.itemTotal();

    await assert.rejects(unresolved(), /^Error: CHECK constraint failed: guards_hold$/u);
    assert.equal(await instance.itemTotal(), stored);

    holdLibrary(instance, "failed", "no-manifest");

    const saved = await unresolved();

    assert.equal(saved?.kind === "saved" && saved.created, true);
    assert.equal(await instance.itemTotal(), stored + 1);
  });

  it("refuses a Paste while a failed run that gave up holds the library and accepts it after a failure that does not", async () => {
    const link = { url: xLink(3600000007) };

    holdLibrary(instance, "failed", "gave-up");

    const stored = await instance.itemTotal();
    const refused = await instance.send("POST", "/api/items", link);

    assert.equal(refused.status, 503);
    assert.equal(UnavailableResponseSchema.parse(JSON.parse(refused.body)).code, "restoring");
    assert.equal(await instance.itemTotal(), stored);

    holdLibrary(instance, "failed", "no-manifest");

    const accepted = await instance.send("POST", "/api/items", link);

    assert.equal(accepted.status, 201);
    assert.equal(await instance.itemTotal(), stored + 1);
  });
});
