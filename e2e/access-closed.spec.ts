import { expect } from "@playwright/test";
import { z } from "zod";

import {
  cookieHeader,
  ErrorBody,
  createToken,
  expectRefusal,
  getRaw,
  revokeToken,
} from "./access-helpers.ts";
import { SESSION_COOKIE, agentToken, bearer, mainInstance, test } from "./access.ts";
import { newRunId } from "./links.ts";
import { isSpecifiedPublic } from "./public-routes.ts";
import { isContainerTarget } from "./target.ts";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

const OpenApiPaths = z.object({
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
});

test("with no credentials every method and path of the OpenAPI document except the public list answers 401, and so does an unknown path", async ({
  stranger,
}) => {
  const document = await stranger.get("/api/openapi.json", { headers: bearer(agentToken()) });
  const { paths } = OpenApiPaths.parse(await document.json());
  expect(Object.keys(paths)).toEqual(expect.arrayContaining(["/api/items", "/api/tokens/{id}"]));
  const probed: string[] = [];

  for (const [path, operations] of Object.entries(paths)) {
    for (const method of METHODS.filter((name) => name in operations)) {
      if (!isSpecifiedPublic(method, path)) {
        const url = path.replace("{id}", "1");
        await expectRefusal(await stranger.fetch(url, { method }), 401, `${method} ${url}`);
        probed.push(`${method} ${url}`);
      }
    }
  }

  expect(probed.length, "operations probed").toBeGreaterThan(5);
  await expectRefusal(await stranger.get("/api/openapi.json"), 401, "the document itself");
  await expectRefusal(await stranger.get("/api/no-such-route"), 401, "an unknown path");
  await expectRefusal(await stranger.get("/api/tokens/"), 401, "a trailing slash");
  expect((await stranger.get("/api/session")).status(), "a public route").toBe(200);
});

test("a malformed Authorization header gets 400 and a revoked token gets 401, neither falling back to the cookie", async ({
  request,
  stranger,
}) => {
  const created = await createToken(request, `precedence ${newRunId()}`);

  for (const header of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer a b", "Token abc"]) {
    const response = await request.get("/api/items", { headers: { authorization: header } });
    await expectRefusal(response, 400, `a valid cookie and "${header.split(" ")[0]}"`);
  }

  const revoked = await revokeToken(request, created.token.id);
  expect(revoked.status()).toBe(204);

  const afterwards = await request.get("/api/items", { headers: bearer(created.value) });
  await expectRefusal(afterwards, 401, "a revoked token with a valid cookie");
  await expectRefusal(await revokeToken(request, created.token.id), 404, "twice");

  const unknown = await stranger.get("/api/items", { headers: cookieHeader("nonsense") });
  await expectRefusal(unknown, 401, "an unknown session");
});

test("an empty Authorization header gets 400 and a valid cookie does not rescue it", async ({
  request,
}) => {
  test.skip(
    !isContainerTarget(),
    "wrangler 4.156.0 passes an empty Authorization header to the Worker as no header (a raw request with Authorization: '' answered 'Sign in or send an agent token')",
  );
  const { cookies } = await request.storageState();
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value ?? "";

  const answer = await getRaw(mainInstance().url, "/api/items", {
    authorization: "",
    ...cookieHeader(session),
  });

  expect(answer.status, "an empty header and a valid cookie").toBe(400);
  expect(ErrorBody.safeParse(JSON.parse(answer.body)).success, "a JSON { error }").toBe(true);
});

test("a valid token gets 403 on the owner's routes whatever the body, and works on the rest", async ({
  request,
}) => {
  const created = await createToken(request, `owner only ${newRunId()}`);
  const headers = bearer(created.value);

  for (const [method, path] of [
    ["GET", "/api/tokens"],
    ["POST", "/api/tokens"],
    ["DELETE", `/api/tokens/${created.token.id}`],
    ["POST", "/api/logout"],
    ["GET", "/api/tokens/"],
    ["GET", "/api/settings/ai"],
    ["PUT", "/api/settings/ai"],
    ["POST", "/api/settings/ai/verify"],
  ] as const) {
    const response = await request.fetch(path, { method, headers });
    await expectRefusal(response, 403, `a token on ${method} ${path}`);
  }

  expect((await request.get("/api/items", { headers })).status()).toBe(200);
  expect((await revokeToken(request, created.token.id)).status()).toBe(204);
});
