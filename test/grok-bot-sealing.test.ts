import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
} from "../src/core/grok-bot-contract.ts";
import {
  ADDRESS,
  KEY,
  NEW_KEY,
  PATH,
  SECRET_KEY,
  inOrder,
  saved,
  tested,
  view,
} from "./grok-bot-fixtures.ts";
import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

describe("an Instance with no sealing key, and a row sealed under another key", () => {
  let bare: Instance;
  let other: Instance;

  before(async () => {
    bare = await Instance.start();
    await bare.setUp();
    other = await Instance.start({ secretKey: SECRET_KEY });
    await other.setUp();
    await other.send("PUT", PATH, { webhookUrl: ADDRESS, key: KEY });
  });

  after(async () => {
    await bare.close();
    await other.close();
  });

  it("reads `missing`, refuses Save with `secret-missing`, and tests `secret-missing`", async () => {
    assert.deepEqual(await view(bare), { configured: false, webhookUrl: null, key: "missing" });
    assert.deepEqual(
      await bare.read("PUT", PATH, GrokBotSaveResponseSchema, { webhookUrl: ADDRESS, key: KEY }),
      { kind: "refused", reason: "secret-missing" },
    );
    assert.equal(await tested(bare), "secret-missing");
    assert.deepEqual(saved(bare), []);
  });

  it("reads `unreadable` when the row was sealed under another key, tests `secret-missing`, and takes a new key", async () => {
    const [row] = saved(other);

    assert.ok(row !== undefined);

    const foreign = await Instance.start({ secretKey: "cd".repeat(32) });

    await foreign.setUp();
    exec(
      foreign,
      "insert into grok_bot_settings (id, webhook_url, sealed_key, updated_at) values (1, ?, ?, 1)",
      ADDRESS,
      row.sealed_key,
    );

    assert.deepEqual(await view(foreign), {
      configured: true,
      webhookUrl: ADDRESS,
      key: "unreadable",
    });
    assert.equal(await tested(foreign), "secret-missing");
    assert.equal((await foreign.send("PUT", PATH, { webhookUrl: ADDRESS })).status, 400);
    assert.deepEqual(
      await foreign.read("PUT", PATH, GrokBotViewSchema, { webhookUrl: ADDRESS, key: NEW_KEY }),
      {
        configured: true,
        webhookUrl: ADDRESS,
        key: "usable",
      },
    );
    await foreign.close();
  });
});

describe("Test sends nothing when there is nothing to send to", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers `not-configured` when nothing is saved", async () => {
    assert.equal(await tested(instance), "not-configured");
  });

  it("answers `refused` for each saved address the rule now refuses, inside HTTP 200 and with nothing sent", async () => {
    await instance.send("PUT", PATH, { webhookUrl: ADDRESS, key: KEY });

    await inOrder(
      [
        "http://example.com/hook",
        "https://127.0.0.1/hook",
        "https://[::1]/hook",
        "https://10.0.0.5/hook",
        "https://bot.localhost/hook",
        "https://example.com/hook?key=1",
        "https://example.com/hook?",
        "https://example.com/hook#",
        "https://user:pass@example.com/hook",
      ],
      async (address) => {
        exec(instance, "update grok_bot_settings set webhook_url = ?", address);

        const answer = await instance.send("POST", `${PATH}/test`);

        assert.equal(answer.status, 200, address);
        assert.equal(GrokBotTestSchema.parse(JSON.parse(answer.body)).result, "refused", address);
      },
    );
  });
});
