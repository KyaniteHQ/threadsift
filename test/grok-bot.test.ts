import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  GrokBotSaveResponseSchema,
  GrokBotViewSchema,
  KEY_NEEDED,
} from "../src/core/grok-bot-contract.ts";
import {
  ADDRESS,
  KEY,
  NEW_KEY,
  OTHER_ADDRESS,
  PATH,
  SECRET_KEY,
  saved,
  view,
} from "./grok-bot-fixtures.ts";
import { Instance } from "./instance.ts";

describe("Save seals the key, never returns it, and asks for a new key with a new address", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("starts with nothing set", async () => {
    assert.deepEqual(await view(instance), { configured: false, webhookUrl: null, key: "none" });
  });

  it("stores the address and a sealed key, and answers a view that holds no key", async () => {
    const answer = await instance.send("PUT", PATH, { webhookUrl: ADDRESS, key: KEY });
    const [row] = saved(instance);

    assert.equal(answer.status, 200);
    assert.deepEqual(GrokBotSaveResponseSchema.parse(JSON.parse(answer.body)), {
      configured: true,
      webhookUrl: ADDRESS,
      key: "usable",
    });
    assert.ok(!answer.body.includes(KEY));
    assert.equal(row?.webhook_url, ADDRESS);
    assert.ok(row !== undefined && row.sealed_key !== KEY && row.sealed_key.startsWith("v1."));
  });

  it("holds the key in no database file and in no read of the view", async () => {
    const main = await readFile(instance.databaseFile);
    const names = await readdir(dirname(instance.databaseFile));
    const walName = `${basename(instance.databaseFile)}-wal`;

    const wal = names.includes(walName)
      ? await readFile(`${instance.databaseFile}-wal`)
      : Buffer.alloc(0);

    assert.ok(main.length > 0);
    assert.ok(!main.includes(KEY) && !wal.includes(KEY));
    assert.ok(!(await instance.send("GET", PATH)).body.includes(KEY));
  });

  it("keeps the saved key when the address is the same and no key is sent", async () => {
    const [stored] = saved(instance);

    assert.deepEqual(await instance.read("PUT", PATH, GrokBotViewSchema, { webhookUrl: ADDRESS }), {
      configured: true,
      webhookUrl: ADDRESS,
      key: "usable",
    });
    assert.deepEqual(saved(instance), [stored]);
  });

  it("answers 400 with a reason of its own for a new address with no key, a bad address and a bad key", async () => {
    const noKey = await instance.send("PUT", PATH, { webhookUrl: OTHER_ADDRESS });

    const badAddress = await instance.send("PUT", PATH, {
      webhookUrl: "http://example.com/hook",
      key: KEY,
    });

    const badKey = await instance.send("PUT", PATH, { webhookUrl: ADDRESS, key: "has a space" });

    const tooLong = await instance.send("PUT", PATH, {
      webhookUrl: ADDRESS,
      key: "k".repeat(4097),
    });

    assert.deepEqual(
      [noKey, badAddress, badKey, tooLong].map(({ status }) => status),
      [400, 400, 400, 400],
    );
    assert.equal(noKey.body, JSON.stringify({ error: KEY_NEEDED }));

    const reasons = [noKey, badAddress, badKey, tooLong].map(
      ({ body }) => z.object({ error: z.string() }).parse(JSON.parse(body)).error,
    );

    assert.equal(new Set(reasons).size, 4);
    assert.ok(reasons.every((reason) => !reason.includes("has a space")));
    assert.deepEqual(
      saved(instance).map((row) => row.webhook_url),
      [ADDRESS],
    );
  });

  it("asks for a key on the first save", async () => {
    await instance.send("DELETE", PATH);

    const answer = await instance.send("PUT", PATH, { webhookUrl: ADDRESS });

    assert.equal(answer.status, 400);
    assert.equal(answer.body, JSON.stringify({ error: KEY_NEEDED }));
    assert.deepEqual(saved(instance), []);
  });

  it("replaces the address and key together", async () => {
    await instance.send("PUT", PATH, { webhookUrl: ADDRESS, key: KEY });

    const [first] = saved(instance);

    await instance.send("PUT", PATH, { webhookUrl: OTHER_ADDRESS, key: NEW_KEY });

    const [second, ...others] = saved(instance);

    assert.deepEqual(others, []);
    assert.equal(second?.webhook_url, OTHER_ADDRESS);
    assert.notEqual(second?.sealed_key, first?.sealed_key);
  });

  it("removes the row and answers 204 each time", async () => {
    const first = await instance.send("DELETE", PATH);
    const second = await instance.send("DELETE", PATH);

    assert.deepEqual([first.status, second.status], [204, 204]);
    assert.deepEqual(saved(instance), []);
    assert.deepEqual(await view(instance), { configured: false, webhookUrl: null, key: "none" });
  });
});

describe("the address and key rules apply to every Save", () => {
  let instance: Instance;

  const save = (webhookUrl: string, key: string) => instance.send("PUT", PATH, { webhookUrl, key });

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("takes keys of 1 and of 4,096 characters, and stores an address with an upper-case scheme in its canonical form", async () => {
    assert.deepEqual(
      [(await save(ADDRESS, "k")).status, (await save(ADDRESS, "k".repeat(4096))).status],
      [200, 200],
    );
    assert.equal((await save("HTTPS://Example.com/hook", KEY)).status, 200);
    assert.deepEqual(
      saved(instance).map((row) => row.webhook_url),
      ["https://example.com/hook"],
    );
    assert.deepEqual(
      await instance.read("PUT", PATH, GrokBotViewSchema, {
        webhookUrl: "HTTPS://EXAMPLE.com/hook",
      }),
      { configured: true, webhookUrl: "https://example.com/hook", key: "usable" },
    );
  });

  it("answers 400 and keeps the saved row for a key that is empty, too long, or not printable ASCII without a space", async () => {
    const [stored] = saved(instance);

    const keys = ["", "k".repeat(4097), "a b", "a\nb", "a\u0007b", "k\u20ACy", "k\u00FCy"];
    const answers = await Promise.all(keys.map((key) => save(OTHER_ADDRESS, key)));

    assert.deepEqual(
      answers.map(({ status }) => status),
      keys.map(() => 400),
    );
    assert.ok(answers.every(({ body }, at) => keys[at] === "" || !body.includes(keys[at] ?? "")));

    assert.deepEqual(saved(instance), [stored]);
  });

  it("answers 400 and keeps the saved row for an address that is not public https with no credentials, query or fragment", async () => {
    const [stored] = saved(instance);

    const addresses = [
      "http://example.com/hook",
      "ftp://example.com/hook",
      "not an address",
      "https://127.0.0.1/hook",
      "https://192.168.1.4/hook",
      "https://[::1]/hook",
      "https://bot.localhost/hook",
      "https://example.com/hook?key=1",
      "https://example.com/hook?",
      "https://example.com/hook#part",
      "https://example.com/hook#",
      "https://user:pass@example.com/hook",
    ];

    const answers = await Promise.all(addresses.map((address) => save(address, KEY)));

    assert.deepEqual(
      answers.map(({ status }) => status),
      addresses.map(() => 400),
    );
    assert.deepEqual(saved(instance), [stored]);
  });
});
