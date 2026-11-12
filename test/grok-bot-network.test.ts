import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NetworkFailure } from "../src/core/ports.ts";
import { nodeNetwork } from "../src/targets/node/network.ts";
import { workerNetwork } from "../src/targets/worker/network.ts";
import { ownPrivateHostName } from "./own-host-name.ts";

const PRIVATE_HOSTS = ["https://127.0.0.1/h", "https://[::1]/h", "https://a.localhost/h"];

describe("each target's post refuses a host that is not public before anything is sent", () => {
  for (const [name, network] of [
    ["the container", nodeNetwork],
    ["the Worker", workerNetwork],
  ] as const) {
    it(`${name} refuses a private literal and a name under .localhost`, async () => {
      await Promise.all(
        PRIVATE_HOSTS.map((url) =>
          assert.rejects(
            network.post(url, "{}", AbortSignal.timeout(2000), {}),
            (error) => error instanceof NetworkFailure && error.reason === "refused",
            url,
          ),
        ),
      );
    });
  }
});

describe("the container's post checks the address a name resolves to when it connects", () => {
  it("refuses this machine's own host name when it resolves only to private addresses", async () => {
    const name = await ownPrivateHostName();

    await assert.rejects(
      nodeNetwork.post(`https://${name}/h`, "{}", AbortSignal.timeout(2000), {}),
      (error) => error instanceof NetworkFailure && error.reason === "refused",
    );
  });

  it("takes an upper-case scheme as https", async () => {
    await assert.rejects(
      nodeNetwork.post("HTTPS://s30a-no-such-host.invalid/h", "{}", AbortSignal.timeout(2000), {}),
      (error) =>
        !(error instanceof Error && "code" in error && error.code === "ERR_INVALID_PROTOCOL"),
    );
  });
});
