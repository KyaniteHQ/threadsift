import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ImportStateSchema } from "../src/core/contract/import-contract.ts";
import {
  RestoreErrorSchema,
  RestoreStatusSchema,
  StartedRestoreSchema,
} from "../src/core/contract/restore-contract.ts";
import { Instance } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { redditAddressOf, threadOf } from "./reader-thread-fixtures.ts";
import { holdLibrary, refusal } from "./restore-fixtures.ts";
import {
  closing,
  HELD,
  heldThenReleased,
  ownerLibrary,
  PASTE_HELD,
  recordsOf,
  savedUnresolved,
  throughDoors,
} from "./restoring-fixtures.ts";
import {
  claimedJobs,
  grokBotWhileHeld,
  heldMerge,
  lastAttemptWhileHeld,
  owedDigestJobs,
  weeklyClaims,
} from "./restoring-runs.ts";

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

    assert.deepEqual(refusal(stopped), PASTE_HELD);
    assert.equal(await instance.itemTotal(), 1);

    const read = await instance.send("GET", `/api/imports/${name}`);

    assert.equal(ImportStateSchema.parse(JSON.parse(read.body)).cursor, "old");
  });

  it("answers 503 for a batch of refused hosts only and leaves the cursor where it was", async () => {
    const name = "refused-hosts";
    const links = [{ url: "http://localhost/private" }];

    holdLibrary(instance, "failed", "no-manifest");
    await instance.send("POST", "/api/items/batch", { links, import: { name, cursor: "old" } });
    holdLibrary(instance, "running", null);

    const stopped = await instance.send("POST", "/api/items/batch", {
      links,
      import: { name, cursor: "new" },
    });
    const read = await instance.send("GET", `/api/imports/${name}`);

    assert.deepEqual(refusal(stopped), PASTE_HELD);
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

      assert.deepEqual(refusal(answer), PASTE_HELD, door);
    }

    assert.equal(await instance.itemTotal(), stored);
  });

  it("stores no failed short link while a Restore holds the library and stores it once the run is no longer holding", async () => {
    const short = "https://t.co/heldfailure";

    const unresolved = () => savedUnresolved(instance, short);

    holdLibrary(instance, "running", null);

    const stored = await instance.itemTotal();

    await assert.rejects(unresolved(), /^Error: CHECK constraint failed: guards_restore$/u);
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

    assert.deepEqual(refusal(refused), PASTE_HELD);
    assert.equal(await instance.itemTotal(), stored);

    holdLibrary(instance, "failed", "no-manifest");

    const accepted = await instance.send("POST", "/api/items", link);

    assert.equal(accepted.status, 201);
    assert.equal(await instance.itemTotal(), stored + 1);
  });
});

describe("an owner write that adds a record the zip may hold is refused while a Restore holds the library", () => {
  it("answers 503 restoring through each door and adds no record, and takes each write once the run no longer holds", async () => {
    const library = await ownerLibrary();
    const stored = recordsOf(library.instance);
    const [held, released] = await closing(library.instance, () =>
      heldThenReleased(library.instance, () => throughDoors(library)),
    );

    for (const [door, answer] of held.answers) {
      assert.deepEqual(refusal(answer), HELD, door);
    }
    assert.deepEqual(held.records, stored);
    assert.deepEqual(
      released.answers.map(([door, answer]) => [door, answer.status]),
      released.answers.map(([door, , success]) => [door, success]),
    );
    assert.deepEqual(
      released.records.map((count, table) => count > (stored[table] ?? 0)),
      released.records.map(() => true),
    );
  });

  it("answers a Grok Bot Verify and a Grok Bot save 503 restoring and starts no AI task", async () => {
    const { verify, save, tasks } = await grokBotWhileHeld();

    assert.deepEqual([refusal(verify), refusal(save), tasks], [HELD, HELD, 0]);
  });
});

describe("the background work that adds a record the zip may hold waits while a Restore holds the library", () => {
  it("claims no due job while held and claims it once the run no longer holds", async () => {
    assert.deepEqual(await claimedJobs(), ["none", "digest"]);
  });

  it("queues a claimed job on its last attempt again with its attempts unchanged when the hold refuses its write", async () => {
    assert.deepEqual(await lastAttemptWhileHeld(), { claimed: "digest", open: 1, failed: 0 });
  });

  it("opens no owed Digest job while held and opens it once the run no longer holds", async () => {
    assert.deepEqual(await owedDigestJobs(), [0, 1]);
  });

  it("claims no week of the weekly check while held and claims it once the run no longer holds", async () => {
    const [held, released] = await weeklyClaims();

    assert.deepEqual([held, released > 0], [0, true]);
  });

  it("moves no Tag of an accepted merge while held and finishes the merge once after", async () => {
    const [held, released] = await heldMerge();

    assert.deepEqual(held, { moved: 100, open: 1, merged: [] });
    assert.deepEqual([released.moved, released.open, released.merged.length], [150, 0, 1]);
  });
});
