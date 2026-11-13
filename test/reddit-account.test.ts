import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { RedditAccountViewSchema } from "../src/core/reddit-account-contract.ts";
import { verdictOf } from "../src/core/reddit-account.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import {
  LATER,
  PATH,
  SECRET_KEY,
  SESSION,
  account,
  connect,
  fetchJob,
  jobs,
  verified,
  view,
} from "./reddit-account-fixtures.ts";
import { exec, until } from "./related-fixtures.ts";

describe("the Reddit account settings are reached only by the signed-in owner", () => {
  let instance: Instance;
  let token = "";

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "reddit-account-access",
    }));
  });

  after(() => instance.close());

  const calls = [
    ["GET", PATH],
    ["PUT", PATH],
    ["DELETE", PATH],
    ["POST", `${PATH}/verify`],
  ] as const;

  it("answers 403 to an agent token on all four routes", async () => {
    const statuses = await Promise.all(
      calls.map(
        async ([method, path]) => (await instance.sendWithToken(token, method, path)).status,
      ),
    );

    assert.deepEqual(statuses, [403, 403, 403, 403]);
  });

  it("answers 401 to a signed-out call on all four routes", async () => {
    const statuses = await Promise.all(
      calls.map(async ([method, path]) => (await instance.fetch(path, { method })).status),
    );

    assert.deepEqual(statuses, [401, 401, 401, 401]);
  });

  it("describes the four calls in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.deepEqual(
      [
        Object.keys(document.paths[PATH] ?? {}).toSorted(),
        Object.keys(document.paths[`${PATH}/verify`] ?? {}),
      ],
      [["delete", "get", "put"], ["post"]],
    );
  });
});

describe("the owner connects and disconnects a Reddit account", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("reads none before anything is saved, and verify says not-configured", async () => {
    assert.deepEqual(await view(instance), { state: "none", secretReady: true });
    assert.equal(await verified(instance), "not-configured");
  });

  it("stores a value sealed, with or without the cookie name in front, and says connected", async () => {
    const saved = await Promise.all(
      [SESSION, `reddit_session=${SESSION}`].map((text) =>
        instance.send("PUT", PATH, { session: text }),
      ),
    );

    assert.deepEqual(
      saved.map(({ status, body }) => [status, RedditAccountViewSchema.parse(JSON.parse(body))]),
      [
        [200, { state: "connected", secretReady: true }],
        [200, { state: "connected", secretReady: true }],
      ],
    );

    const [row, ...rest] = account(instance);

    assert.equal(rest.length, 0);
    assert.equal(row?.state, "connected");
    assert.match(row?.sealed_session ?? "", /^v1\./u);
    assert.ok(!(row?.sealed_session ?? "").includes(SESSION));
  });

  const refused = [
    ["a semicolon", "abc;def"],
    ["a space", "abc def"],
    ["a line break", "abc\ndef"],
    ["an empty value", ""],
    ["only the cookie name", "reddit_session="],
    ["a value over 4,096 characters", "a".repeat(4097)],
  ] as const;

  const refusesValue = (name: string, text: string) => {
    it(`answers 400 for ${name} and keeps the saved account`, async () => {
      const unchanged = account(instance);
      const answer = await instance.send("PUT", PATH, { session: text });

      assert.equal(answer.status, 400);
      assert.deepEqual(account(instance), unchanged);
    });
  };

  for (const [name, text] of refused) refusesValue(name, text);

  it("accepts a value of exactly 4,096 characters", async () => {
    assert.equal((await instance.send("PUT", PATH, { session: "a".repeat(4096) })).status, 200);
  });

  it("removes the row on Disconnect and makes only the jobs that wait for Reddit due at once", async () => {
    fetchJob(instance, 901, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    fetchJob(instance, 902, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    fetchJob(instance, 903, { state: "queued", waitReason: "github-rate-limit", dueAt: LATER });

    const removed = await instance.read("DELETE", PATH, z.looseObject({ state: z.string() }));

    assert.equal(removed.state, "none");
    assert.deepEqual(account(instance), []);

    const settled = await until(
      () => jobs(instance),
      (all) =>
        all
          .filter(({ id }) => id === 901 || id === 902)
          .every((job) => job.wait_reason !== "reddit-limit"),
    );

    assert.ok(settled.every((job) => job.id === 903 || job.next_attempt_at < LATER));
    assert.ok(settled.every((job) => job.id !== 903 || job.next_attempt_at === LATER));
  });
});

describe("no route returns the saved value", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("keeps the value out of the save, read, remove and verify answers and the OpenAPI document", async () => {
    const bodies = [
      (await instance.send("PUT", PATH, { session: SESSION })).body,
      (await instance.send("GET", PATH)).body,
      (await instance.send("DELETE", PATH)).body,
      (await instance.send("POST", `${PATH}/verify`)).body,
      (await instance.send("GET", "/api/openapi.json")).body,
    ];

    assert.ok(bodies.every((body) => !body.includes(SESSION.slice(0, 20))));
  });
});

describe("an Instance with no sealing key, and a row sealed under another key", () => {
  let bare: Instance;
  let other: Instance;

  before(async () => {
    bare = await Instance.start();
    await bare.setUp();
    other = await Instance.start({ secretKey: SECRET_KEY });
    await other.setUp();
    await connect(other, SESSION);
  });

  after(async () => {
    await bare.close();
    await other.close();
  });

  it("reads missing, refuses the value with secret-missing, and saves nothing", async () => {
    assert.deepEqual(await view(bare), { state: "missing", secretReady: false });
    assert.deepEqual(await connect(bare, SESSION), { kind: "refused", reason: "secret-missing" });
    assert.equal(await verified(bare), "secret-missing");
    assert.deepEqual(account(bare), []);
  });

  it("reads unreadable when the sealing key changed, and verify says so without a request", async () => {
    const [row] = account(other);

    assert.ok(row !== undefined);

    const foreign = await Instance.start({ secretKey: "cd".repeat(32) });

    await foreign.setUp();
    exec(
      foreign,
      "insert into reddit_account (id, sealed_session, state, state_at, connected_at) values (1, ?, 'connected', 1, 1)",
      row.sealed_session,
    );

    assert.deepEqual(await view(foreign), { state: "unreadable", secretReady: true });
    assert.equal(await verified(foreign), "unreadable");
    assert.deepEqual(await connect(foreign, SESSION), { state: "connected", secretReady: true });
    await foreign.close();
  });
});

describe("the session check reads Reddit's me.json answer", () => {
  const ME = JSON.stringify({ kind: "t2", data: { name: "an_account", coins: 0 } });

  const cases = [
    ["an account answer", 200, ME, "ok"],
    ["an empty object, which this app reads as no account", 200, "{}", "logged-out"],
    [
      "a t2 answer without a name, which this app reads as no account",
      200,
      '{"kind":"t2","data":{}}',
      "logged-out",
    ],
    ["an HTML page with status 200", 200, "<html></html>", "blocked"],
    ["status 401", 401, "", "logged-out"],
    ["status 403, the network-security page", 403, "<html>blocked</html>", "blocked"],
    ["status 403 with an account answer", 403, ME, "blocked"],
    ["status 429", 429, "", "limited"],
    ["status 500", 500, "", "blocked"],
    ["a redirect", 302, "", "blocked"],
    ["no answer", 0, "", "blocked"],
  ] as const;

  for (const [name, status, text, verdict] of cases) {
    it(`reads ${name} as ${verdict}`, () => {
      assert.equal(verdictOf({ status, text }), verdict);
    });
  }
});
