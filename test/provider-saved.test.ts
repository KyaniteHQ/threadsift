import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/contract/proposal-contract.ts";
import { botInstance, saveBot, selectGrokBot } from "./bot-task-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { saveProvider } from "./library-fixtures.ts";

describe("the Proposals page reports the Provider selected in settings", () => {
  it("reports a model Provider with and without Grok Bot settings", async () => {
    const instance = await Instance.start({ secretKey: SECRET_KEY });

    try {
      await instance.setUp();
      const page = () => instance.read("GET", "/api/proposals", ProposalPageSchema);

      assert.equal((await page()).provider, false);
      await saveProvider(instance);
      assert.equal((await page()).provider, true);
      await saveBot(instance);
      assert.equal((await page()).provider, true);
      await selectGrokBot(instance);
      assert.equal((await page()).provider, true);
    } finally {
      await instance.close();
    }
  });

  it("makes the Proposals page answer provider false until Grok Bot is chosen and true after", async () => {
    const instance = await botInstance();

    try {
      const before = await instance.read("GET", "/api/proposals", ProposalPageSchema);

      assert.equal(before.provider, false);

      await selectGrokBot(instance);

      const after = await instance.read("GET", "/api/proposals", ProposalPageSchema);

      assert.equal(after.provider, true);
    } finally {
      await instance.close();
    }
  });
});
