import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import { type AgentToken, MCP_URL, bearer, createAgentToken, mcpRequest } from "./mcp-client.ts";

const HOSTED = "https://threadsift.example.com";

const WITH_PORT = "http://localhost:8080";

type Case = readonly [url: string, origin: string | undefined];

function statuses(instance: Instance, token: AgentToken, cases: readonly Case[]) {
  return Promise.all(
    cases.map(async ([url, origin]) => {
      const headers = origin === undefined ? bearer(token) : { ...bearer(token), origin };

      return (await mcpRequest(instance, { url, headers })).status;
    }),
  );
}

function without(urls: readonly string[]): Case[] {
  return urls.map((url) => [url, undefined]);
}

function hostStatuses(
  instance: Instance,
  token: AgentToken,
  hosts: readonly string[],
  url = MCP_URL,
) {
  return Promise.all(
    hosts.map(
      async (host) =>
        (await mcpRequest(instance, { url, headers: { ...bearer(token), host } })).status,
    ),
  );
}

function refusedAll(cases: readonly Case[]): number[] {
  return cases.map(() => 403);
}

describe("/mcp refuses a Host or Origin that is not the Instance's own, whatever the credentials", () => {
  let local: Instance;
  let localToken: AgentToken;
  let hosted: Instance;
  let hostedToken: AgentToken;
  let withPort: Instance;
  let withPortToken: AgentToken;

  before(async () => {
    local = await Instance.start();
    await local.setUp();
    localToken = await createAgentToken(local, "local");
    hosted = await Instance.start({ publicOrigin: HOSTED });
    await hosted.setUp();
    hostedToken = await createAgentToken(hosted, "hosted");
    withPort = await Instance.start({ publicOrigin: WITH_PORT });
    await withPort.setUp();
    withPortToken = await createAgentToken(withPort, "with port");
  });

  after(async () => {
    await local.close();
    await hosted.close();
    await withPort.close();
  });

  it("accepts the loopback hosts on any port when no public origin is set", async () => {
    assert.deepEqual(
      await statuses(
        local,
        localToken,
        without([
          "http://localhost/mcp",
          "http://localhost:8080/mcp",
          "http://127.0.0.1:3000/mcp",
          "http://[::1]:3000/mcp",
          "http://LOCALHOST/mcp",
        ]),
      ),
      [200, 200, 200, 200, 200],
    );
  });

  it("accepts a loopback Host that spells out port 80 or an edge port", async () => {
    const hosts = ["localhost:80", "127.0.0.1:80", "[::1]:80", "localhost:1", "localhost:65535"];

    assert.deepEqual(await hostStatuses(local, localToken, hosts), [200, 200, 200, 200, 200]);
  });

  it("refuses a Host that carries credentials, a path, a query, a fragment or a bad port", async () => {
    const hosts = [
      "user@localhost",
      "localhost:80@evil.example",
      "localhost/evil",
      "localhost?x=1",
      "localhost#x",
      "localhost:",
      "localhost:80:80",
      "localhost:123456",
      "localhost:abc",
      "localhost:0",
      "localhost:00000",
      "localhost:65536",
      "localhost:99999",
      "[::1]:0",
    ];

    assert.deepEqual(await hostStatuses(local, localToken, hosts), refusedAll(without(hosts)));
  });

  it("refuses a Host that is not loopback, with no Origin and with a matching attacker Origin", async () => {
    const hosts = [
      "http://evil.example/mcp",
      "http://localhost.evil.example/mcp",
      "http://127.0.0.1.evil.example/mcp",
      "https://threadsift.example.com/mcp",
      "http://192.168.1.20:8080/mcp",
    ];

    const withOwnOrigin: Case[] = hosts.map((url) => [url, new URL(url).origin]);

    assert.deepEqual(await statuses(local, localToken, without(hosts)), refusedAll(without(hosts)));
    assert.deepEqual(await statuses(local, localToken, withOwnOrigin), refusedAll(withOwnOrigin));
  });

  it("refuses a Host header that differs from the request address", async () => {
    const refused = await mcpRequest(local, {
      headers: { ...bearer(localToken), host: "evil.example" },
    });

    assert.equal(refused.status, 403);
  });

  it("refuses an Origin that is not loopback, is null, is malformed or only starts like a loopback host", async () => {
    const cases: Case[] = [
      "https://evil.example",
      "null",
      "not a url",
      "http://localhost.evil.example",
      "http://127.0.0.1.evil.example:3000",
      "http://localhost/path",
      "chrome-extension://abcdefgh",
    ].map((origin) => [MCP_URL, origin]);

    assert.deepEqual(await statuses(local, localToken, cases), refusedAll(cases));
  });

  it("accepts a loopback Origin and a request with no Origin", async () => {
    assert.deepEqual(
      await statuses(local, localToken, [
        [MCP_URL, "http://localhost:5173"],
        [MCP_URL, "http://127.0.0.1"],
        [MCP_URL, undefined],
      ]),
      [200, 200, 200],
    );
  });

  it("refuses an unlisted Host before it asks for credentials", async () => {
    assert.equal((await mcpRequest(local, { url: "http://evil.example/mcp" })).status, 403);
  });

  it("accepts only the configured host when a public origin is set", async () => {
    assert.deepEqual(
      await statuses(
        hosted,
        hostedToken,
        without([
          "https://threadsift.example.com/mcp",
          "https://THREADSIFT.example.com/mcp",
          "https://threadsift.example.com:8443/mcp",
          "https://evil.example/mcp",
          "http://localhost/mcp",
          "https://sub.threadsift.example.com/mcp",
        ]),
      ),
      [200, 200, 403, 403, 403, 403],
    );
  });

  it("treats a Host that spells out the default port of the public origin as the bare Host", async () => {
    const hosts = [
      "threadsift.example.com:443",
      "Threadsift.Example.com:443",
      "threadsift.example.com:0443",
      "threadsift.example.com",
      "threadsift.example.com:80",
      "threadsift.example.com:8443",
      "threadsift.example.com:0",
      "threadsift.example.com:99999",
    ];

    assert.deepEqual(
      await hostStatuses(hosted, hostedToken, hosts, `${HOSTED}/mcp`),
      [200, 200, 200, 200, 403, 403, 403, 403],
    );
  });

  it("accepts only the whole configured origin when a public origin is set", async () => {
    const url = "https://threadsift.example.com/mcp";

    assert.deepEqual(
      await statuses(hosted, hostedToken, [
        [url, HOSTED],
        [url, "http://threadsift.example.com"],
        [url, "https://threadsift.example.com:8443"],
        [url, "https://evil.example"],
        [url, "https://evil.example/mcp"],
        [url, "null"],
        [url, "http://localhost"],
        ["https://evil.example/mcp", "https://evil.example"],
      ]),
      [200, 403, 403, 403, 403, 403, 403, 403],
    );
  });

  it("does not drop a port that is not the default of the public origin's scheme", async () => {
    assert.deepEqual(
      await hostStatuses(
        withPort,
        withPortToken,
        ["localhost:8080", "localhost:80", "localhost"],
        `${WITH_PORT}/mcp`,
      ),
      [200, 403, 403],
    );
  });

  it("matches the port of a public origin that has one", async () => {
    assert.deepEqual(
      await statuses(withPort, withPortToken, [
        ["http://localhost:8080/mcp", undefined],
        ["http://localhost:8080/mcp", WITH_PORT],
        ["http://localhost:9999/mcp", undefined],
        ["http://localhost/mcp", undefined],
        ["http://localhost:8080/mcp", "http://localhost:9999"],
        ["http://127.0.0.1:8080/mcp", undefined],
      ]),
      [200, 200, 403, 403, 403, 403],
    );
  });
});
