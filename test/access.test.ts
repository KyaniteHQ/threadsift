import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { SessionStateSchema } from "../src/core/contract/access-wire.ts";
import { ErrorResponseSchema } from "../src/core/contract/error-wire.ts";
import { ConnectStartResponseSchema } from "../src/core/contract/openrouter-contract.ts";
import { Instance, PASSWORD, SETUP_CODE } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { SECRET_KEY } from "./related-fixtures.ts";

const WRONG_SETUP_CODE = "a-wrong-setup-code-of-sixteen";

const WRONG_PASSWORD = "not the password of the owner";

describe("the owner takes a new Instance from first run to a signed-in session with the setup code", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  const sessionState = async () =>
    (await instance.read("GET", "/api/session", SessionStateSchema)).state;

  it("asks for setup while no owner exists and refuses the library", async () => {
    assert.deepEqual(await instance.read("GET", "/api/session", SessionStateSchema), {
      state: "setup",
      code: "set",
    });
    assert.equal((await instance.send("GET", "/api/items")).status, 401);
  });

  it("answers a HEAD of the session check as its GET without the body", async () => {
    assert.deepEqual(await instance.send("HEAD", "/api/session"), { status: 200, body: "" });
  });

  it("refuses a wrong setup code and creates no owner", async () => {
    const refused = await instance.send("POST", "/api/setup", {
      code: WRONG_SETUP_CODE,
      password: PASSWORD,
    });

    assert.equal(refused.status, 403);
    assert.equal(ErrorResponseSchema.parse(JSON.parse(refused.body)).code, "wrong-setup-code");
    assert.equal(await sessionState(), "setup");
  });

  it("creates the owner with the right setup code and signs the owner in", async () => {
    const created = await instance.send("POST", "/api/setup", {
      code: SETUP_CODE,
      password: PASSWORD,
    });

    assert.equal(created.status, 204);
    assert.equal(await sessionState(), "signed-in");
    assert.equal((await instance.send("GET", "/api/items")).status, 200);
  });

  it("takes no second owner once one exists", async () => {
    const second = await instance.send("POST", "/api/setup", {
      code: SETUP_CODE,
      password: WRONG_PASSWORD,
    });

    assert.equal(second.status, 409);
  });

  it("signs out and refuses the library again, to a Basic header with a Bearer challenge", async () => {
    assert.equal((await instance.send("POST", "/api/logout")).status, 204);
    assert.equal(await sessionState(), "signed-out");
    assert.equal((await instance.send("GET", "/api/items")).status, 401);

    const basic = await instance.fetch("/api/items", { headers: { authorization: "Basic abc" } });

    assert.equal(basic.status, 401);
    assert.equal(basic.headers.get("www-authenticate"), "Bearer");
  });

  it("refuses a wrong password and stays signed out", async () => {
    const refused = await instance.send("POST", "/api/login", { password: WRONG_PASSWORD });

    assert.equal(refused.status, 403);
    assert.equal(ErrorResponseSchema.parse(JSON.parse(refused.body)).code, "wrong-password");
    assert.equal(await sessionState(), "signed-out");
  });

  it("signs in again with the right password", async () => {
    assert.equal((await instance.send("POST", "/api/login", { password: PASSWORD })).status, 204);
    assert.equal(await sessionState(), "signed-in");
    assert.equal((await instance.send("GET", "/api/items")).status, 200);
  });
});

type Row = readonly [
  method: string,
  path: string,
  status: number,
  allow: readonly string[] | null,
  header?: readonly [name: string, value: string],
];

const UNMATCHED: readonly Row[] = [
  ["POST", "/api/nonsense", 404, null],
  ["GET", "/api/tokens/1/nonsense", 404, null],
  ["PATCH", "/api/items/1", 405, ["GET", "HEAD", "DELETE"]],
  ["PUT", "/api/tokens/1", 405, ["PATCH", "DELETE"]],
  ["GET", "/api/logout", 405, ["POST"]],
  ["OPTIONS", "/api/ai-tasks/1/result", 405, ["POST"]],
  ["POST", "/api/settings/ai/openrouter/callback", 405, ["GET"]],
  ["DELETE", "/api/settings/ai/openrouter/start", 405, ["POST"], ["cache-control", "no-store"]],
  [
    "DELETE",
    "/api/files/items/1/a.png",
    405,
    ["GET", "HEAD"],
    ["x-content-type-options", "nosniff"],
  ],
  ["PUT", "/api/export/1/download", 405, ["GET", "HEAD"], ["x-content-type-options", "nosniff"]],
  ["GET", "/api/files/nothing", 404, null, ["x-content-type-options", "nosniff"]],
];

