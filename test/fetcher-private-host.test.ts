import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { NetworkFailure } from "../src/core/kernel/network.ts";
import { fetcherFile, recordOf } from "./fetcher-record.ts";
import { Instance } from "./instance.ts";
import { ownPrivateHostName } from "./own-host-name.ts";

const MODULE = fetcherFile("claims-every-address.mts");

describe("a link whose host resolves only to addresses the Instance may not reach is refused before any plug-in is asked", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ fetchers: MODULE });
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers refused for this machine's own host name and asks no plug-in", async () => {
    const name = await ownPrivateHostName();

    const address = `http://${name}/guide`;

    const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: address,
    });

    const settled = await instance.settledItem(item.id);

    assert.equal(settled.fetch, "refused");
    assert.deepEqual(await recordOf(MODULE, "asked"), []);
  });

  it("refuses a name under .localhost, a trailing-dot localhost and a loopback literal before any lookup, and asks no plug-in", async () => {
    const [plugin = null] = instance.core.fetchers;

    assert.ok(plugin !== null);

    const refused = [
      "http://a.localhost/guide",
      "http://localhost./guide",
      "http://127.0.0.1/guide",
    ];

    await Promise.all(
      refused.map((url) =>
        assert.rejects(
          plugin.matches(url, AbortSignal.abort()),
          (error) => error instanceof NetworkFailure && error.reason === "refused",
          url,
        ),
      ),
    );

    assert.deepEqual(await recordOf(MODULE, "asked"), []);
  });
});
