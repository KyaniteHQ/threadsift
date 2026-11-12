import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
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
});