function allowedBy(response: Readonly<Response>): string[] | null {
  return response.headers.get("allow")?.split(", ").toSorted() ?? null;
}

const expected = ([, , status, allow, header]: Row) => ({
  status,
  allow: allow?.toSorted() ?? null,
  header: header?.[1],
});

describe("a request that matches no route answers 404, or 405 with Allow, and an anonymous caller gets 401", () => {
  let instance: Instance;
  let callers: readonly Readonly<Record<string, string>>[];

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    const all = await createAgentToken(instance, "all", ["read", "add", "digest", "delete"]);
    const addOnly = await createAgentToken(instance, "add", ["add"]);

    callers = [
      { cookie: instance.sessionCookie ?? "" },
      { authorization: `Bearer ${all.value}` },
      { authorization: `Bearer ${addOnly.value}` },
    ];
  });

  after(() => instance.close());

  const answered = async (
    headers: Readonly<Record<string, string>>,
    [method, path, , , header]: Row,
  ) => {
    const response = await instance.fetch(path, { method, headers });

    return {
      status: response.status,
      allow: allowedBy(response),
      header: header === undefined ? undefined : response.headers.get(header[0]),
    };
  };

  it("gives the owner and each token the same answer, with the cache headers of the path", async () => {
    const answers = await Promise.all(
      callers.map((headers) => Promise.all(UNMATCHED.map((row) => answered(headers, row)))),
    );

    assert.deepEqual(
      answers,
      callers.map(() => UNMATCHED.map((row) => expected(row))),
    );
  });

  it("gives a caller with no credential 401 and no Allow on the same requests", async () => {
    assert.deepEqual(
      await Promise.all(UNMATCHED.map((row) => answered({}, row))),
      UNMATCHED.map((row) =>
        Object.assign(expected(row), {
          status: 401,
          allow: null,
        }),
      ),
    );
  });

  it("answers a method that /share lacks with 405 and the methods of /share, to a caller with no credential too", async () => {
    const answers = await Promise.all(
      ["PUT", "DELETE"].map((method) => instance.fetch("/share", { method })),
    );

    assert.deepEqual(
      answers.map((response) => [response.status, allowedBy(response)]),
      [
        [405, ["GET", "HEAD", "POST"]],
        [405, ["GET", "HEAD", "POST"]],
      ],
    );
  });
});

describe("a HEAD on the OpenRouter callback", () => {
  const CALLBACK = "/api/settings/ai/openrouter/callback";
  let instance: Instance;

  const attempts = () => {
    const database = new DatabaseSync(instance.databaseFile, { readOnly: true });

    try {
      return database.prepare("select count(*) as n from openrouter_connect_transactions").get()?.[
        "n"
      ];
    } finally {
      database.close();
    }
  };

  before(async () => {
    instance = await Instance.start({ publicOrigin: "http://localhost", secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 405 with Allow: GET, leaves the started attempt unclaimed, and gives a POST the same Allow", async () => {
    const started = await instance.send(
      "POST",
      "/api/settings/ai/openrouter/start",
      { model: "openai/gpt-4o-mini", revision: 0 },
      { "sec-fetch-site": "same-origin" },
    );

    assert.equal(started.status, 201);

    const { authorizationUrl } = ConnectStartResponseSchema.parse(JSON.parse(started.body));
    const state = new URL(authorizationUrl).searchParams.get("state");
    const headers = { cookie: instance.sessionCookie ?? "" };

    const head = await instance.fetch(`${CALLBACK}?code=a-code&state=${state}`, {
      method: "HEAD",
      headers,
    });

    const post = await instance.fetch(CALLBACK, { method: "POST", headers });

    assert.deepEqual(
      [head, post].map((response) => [
        response.status,
        allowedBy(response),
        response.headers.get("cache-control"),
      ]),
      [
        [405, ["GET"], "no-store"],
        [405, ["GET"], "no-store"],
      ],
    );
    assert.equal(attempts(), 1);
  });
});
