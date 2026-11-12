import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  ItemReadResponseSchema,
  SavedItemResponseSchema,
  TokenListResponseSchema,
} from "../src/http/schemas.ts";
import { Instance, type Json, PASSWORD } from "./instance.ts";
import {
  type AgentToken,
  type Agents,
  MCP_URL,
  bearer,
  connectBoth,
  createAgentToken,
  mcpRequest,
} from "./mcp-client.ts";
import { DIGEST } from "./mcp-fixtures.ts";

const WRONG_PASSWORD = "not the password of the owner";

const LOGIN_ATTEMPTS_BEFORE_LOCK = 10;

const MALFORMED = ["", "Bearer", "Basic dXNlcjpwYXNz", "Bearer two words"];

describe("/mcp admits only a valid agent token sent in the Authorization header, and checks it on every request", () => {
  let instance: Instance;
  let token: AgentToken;

  const status = async (headers: Readonly<Record<string, string>>, url?: string) =>
    (await mcpRequest(instance, url === undefined ? { headers } : { headers, url })).status;

  const cookie = () => ({ cookie: instance.sessionCookie ?? "" });

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    token = await createAgentToken(instance, "mcp access");
  });

  after(() => instance.close());

  it("answers 401 with a Bearer challenge when no credentials are sent", async () => {
    const answer = await mcpRequest(instance, {});

    assert.equal(answer.status, 401);
    assert.equal(answer.headers.get("www-authenticate"), "Bearer");
  });

  it("answers 401 to the signed-in owner's cookie alone", async () => {
    assert.notEqual(instance.sessionCookie, null);
    assert.equal(await status(cookie()), 401);
  });

  it("answers 400 to a malformed Authorization header, with or without the cookie", async () => {
    const headers = [...MALFORMED, token.value].map((authorization) => ({ authorization }));

    assert.deepEqual(
      await Promise.all(headers.map((each) => status(each))),
      headers.map(() => 400),
    );
    assert.deepEqual(
      await Promise.all(headers.map((each) => status({ ...each, ...cookie() }))),
      headers.map(() => 400),
    );
  });

  it("answers 401 to an unknown token, even with the owner's cookie", async () => {
    const unknown = { authorization: "Bearer tsa_unknownunknownunknownunknownunknown" };

    assert.equal(await status(unknown), 401);
    assert.equal(await status({ ...unknown, ...cookie() }), 401);
  });

  it("takes no credential from the query string or from a cookie", async () => {
    assert.equal(await status({}, `${MCP_URL}?access_token=${token.value}`), 401);
    assert.equal(await status({ cookie: `token=${token.value}` }), 401);
  });

  it("serves a valid token without any cookie and records its use", async () => {
    const answer = await mcpRequest(instance, { headers: bearer(token) });

    assert.equal(answer.status, 200);
    assert.match(await answer.text(), /"name":"search"/u);

    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.notEqual(tokens.find(({ id }) => id === token.id)?.lastUsedAt, null);
  });

  it("refuses a token the owner revoked on the next request of a client that is already connected", async () => {
    const revocable = await createAgentToken(instance, "revoked while connected");
    const agents = await connectBoth(instance, revocable);
    const clients = [agents.legacy, agents.modern];

    await Promise.all(
      clients.map(async (client) => {
        assert.notEqual((await client.listTools()).tools.length, 0);
      }),
    );

    assert.equal(
      (await instance.send("DELETE", `/api/tokens/${String(revocable.id)}`)).status,
      204,
    );

    await Promise.all(
      clients.flatMap((client) => [
        assert.rejects(client.listTools(), /Unknown or revoked agent token/u),
        assert.rejects(
          client.callTool({ name: "search", arguments: {} }),
          /Unknown or revoked agent token/u,
        ),
      ]),
    );

    assert.equal(await status({ ...bearer(revocable), ...cookie() }), 401);
    assert.equal(await status(bearer(token)), 200);
  });

  it("keeps serving agent tokens while the login is locked", async () => {
    await Promise.all(
      Array.from({ length: LOGIN_ATTEMPTS_BEFORE_LOCK }, () =>
        instance.send("POST", "/api/login", { password: WRONG_PASSWORD }),
      ),
    );

    assert.equal((await instance.send("POST", "/api/login", { password: PASSWORD })).status, 429);
    assert.equal(await status(bearer(token)), 200);
  });
});

describe("an agent token calls an /mcp tool only with the scope the tool needs", () => {
  let instance: Instance;
  let itemId: number;
  const connected: Agents[] = [];

  const connect = async (scopes: readonly string[]) => {
    const agents = await connectBoth(
      instance,
      await createAgentToken(instance, "mcp scopes", scopes),
    );

    connected.push(agents);

    return [agents.legacy, agents.modern];
  };

  const total = async () =>
    (await instance.read("GET", "/api/items", ItemReadResponseSchema)).counts?.total;

  const call = (
    clients: Awaited<ReturnType<typeof connect>>,
    name: string,
    args: Readonly<Record<string, Json>>,
  ) => clients.map((client) => client.callTool({ name, arguments: args }));

  const answered = async (answers: ReturnType<typeof call>) =>
    (await Promise.all(answers)).map(({ isError }) => isError === true);

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = (
      await instance.read("POST", "/api/items", SavedItemResponseSchema, {
        url: "https://x.com/someone/status/6000000001",
      })
    ).item.id;
  });

  after(async () => {
    await Promise.all(connected.flatMap(({ legacy, modern }) => [legacy.close(), modern.close()]));
    await instance.close();
  });

  it("lets a token with read search and read, and refuses its add without saving the link", async () => {
    const clients = await connect(["read"]);
    const itemsBefore = await total();
    const link = { url: "https://x.com/someone/status/6000000002" };

    assert.deepEqual(await answered(call(clients, "search", {})), [false, false]);
    assert.deepEqual(await answered(call(clients, "read", { id: itemId })), [false, false]);
    await Promise.all(
      call(clients, "add", link).map((each) => assert.rejects(each, /required "add"/u)),
    );
    assert.equal(await total(), itemsBefore);
  });

  it("lets a token with add alone add a link, and refuses its search and read", async () => {
    const clients = await connect(["add"]);

    assert.deepEqual(
      await answered(call(clients, "add", { url: "https://x.com/someone/status/6000000003" })),
      [false, false],
    );
    await Promise.all(
      [call(clients, "search", {}), call(clients, "read", { id: itemId })]
        .flat()
        .map((each) => assert.rejects(each, /required "read"/u)),
    );
  });

  it("refuses an add that sends a Digest unless the token also holds digest, and saves nothing", async () => {
    const itemsBefore = await total();
    const withDigest = { url: "https://x.com/someone/status/6000000004", digest: DIGEST };

    await Promise.all(
      call(await connect(["read", "add"]), "add", withDigest).map((each) =>
        assert.rejects(each, /required "add digest"/u),
      ),
    );
    assert.equal(await total(), itemsBefore);
    assert.deepEqual(await answered(call(await connect(["add", "digest"]), "add", withDigest)), [
      false,
      false,
    ]);
  });
});
